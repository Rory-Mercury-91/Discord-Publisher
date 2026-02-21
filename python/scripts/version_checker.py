"""
Controle des versions F95 via l'API checker.php + systeme anti-doublon.
Dependances : config, content_parser, supabase_client, discord_api, forum_manager
Logger       : [f95]
"""

import asyncio
import logging
import datetime
from typing import Optional, List, Dict

import aiohttp

from config import config
from content_parser import _normalize_version, _extract_f95_thread_id
from forum_manager import (
    _collect_all_forum_threads,
    _extract_post_data,
    _update_post_version,
)

logger = logging.getLogger("f95")


# ==================== ANTI-DOUBLON ====================

# Structure : {thread_id: {"f95_version": "Ch.7", "timestamp": datetime}}
_notified_versions: Dict[int, Dict] = {}


def _clean_old_notifications():
    """Nettoie les entrees de plus de 30 jours."""
    cutoff   = datetime.datetime.now() - datetime.timedelta(days=30)
    to_remove = [
        tid for tid, data in _notified_versions.items()
        if data.get("timestamp", datetime.datetime.min) < cutoff
    ]
    for tid in to_remove:
        del _notified_versions[tid]
    if to_remove:
        logger.info("[f95] Nettoyage anti-doublon : %d entree(s) supprimee(s)", len(to_remove))


def _is_already_notified(thread_id: int, f95_version: str) -> bool:
    """Verifie si cette version a deja ete notifiee pour ce thread."""
    if thread_id not in _notified_versions:
        return False
    return _notified_versions[thread_id].get("f95_version") == f95_version


def _mark_as_notified(thread_id: int, f95_version: str):
    """Marque cette version comme notifiee."""
    _notified_versions[thread_id] = {
        "f95_version": f95_version,
        "timestamp":   datetime.datetime.now(),
    }


# ==================== VERSION ALERT ====================

class VersionAlert:
    """Represente une alerte de version detectee."""

    def __init__(
        self,
        thread_name:  str,
        thread_url:   str,
        f95_version:  Optional[str],
        post_version: Optional[str],
        updated:      bool,
    ):
        self.thread_name  = thread_name
        self.thread_url   = thread_url
        self.f95_version  = f95_version
        self.post_version = post_version
        self.updated      = updated


async def _group_and_send_alerts(channel, alerts: List[VersionAlert]):
    """Envoie les alertes groupees dans le salon de notification (max 10 par message)."""
    if not alerts:
        return

    title = f"🚨 **Mises a jour detectees** ({len(alerts)} jeux)"

    for i in range(0, len(alerts), 10):
        batch     = alerts[i:i + 10]
        msg_parts = [title, ""]

        for alert in batch:
            if alert.f95_version:
                msg_parts.append(
                    f"**{alert.thread_name}**\n"
                    f"├ Version F95 : `{alert.f95_version}`\n"
                    f"├ Version du poste : `{alert.post_version or 'Non renseignee'}`\n"
                    f"├ Version modifiee : {'OUI ✅' if alert.updated else 'NON ❌'}\n"
                    f"└ Lien : {alert.thread_url}\n"
                )
            else:
                msg_parts.append(
                    f"**{alert.thread_name}**\n"
                    f"├ Version F95 : Non detectable ⚠️\n"
                    f"├ Version du poste : `{alert.post_version or 'Non renseignee'}`\n"
                    f"├ Version modifiee : NON\n"
                    f"└ Lien : {alert.thread_url}\n"
                )

        await channel.send("\n".join(msg_parts))
        await asyncio.sleep(1.5)


# ==================== API F95 ====================

