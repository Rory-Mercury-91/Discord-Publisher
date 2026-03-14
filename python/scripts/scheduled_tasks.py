"""
Taches planifiees Discord ext.tasks (version check, cleanup, sync jeux, dates F95).
Dependances : config, version_checker, forum_manager, supabase_client, scraper, publisher_bot
Logger       : [scheduler]
"""

import asyncio
import logging
import datetime
import random
import os
from zoneinfo import ZoneInfo

import aiohttp
from discord.ext import tasks

from config import config
from supabase_client import _get_supabase, _sync_jeux_to_supabase, _update_date_maj_bulk_sync
from scraper import enrich_dates_with_fallback

logger = logging.getLogger("scheduler")

# URL et cle de l'API externe jeux
F95FR_API_URL = "https://f95fr.duckdns.org/api/jeux"
F95FR_API_KEY = os.getenv("F95FR_API_KEY", "")

# Clés app_config
_KEY_INTERVAL   = "f95_date_refresh_interval_hours"
_KEY_LAST       = "f95_date_last_refresh"
_DEFAULT_HOURS  = 168   # une semaine


# ==================== CLEANUP MESSAGES VIDES ====================

async def run_cleanup_empty_messages_once():
    """
    Supprime les messages vides dans les threads de TOUS les salons configures
    (Mappings, Externes et salon par defaut).
    """
    logger.info("[scheduler] Debut nettoyage global des messages vides")

    from publisher_bot import bot
    from forum_manager import _collect_all_forum_threads, _clean_empty_messages_in_thread

    sb = _get_supabase()
    forum_ids = set()

    if config.FORUM_MY_ID:
        forum_ids.add(str(config.FORUM_MY_ID))

    if sb:
        try:
            r1 = sb.table("translator_forum_mappings").select("forum_channel_id").execute()
            for row in (r1.data or []):
                val = str(row.get("forum_channel_id", "")).strip()
                if val and val != "0":
                    forum_ids.add(val)

            r2 = sb.table("external_translators").select("forum_channel_id").execute()
            for row in (r2.data or []):
                val = str(row.get("forum_channel_id", "")).strip()
                if val and val != "0":
                    forum_ids.add(val)
        except Exception as e:
            logger.warning("[scheduler] Erreur recuperation salons Supabase pour nettoyage : %s", e)

    if not forum_ids:
        logger.warning("[scheduler] Aucun salon trouve pour le nettoyage")
        return

    logger.info("[scheduler] %d salon(s) a analyser pour le nettoyage", len(forum_ids))

    total_deleted = 0

    async with aiohttp.ClientSession() as session:
        for forum_id_str in forum_ids:
            try:
                forum_id = int(forum_id_str)
                forum    = bot.get_channel(forum_id)
                if not forum:
                    logger.warning("[scheduler] Salon %d introuvable ou inaccessible", forum_id)
                    continue

                logger.info("[scheduler] Nettoyage salon : %s (%d)", forum.name, forum_id)
                threads = await _collect_all_forum_threads(forum)
                if not threads:
                    continue

                for idx, thread in enumerate(threads, 1):
                    await asyncio.sleep(0.5 + random.random())
                    n = await _clean_empty_messages_in_thread(session, str(thread.id))
                    total_deleted += n
                    if idx % 10 == 0:
                        logger.info(
                            "[scheduler] [%s] Progression : %d/%d threads traites",
                            forum.name, idx, len(threads),
                        )
            except Exception as e:
                logger.error("[scheduler] Erreur traitement salon %s : %s", forum_id_str, e)

    logger.info(
        "[scheduler] Nettoyage termine : %d message(s) supprime(s) sur %d salon(s)",
        total_deleted, len(forum_ids),
    )


# ==================== TACHES PLANIFIEES ====================

@tasks.loop(
    time=datetime.time(
        hour=config.VERSION_CHECK_HOUR,
        minute=config.VERSION_CHECK_MINUTE,
        tzinfo=ZoneInfo("Europe/Paris"),
    )
)
async def daily_version_check():
    """Controle quotidien automatique des versions F95 a l'heure configuree."""
    logger.info(
        "[scheduler] Lancement controle quotidien versions F95 (%02d:%02d Europe/Paris)",
        config.VERSION_CHECK_HOUR, config.VERSION_CHECK_MINUTE,
    )
    try:
        from version_checker import run_version_check_once
        await run_version_check_once()
    except Exception as e:
        logger.error("[scheduler] Erreur controle quotidien versions : %s", e)


