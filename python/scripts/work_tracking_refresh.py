"""
Tâche quotidienne : avance chapitres/dates (En cours) + alertes MP admin.
Logger : [work_tracking]
"""

from __future__ import annotations

import datetime
import logging
from typing import Any, Optional
from zoneinfo import ZoneInfo

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
PARIS_TZ = ZoneInfo("Europe/Paris")
_DIGEST_SENT_KEY = "work_tracking_last_digest_date"


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


def _split_discord_message(text: str, limit: int = 2000) -> list[str]:
    """Découpe un message pour respecter la limite Discord (2000 caractères)."""
    trimmed = (text or "").strip()
    if not trimmed:
        return []
    if len(trimmed) <= limit:
        return [trimmed]

    chunks: list[str] = []
    current = ""
    for line in trimmed.split("\n"):
        candidate = f"{current}\n{line}".strip() if current else line
        if len(candidate) <= limit:
            current = candidate
            continue
        if current:
            chunks.append(current)
        while len(line) > limit:
            chunks.append(line[:limit])
            line = line[limit:]
        current = line
    if current:
        chunks.append(current)
    return chunks


async def _send_admin_dm_rest(message: str) -> bool:
    """Envoie un MP admin via l'API REST Discord (script CLI sans bot connecté)."""
    import aiohttp
    from discord_api import _discord_post_json

    admin_id = config.WORK_TRACKING_ADMIN_DISCORD_USER_ID
    if not admin_id:
        logger.error("[work_tracking] WORK_TRACKING_ADMIN_DISCORD_USER_ID manquant")
        return False
    if not config.PUBLISHER_DISCORD_TOKEN:
        logger.error("[work_tracking] PUBLISHER_DISCORD_TOKEN manquant")
        return False

    try:
        async with aiohttp.ClientSession() as session:
            status, data, _ = await _discord_post_json(
                session,
                "/users/@me/channels",
                {"recipient_id": str(admin_id)},
            )
            if status >= 400:
                logger.warning("[work_tracking] Création canal MP échouée %s : %s", status, data)
                return False

            channel_id = data.get("id")
            if not channel_id:
                return False

            for chunk in _split_discord_message(message):
                status, data, _ = await _discord_post_json(
                    session,
                    f"/channels/{channel_id}/messages",
                    {"content": chunk},
                )
                if status >= 400:
                    logger.warning("[work_tracking] Envoi MP échoué %s : %s", status, data)
                    return False

        logger.info("[work_tracking] MP rattrapage envoyé à admin id=%s", admin_id)
        return True
    except Exception as e:
        logger.warning("[work_tracking] Échec MP rattrapage : %s", e)
        return False


async def _send_digest_dm(message: str, bot=None) -> bool:
    """Envoie le digest : API REST en priorité, bot Discord en secours."""
    if await _send_admin_dm_rest(message):
        return True
    if bot:
        return await _send_admin_dm(bot, message)
    return False


def _created_at_paris_date(raw: Any) -> Optional[datetime.date]:
    """Convertit created_at Supabase en date calendaire Europe/Paris."""
    if not raw:
        return None
    try:
        dt = datetime.datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt.astimezone(PARIS_TZ).date()
    except Exception:
        return None


def _format_chapter_release_lines(
    releases: list[dict[str, str]], *, show_release_date: bool = False
) -> str:
    lines = []
    for item in releases:
        title = (item.get("title") or "Œuvre").strip()
        chapter = (item.get("chapter") or "").strip()
        release_date = (item.get("release_date") or "").strip()
        url = (item.get("url") or "").strip()
        line = f"• **{title}**"
        if chapter:
            line += f" — Ch. **{chapter}**"
        if show_release_date and release_date:
            try:
                d = datetime.date.fromisoformat(release_date)
                line += f" ({d.strftime('%d/%m/%Y')})"
            except ValueError:
                pass
        if url:
            line += f"\n  {url}"
        lines.append(line)
    return "\n".join(lines)


def _digest_sent_today(sb, day: datetime.date) -> bool:
    try:
        res = (
            sb.table("app_config")
            .select("value")
            .eq("key", _DIGEST_SENT_KEY)
            .limit(1)
            .execute()
        )
        row = (res.data or [None])[0]
        return (row or {}).get("value") == day.isoformat()
    except Exception as e:
        logger.warning("[work_tracking] Lecture état digest : %s", e)
        return False


def _mark_digest_sent(sb, day: datetime.date) -> None:
    try:
        sb.table("app_config").upsert(
            {"key": _DIGEST_SENT_KEY, "value": day.isoformat()},
            on_conflict="key",
        ).execute()
    except Exception as e:
        logger.warning("[work_tracking] Enregistrement état digest : %s", e)


