"""
Tâche quotidienne : avance chapitres/dates (En cours) + alerte MP admin (Payant).
Logger : [work_tracking]
"""

from __future__ import annotations

import datetime
import logging
from typing import Any, Optional

from config import config
from supabase_client import _get_supabase
from work_tracking_dates import (
    compute_next_release_date_by_mode,
    increment_chapter,
    is_release_date_passed,
    resolve_stored_date_value,
)
from work_tracking_render import render_work_publication_message, work_publication_to_saved_inputs

logger = logging.getLogger("work_tracking")


async def _send_admin_dm(bot, message: str) -> bool:
    admin_id = config.WORK_TRACKING_ADMIN_DISCORD_USER_ID
    if not admin_id or not bot:
        return False
    try:
        user = await bot.fetch_user(admin_id)
        await user.send(message)
        logger.info("[work_tracking] Alerte MP envoyée à admin id=%s", admin_id)
        return True
    except Exception as e:
        logger.warning("[work_tracking] Échec MP admin : %s", e)
        return False


async def _patch_discord_message(thread_id: str, message_id: str, content: str) -> bool:
    import aiohttp
    from discord_api import _discord_patch_json

    if not thread_id or not message_id:
        return False
    try:
        async with aiohttp.ClientSession() as session:
            status, data = await _discord_patch_json(
                session,
                f"/channels/{thread_id}/messages/{message_id}",
                {"content": content or " "},
            )
        if status >= 400:
            logger.warning("[work_tracking] PATCH Discord échoué %s : %s", status, data)
            return False
        return True
    except Exception as e:
        logger.warning("[work_tracking] PATCH Discord exception : %s", e)
        return False


def _should_send_paid_alert(wp: dict) -> bool:
    last = wp.get("last_paid_alert_at")
    if not last:
        return True
    try:
        last_dt = datetime.datetime.fromisoformat(str(last).replace("Z", "+00:00"))
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=datetime.timezone.utc)
        elapsed = datetime.datetime.now(datetime.timezone.utc) - last_dt
        return elapsed.total_seconds() >= 86_400
    except Exception:
        return True


def _advance_ongoing_row(wp: dict) -> Optional[dict]:
    date_next_raw = wp.get("date_next_release") or ""
    if not is_release_date_passed(date_next_raw):
        return None

    resolved = resolve_stored_date_value(date_next_raw)
    weekdays = wp.get("release_weekdays") or []
    released_ch = (wp.get("chapter_next_release") or wp.get("progress_current") or "").strip()
    new_next_ch = increment_chapter(released_ch) if released_ch else ""
    monthly = bool(wp.get("release_monthly"))
    new_next_date = compute_next_release_date_by_mode(resolved, list(weekdays), monthly) or resolved

    updated = dict(wp)
    updated["chapter_next_release"] = new_next_ch
    updated["date_next_release"] = new_next_date
    if released_ch:
        updated["progress_current"] = released_ch
    return updated


async def run_work_tracking_refresh_once(bot=None) -> dict[str, int]:
    """
    Exécute un passage de contrôle suivi d'œuvres.
    Retourne des compteurs {advanced, paid_alerts, errors}.
    """
    sb = _get_supabase()
    stats = {"advanced": 0, "paid_alerts": 0, "errors": 0}
    if not sb:
        logger.debug("[work_tracking] Supabase indisponible")
        return stats

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    try:
        ongoing_res = (
            sb.table("work_publications")
            .select("*")
            .eq("chapter_control_enabled", True)
            .eq("work_status", "ongoing")
            .execute()
        )
        for wp in ongoing_res.data or []:
            try:
                advanced = _advance_ongoing_row(wp)
                if not advanced:
                    continue

                post_res = (
                    sb.table("published_posts")
                    .select("id, thread_id, message_id, discord_url")
                    .eq("id", wp.get("published_post_id"))
                    .limit(1)
                    .execute()
                )
                post = (post_res.data or [None])[0]
                if not post:
                    continue

                payload = {
                    **{k: advanced[k] for k in wp.keys() if k in advanced},
                    "last_auto_refresh_at": now_iso,
                    "updated_at": now_iso,
                }
                sb.table("work_publications").update(payload).eq("id", wp["id"]).execute()

                saved_inputs = work_publication_to_saved_inputs(advanced)
                new_content = render_work_publication_message(advanced)
                sb.table("published_posts").update({
                    "content": new_content,
                    "saved_inputs": saved_inputs,
                    "updated_at": now_iso,
                }).eq("id", post["id"]).execute()

                patched = await _patch_discord_message(
                    str(post.get("thread_id") or ""),
                    str(post.get("message_id") or ""),
                    new_content,
                )
                if patched:
                    sb.table("work_publication_refresh_log").insert({
                        "work_publication_id": wp["id"],
                        "action": "chapter_advanced",
                        "old_values": {
                            "date_next_release": wp.get("date_next_release"),
                            "chapter_next_release": wp.get("chapter_next_release"),
                        },
                        "new_values": {
                            "date_next_release": advanced.get("date_next_release"),
                            "chapter_next_release": advanced.get("chapter_next_release"),
                        },
                    }).execute()
                    stats["advanced"] += 1
            except Exception as row_err:
                stats["errors"] += 1
                logger.error("[work_tracking] Erreur ongoing %s : %s", wp.get("id"), row_err)

        paid_res = (
            sb.table("work_publications")
            .select("*")
            .eq("work_status", "ongoing_paid")
            .execute()
        )
        for wp in paid_res.data or []:
            try:
                if not is_release_date_passed(wp.get("date_next_release") or ""):
                    continue
                if not _should_send_paid_alert(wp):
                    continue

                title = (wp.get("title") or "Œuvre").strip()
                post_res = (
                    sb.table("published_posts")
                    .select("discord_url")
                    .eq("id", wp.get("published_post_id"))
                    .limit(1)
                    .execute()
                )
                post_row = (post_res.data or [None])[0] or {}
                url = post_row.get("discord_url") or ""
                msg = (
                    f"**Suivi d'œuvres — action requise**\n"
                    f"**{title}** : tag Incomplet, date de sortie dépassée.\n"
                    f"Vérifie le calendrier manuellement. Si la diffusion est redevenue complète, "
                    f"retire le tag Incomplet pour réactiver le contrôle auto.\n"
                    f"{url}".strip()
                )
                if await _send_admin_dm(bot, msg):
                    sb.table("work_publications").update({
                        "last_paid_alert_at": now_iso,
                        "updated_at": now_iso,
                    }).eq("id", wp["id"]).execute()
                    stats["paid_alerts"] += 1
            except Exception as row_err:
                stats["errors"] += 1
                logger.error("[work_tracking] Erreur paid %s : %s", wp.get("id"), row_err)

    except Exception as e:
        logger.error("[work_tracking] Erreur globale refresh : %s", e, exc_info=True)
        stats["errors"] += 1

    logger.info(
        "[work_tracking] Refresh terminé : %d avancé(s), %d alerte(s) payant, %d erreur(s)",
        stats["advanced"], stats["paid_alerts"], stats["errors"],
    )
    return stats