@tasks.loop(
    time=datetime.time(
        hour=config.CLEANUP_EMPTY_MESSAGES_HOUR,
        minute=config.CLEANUP_EMPTY_MESSAGES_MINUTE,
        tzinfo=ZoneInfo("Europe/Paris"),
    )
)
async def daily_cleanup_empty_messages():
    """Nettoyage quotidien des messages vides dans les threads."""
    logger.info(
        "[scheduler] Lancement nettoyage quotidien messages vides (%02d:%02d Europe/Paris)",
        config.CLEANUP_EMPTY_MESSAGES_HOUR, config.CLEANUP_EMPTY_MESSAGES_MINUTE,
    )
    try:
        await run_cleanup_empty_messages_once()
    except Exception as e:
        logger.error("[scheduler] Erreur nettoyage quotidien : %s", e)


@tasks.loop(time=[
    datetime.time(hour=0,  minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=2,  minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=4,  minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=6,  minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=8,  minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=10, minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=12, minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=14, minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=16, minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=18, minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=20, minute=30, tzinfo=ZoneInfo("Europe/Paris")),
    datetime.time(hour=22, minute=30, tzinfo=ZoneInfo("Europe/Paris")),
])
async def sync_jeux_task():
    """Synchronise les jeux depuis f95fr vers Supabase (toutes les 2h a :30 Europe/Paris)."""
    logger.info("[scheduler] Synchronisation jeux f95fr -> Supabase")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                F95FR_API_URL,
                headers={"X-API-KEY": F95FR_API_KEY},
                timeout=aiohttp.ClientTimeout(total=60),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    if isinstance(data, list) and data:
                        loop = asyncio.get_event_loop()
                        await loop.run_in_executor(None, _sync_jeux_to_supabase, data)
                        logger.info("[scheduler] %d jeux synchronises dans f95_jeux", len(data))
                    else:
                        logger.warning("[scheduler] Reponse vide ou invalide depuis f95fr")
                else:
                    logger.warning("[scheduler] API f95fr HTTP %d", resp.status)
    except Exception as e:
        logger.error("[scheduler] Erreur sync jeux : %s", e)