async def _send_chapter_release_dm(bot, releases: list[dict[str, str]], header: str) -> bool:
    if not releases:
        return False
    body = _format_chapter_release_lines(releases)
    msg = f"{header}\n{body}".strip()
    return await _send_admin_dm(bot, msg)


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
    """Rattrape toutes les sorties passées (pas une seule par passage)."""
    updated = dict(wp)
    weekdays = list(wp.get("release_weekdays") or [])
    monthly = bool(wp.get("release_monthly"))
    changed = False

    for _ in range(500):
        date_next_raw = updated.get("date_next_release") or ""
        if not is_release_date_passed(date_next_raw):
            break

        resolved = resolve_stored_date_value(date_next_raw)
        released_ch = (
            updated.get("chapter_next_release") or updated.get("progress_current") or ""
        ).strip()
        new_next_ch = increment_chapter(released_ch) if released_ch else ""
        new_next_date = compute_next_release_date_by_mode(resolved, weekdays, monthly) or resolved

        updated["chapter_next_release"] = new_next_ch
        updated["date_next_release"] = new_next_date
        if released_ch:
            updated["progress_current"] = released_ch
        changed = True

    return updated if changed else None


async def _fetch_discord_url(sb, published_post_id: Any) -> str:
    if not published_post_id:
        return ""
    post_res = (
        sb.table("published_posts")
        .select("discord_url")
        .eq("id", published_post_id)
        .limit(1)
        .execute()
    )
    post_row = (post_res.data or [None])[0] or {}
    return (post_row.get("discord_url") or "").strip()