async def fetch_f95_versions_by_ids(
    session: aiohttp.ClientSession, thread_ids: list
) -> Dict[str, str]:
    """
    Recupere les versions depuis l'API F95 checker.php.
    Limite API F95 : 100 IDs par requete — decoupage automatique en blocs de 50.

    Retourne : {thread_id: version}
    Exemple  : {"100": "v0.68", "285451": "Ch.7"}
    """
    if not thread_ids:
        return {}

    CHUNK_SIZE   = 50
    total_ids    = len(thread_ids)
    all_versions = {}

    logger.info("[f95] Recuperation versions pour %d threads (blocs de %d)", total_ids, CHUNK_SIZE)

    for chunk_idx in range(0, total_ids, CHUNK_SIZE):
        chunk       = thread_ids[chunk_idx:chunk_idx + CHUNK_SIZE]
        chunk_num   = (chunk_idx // CHUNK_SIZE) + 1
        total_chunks = (total_ids + CHUNK_SIZE - 1) // CHUNK_SIZE

        logger.info("[f95] Bloc %d/%d : %d IDs", chunk_num, total_chunks, len(chunk))

        ids_str     = ",".join(str(tid) for tid in chunk)
        checker_url = f"https://f95zone.to/sam/checker.php?threads={ids_str}"

        try:
            async with session.get(checker_url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status != 200:
                    logger.warning("[f95] Checker API HTTP %d pour le bloc %d", resp.status, chunk_num)
                    continue
                data = await resp.json()
                if data.get("status") == "ok" and "msg" in data:
                    chunk_versions = data["msg"]
                    logger.info("[f95] Bloc %d : %d versions recuperees", chunk_num, len(chunk_versions))
                    all_versions.update(chunk_versions)
                else:
                    logger.warning("[f95] Bloc %d : reponse invalide", chunk_num)
        except Exception as e:
            logger.warning("[f95] Erreur bloc %d : %s", chunk_num, e)

        # Delai entre blocs pour ne pas surcharger l'API
        if chunk_idx + CHUNK_SIZE < total_ids:
            await asyncio.sleep(1)

    logger.info("[f95] Total : %d/%d versions recuperees", len(all_versions), total_ids)
    return all_versions


# ==================== CONTROLE VERSIONS ====================

async def run_version_check_once():
    logger.info("[f95] Debut controle versions F95 (salon my)")

    from publisher_bot import bot

    channel_notif = bot.get_channel(config.PUBLISHER_MAJ_NOTIFICATION_CHANNEL_ID)
    if not channel_notif:
        logger.error("[f95] Salon notifications MAJ introuvable")
        return
    if not config.FORUM_MY_ID:
        logger.warning("[f95] PUBLISHER_FORUM_TRAD_ID non configure")
        return

    _clean_old_notifications()

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept":     "application/json,*/*",
    }

    all_alerts: List[VersionAlert] = []
    forum = bot.get_channel(config.FORUM_MY_ID)
    if not forum:
        logger.warning("[f95] Forum %d introuvable", config.FORUM_MY_ID)
        return

    threads = await _collect_all_forum_threads(forum)
    logger.info("[f95] %d threads a verifier (actifs + archives)", len(threads))

    # ── Phase 1 : collecter les IDs F95 ──────────────────────────────────────
    thread_mapping = {}

    async with aiohttp.ClientSession(headers=headers) as session:
        for thread in threads:
            await asyncio.sleep(0.3)

            game_link, post_version = await _extract_post_data(thread)
            if not game_link or not post_version:
                logger.debug("[f95] Thread ignore (donnees manquantes) : %s", thread.name)
                continue
            if "lewdcorner.com" in game_link.lower():
                logger.debug("[f95] Thread ignore (LewdCorner) : %s", thread.name)
                continue
            if "f95zone.to" not in game_link.lower():
                logger.debug("[f95] Thread ignore (non-F95Zone) : %s", thread.name)
                continue

            f95_id = _extract_f95_thread_id(game_link)
            if not f95_id:
                logger.warning("[f95] Impossible d'extraire l'ID F95 depuis : %s", game_link)
                continue

            thread_mapping[f95_id] = (thread, post_version)
            logger.info("[f95] Thread mappe : %s -> ID F95 %s", thread.name, f95_id)

        if not thread_mapping:
            logger.info("[f95] Aucun thread avec lien F95 trouve")
            return

        # ── Phase 2 : recuperer les versions via l'API ────────────────────────
        f95_ids = list(thread_mapping.keys())
        logger.info("[f95] Recuperation API pour %d threads...", len(f95_ids))
        f95_versions = await fetch_f95_versions_by_ids(session, f95_ids)

        if not f95_versions:
            logger.warning("[f95] Aucune version recuperee depuis l'API")
            return

        # ── Phase 3 : comparaison ─────────────────────────────────────────────
        for f95_id, (thread, post_version) in thread_mapping.items():

            # Log si l'API n'a pas retourne de version pour cet ID
            if f95_id not in f95_versions:
                logger.warning("[f95] Pas de version retournee par l'API pour ID=%s (%s)",
                               f95_id, thread.name)
                continue

            api_version_clean  = _normalize_version(f95_versions[f95_id])
            post_version_clean = _normalize_version(post_version)

            if api_version_clean != post_version_clean:
                if not _is_already_notified(thread.id, api_version_clean):
                    logger.info(
                        "[f95] Difference detectee : %s | F95=%s vs Post=%s",
                        thread.name, api_version_clean, post_version_clean,
                    )
                    update_success = await _update_post_version(thread, api_version_clean)
                    all_alerts.append(VersionAlert(
                        thread.name, thread.jump_url,
                        api_version_clean, post_version_clean, update_success,
                    ))
                    _mark_as_notified(thread.id, api_version_clean)
            else:
                logger.info("[f95] Version OK : %s (%s)", thread.name, post_version_clean)

    await _group_and_send_alerts(channel_notif, all_alerts)
    logger.info("[f95] Controle termine : %d alerte(s) envoyee(s)", len(all_alerts))