@tasks.loop(hours=1)
async def configurable_date_refresh():
    """
    Rafraîchit f95_date_maj (date MAJ jeu sur F95Zone) selon la fréquence
    configurée dans app_config (clé f95_date_refresh_interval_hours).

    RÈGLE DE SÉPARATION :
      - Écrit UNIQUEMENT dans f95_date_maj (date MAJ jeu par le dev sur F95Zone).
      - Ne touche PAS à date_maj (date MAJ traduction, gérée par _sync_jeux_to_supabase).

    Comportement :
      0        → manuel uniquement, tâche inactive.
      1..168   → exécution si (now - last_refresh) >= interval.
    """
    sb = _get_supabase()
    if not sb:
        logger.debug("[scheduler] configurable_date_refresh : Supabase indisponible")
        return

    try:
        # ── 1. Lire la configuration dans app_config ───────────────────────
        res = sb.table("app_config").select("key, value").in_(
            "key", [_KEY_INTERVAL, _KEY_LAST]
        ).execute()
        cfg = {row["key"]: row["value"] for row in (res.data or [])}

        raw_interval = cfg.get(_KEY_INTERVAL)
        interval_hours = int(raw_interval) if raw_interval is not None else _DEFAULT_HOURS

        # ── 2. Fréquence 0 = manuel uniquement, on sort silencieusement ────
        if interval_hours == 0:
            logger.debug("[scheduler] configurable_date_refresh désactivé (interval=0)")
            return

        # ── 3. Vérifier si le délai depuis le dernier passage est écoulé ───
        now = datetime.datetime.now(ZoneInfo("UTC"))
        last_refresh_str = cfg.get(_KEY_LAST)
        if last_refresh_str:
            try:
                last_refresh = datetime.datetime.fromisoformat(last_refresh_str)
                if last_refresh.tzinfo is None:
                    last_refresh = last_refresh.replace(tzinfo=ZoneInfo("UTC"))
                elapsed_h = (now - last_refresh).total_seconds() / 3600
                if elapsed_h < interval_hours:
                    logger.debug(
                        "[scheduler] configurable_date_refresh : prochain passage dans %.1fh",
                        interval_hours - elapsed_h,
                    )
                    return
            except Exception as parse_err:
                logger.warning(
                    "[scheduler] configurable_date_refresh : impossible de parser last_refresh=%r : %s",
                    last_refresh_str, parse_err,
                )

        logger.info(
            "[scheduler] configurable_date_refresh : démarrage (interval=%dh)", interval_hours
        )

        # ── 4. Récupérer les jeux sans date OU non vérifiés depuis interval ─
        cutoff_iso = (now - datetime.timedelta(hours=interval_hours)).isoformat()

        res_jeux = (
            sb.table("f95_jeux")
            .select("site_id, nom_url")
            .or_(f"f95_date_maj.is.null,updated_at.lt.{cutoff_iso}")
            .not_.is_("nom_url", "null")
            .not_.is_("site_id", "null")
            .limit(500)
            .execute()
        )

        jeux = [
            r for r in (res_jeux.data or [])
            if r.get("nom_url") and "f95zone.to" in (r.get("nom_url") or "").lower()
        ]

        if not jeux:
            logger.info("[scheduler] configurable_date_refresh : aucun jeu à traiter")
        else:
            logger.info("[scheduler] configurable_date_refresh : %d jeux à scraper", len(jeux))

            # ── 5. Enrichir les dates via scraping ─────────────────────────
            async with aiohttp.ClientSession() as session:
                date_map = await enrich_dates_with_fallback(
                    session,
                    jeux=jeux,
                    rss_date_map={},    # pas de RSS : on scrape directement
                    scrape_delay=3.0,
                )

            # ── 6. Écrire dans f95_date_maj via _update_date_maj_bulk_sync ──
            if date_map:
                updated = _update_date_maj_bulk_sync(date_map)
                logger.info(
                    "[scheduler] configurable_date_refresh : %d/%d date(s) f95_date_maj mises à jour",
                    updated, len(date_map),
                )
            else:
                logger.info("[scheduler] configurable_date_refresh : aucune date extraite")

        # ── 7. Mettre à jour f95_date_last_refresh dans app_config ─────────
        sb.table("app_config").upsert(
            {"key": _KEY_LAST, "value": now.isoformat()},
            on_conflict="key",
        ).execute()
        logger.info("[scheduler] configurable_date_refresh : f95_date_last_refresh mis à jour → %s", now.isoformat())

    except Exception as e:
        logger.error("[scheduler] configurable_date_refresh erreur : %s", e, exc_info=True)


# ==================== DEMARRAGE ====================

def start_all_tasks():
    """
    Demarre toutes les taches planifiees si elles ne sont pas deja en cours.
    Appele depuis publisher_bot.on_ready().
    """
    if not daily_version_check.is_running():
        daily_version_check.start()
        logger.info(
            "[scheduler] Controle versions planifie a %02d:%02d Europe/Paris",
            config.VERSION_CHECK_HOUR, config.VERSION_CHECK_MINUTE,
        )
    if not daily_cleanup_empty_messages.is_running():
        daily_cleanup_empty_messages.start()
        logger.info(
            "[scheduler] Nettoyage messages vides planifie a %02d:%02d Europe/Paris",
            config.CLEANUP_EMPTY_MESSAGES_HOUR, config.CLEANUP_EMPTY_MESSAGES_MINUTE,
        )
    if not sync_jeux_task.is_running():
        sync_jeux_task.start()
        logger.info("[scheduler] Synchronisation jeux planifiee (toutes les 2h)")
    if not configurable_date_refresh.is_running():
        configurable_date_refresh.start()
        logger.info(
            "[scheduler] Rafraichissement dates F95 planifie "
            "(verification toutes les heures, frequence lue depuis app_config)"
        )