async def run_work_tracking_refresh_once(bot=None) -> dict[str, int]:
    """
    Exécute un passage de contrôle suivi d'œuvres.
    Retourne des compteurs {advanced, paid_alerts, errors}.
    Les sorties sont notifiées uniquement via le digest matinal (09:00).
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
                if not patched:
                    logger.warning(
                        "[work_tracking] PATCH Discord échoué pour %s — log digest quand même",
                        wp.get("id"),
                    )

                sb.table("work_publication_refresh_log").insert({
                    "work_publication_id": wp["id"],
                    "action": "chapter_advanced",
                    "old_values": {
                        "date_next_release": wp.get("date_next_release"),
                        "chapter_next_release": wp.get("chapter_next_release"),
                        "progress_current": wp.get("progress_current"),
                    },
                    "new_values": {
                        "date_next_release": advanced.get("date_next_release"),
                        "chapter_next_release": advanced.get("chapter_next_release"),
                        "progress_current": advanced.get("progress_current"),
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
                url = await _fetch_discord_url(sb, wp.get("published_post_id"))
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


async def run_work_tracking_yesterday_digest(bot=None, *, force: bool = False) -> int:
    """
    MP unique à 09:00 : rappel des sorties de la veille (Europe/Paris).
    Aucun MP lors du refresh de minuit (avancement silencieux).
    """
    sb = _get_supabase()
    if not sb:
        logger.error("[work_tracking] Digest : Supabase indisponible")
        return 0

    today = datetime.datetime.now(PARIS_TZ).date()
    yesterday = today - datetime.timedelta(days=1)
    yesterday_iso = yesterday.isoformat()

    if not force and _digest_sent_today(sb, today):
        logger.info("[work_tracking] Digest déjà envoyé pour %s", today.isoformat())
        return 0

    since = (today - datetime.timedelta(days=7)).isoformat()

    try:
        log_res = (
            sb.table("work_publication_refresh_log")
            .select("work_publication_id, old_values, created_at")
            .eq("action", "chapter_advanced")
            .gte("created_at", f"{since}T00:00:00")
            .execute()
        )
    except Exception as e:
        logger.error("[work_tracking] Erreur lecture refresh_log digest : %s", e)
        return 0

    seen: set[str] = set()
    releases: list[dict[str, str]] = []

    for row in log_res.data or []:
        wp_id = str(row.get("work_publication_id") or "")
        if not wp_id or wp_id in seen:
            continue

        old = row.get("old_values") or {}
        release_date = resolve_stored_date_value(old.get("date_next_release") or "")
        if release_date != yesterday_iso:
            continue

        chapter = (old.get("chapter_next_release") or old.get("progress_current") or "").strip()
        if not chapter:
            continue

        seen.add(wp_id)

        try:
            wp_res = (
                sb.table("work_publications")
                .select("title, published_post_id")
                .eq("id", wp_id)
                .limit(1)
                .execute()
            )
            wp = (wp_res.data or [None])[0] or {}
            url = await _fetch_discord_url(sb, wp.get("published_post_id"))
            releases.append({
                "title": (wp.get("title") or "Œuvre").strip(),
                "chapter": chapter,
                "url": url,
            })
        except Exception as row_err:
            logger.warning("[work_tracking] Digest : œuvre %s ignorée : %s", wp_id, row_err)

    if not releases:
        logger.info(
            "[work_tracking] Digest : aucune sortie pour la veille (%s)",
            yesterday_iso,
        )
        _mark_digest_sent(sb, today)
        return 0

    releases.sort(key=lambda r: r.get("title", "").lower())
    header = f"📅 **Suivi d'œuvres — sorties du {yesterday.strftime('%d/%m/%Y')}**"
    body = _format_chapter_release_lines(releases)
    message = f"{header}\n{body}".strip()

    sent = await _send_digest_dm(message, bot)
    if sent:
        _mark_digest_sent(sb, today)
        logger.info(
            "[work_tracking] Digest veille envoyé (%d œuvre(s) pour %s)",
            len(releases),
            yesterday_iso,
        )
    return len(releases) if sent else 0


async def ensure_work_tracking_digest_on_startup(bot=None) -> None:
    """
    Si le bot redémarre après 09:00, envoie le digest manqué (une fois par jour).
    """
    now = datetime.datetime.now(PARIS_TZ)
    digest_at = datetime.time(
        hour=config.WORK_TRACKING_DIGEST_HOUR,
        minute=config.WORK_TRACKING_DIGEST_MINUTE,
    )
    if now.time() < digest_at:
        return

    sb = _get_supabase()
    if not sb or _digest_sent_today(sb, now.date()):
        return

    logger.info(
        "[work_tracking] Digest manqué détecté au démarrage (%02d:%02d) — envoi…",
        now.hour,
        now.minute,
    )
    await run_work_tracking_yesterday_digest(bot)


async def run_work_tracking_catchup_digest(
    since_date: datetime.date,
    until_date: Optional[datetime.date] = None,
    *,
    dry_run: bool = False,
) -> int:
    """
    Rattrapage manuel : MP récap des sorties manquées entre since_date et until_date
    (dates calendaires Europe/Paris, incluses).
    """
    sb = _get_supabase()
    if not sb:
        logger.error("[work_tracking] Supabase indisponible")
        return 0

    until_date = until_date or (datetime.datetime.now(PARIS_TZ).date() - datetime.timedelta(days=1))
    if until_date < since_date:
        logger.warning(
            "[work_tracking] Rattrapage ignoré : until (%s) < since (%s)",
            until_date.isoformat(),
            since_date.isoformat(),
        )
        return 0

    try:
        log_res = (
            sb.table("work_publication_refresh_log")
            .select("work_publication_id, old_values, created_at")
            .eq("action", "chapter_advanced")
            .gte("created_at", f"{since_date.isoformat()}T00:00:00")
            .lte("created_at", f"{until_date.isoformat()}T23:59:59")
            .execute()
        )
    except Exception as e:
        logger.error("[work_tracking] Erreur lecture refresh_log rattrapage : %s", e)
        return 0

    grouped: dict[str, list[dict[str, str]]] = {}
    seen: set[tuple[str, str, str]] = set()

    for row in log_res.data or []:
        wp_id = str(row.get("work_publication_id") or "")
        if not wp_id:
            continue

        old = row.get("old_values") or {}
        release_date = resolve_stored_date_value(old.get("date_next_release") or "")
        chapter = (old.get("chapter_next_release") or old.get("progress_current") or "").strip()
        if not release_date or not chapter:
            continue

        dedupe_key = (wp_id, release_date, chapter)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        try:
            wp_res = (
                sb.table("work_publications")
                .select("title, published_post_id")
                .eq("id", wp_id)
                .limit(1)
                .execute()
            )
            wp = (wp_res.data or [None])[0] or {}
            url = await _fetch_discord_url(sb, wp.get("published_post_id"))
            grouped.setdefault(release_date, []).append({
                "title": (wp.get("title") or "Œuvre").strip(),
                "chapter": chapter,
                "release_date": release_date,
                "url": url,
            })
        except Exception as row_err:
            logger.warning("[work_tracking] Rattrapage : œuvre %s ignorée : %s", wp_id, row_err)

    if not grouped:
        logger.info(
            "[work_tracking] Rattrapage : aucune sortie entre %s et %s",
            since_date.isoformat(),
            until_date.isoformat(),
        )
        return 0

    since_label = since_date.strftime("%d/%m/%Y")
    until_label = until_date.strftime("%d/%m/%Y")
    parts = [
        f"📅 **Suivi d'œuvres — rattrapage ({since_label} → {until_label})**",
        "",
    ]

    total = 0
    for release_date in sorted(grouped.keys()):
        items = sorted(grouped[release_date], key=lambda r: r.get("title", "").lower())
        try:
            day_label = datetime.date.fromisoformat(release_date).strftime("%d/%m/%Y")
        except ValueError:
            day_label = release_date
        parts.append(f"**Sorties du {day_label}**")
        parts.append(_format_chapter_release_lines(items, show_release_date=True))
        parts.append("")
        total += len(items)

    message = "\n".join(parts).strip()

    if dry_run:
        print(message)
        print(f"\n--- {total} œuvre(s), envoi simulé (dry-run) ---")
        return total

    sent = await _send_admin_dm_rest(message)
    if sent:
        logger.info("[work_tracking] Rattrapage envoyé (%d œuvre(s))", total)
    return total if sent else 0
