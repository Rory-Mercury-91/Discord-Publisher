"""
Taches planifiees Discord ext.tasks (version check, cleanup, sync jeux).
Dependances : config, version_checker, forum_manager, supabase_client, publisher_bot
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
from supabase_client import _get_supabase, _sync_jeux_to_supabase

logger = logging.getLogger("scheduler")

# URL et cle de l'API externe jeux
F95FR_API_URL = "https://f95fr.duckdns.org/api/jeux"
F95FR_API_KEY = os.getenv("F95FR_API_KEY", "")


# ==================== CLEANUP MESSAGES VIDES ====================

async def run_cleanup_empty_messages_once():
    """
    Supprime les messages vides dans les threads de TOUS les salons configures
    (Mappings, Externes et salon par defaut).
    """
    logger.info("[scheduler] Debut nettoyage global des messages vides")

    # Import local pour eviter circular import au niveau module
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
    """Synchronise les jeux depuis f95fr vers Supabase (toutes les 2h a :30 Europe/Paris).
    Decalage intentionnel : evite :00 (vidage/remplissage API ami) et :15 (MAJ tableur).
    """
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
