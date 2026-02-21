"""
Envoi des annonces Discord (nouvelle publication, MAJ, suppression).
Dependances : config, discord_api
Logger       : [publisher]
"""

import logging
from typing import Optional

from config import config
from discord_api import _discord_post_json

logger = logging.getLogger("publisher")


# ==================== HELPERS ====================

def _build_forum_link(thread_url: str, forum_id: int = None) -> Optional[str]:
    """
    Derive l'URL du forum depuis l'URL d'un thread.
    Utilise forum_id si fourni, sinon fallback sur config.FORUM_MY_ID.
    """
    actual_forum_id = forum_id or config.FORUM_MY_ID
    if not thread_url or not actual_forum_id:
        return None
    parts = thread_url.rstrip("/").split("/")
    if len(parts) < 2:
        return None
    guild_id = parts[-2]
    if not guild_id.isdigit():
        return None
    return f"https://discord.com/channels/{guild_id}/{actual_forum_id}"


# ==================== ANNONCES ====================

async def _send_announcement(
    session,
    is_update:        bool,
    title:            str,
    thread_url:       str,
    translator_label: str,
    state_label:      str,
    game_version:     str,
    translate_version: str,
    image_url:        Optional[str] = None,
    forum_id:         int = None,
) -> bool:
    """
    Envoie une annonce dans PUBLISHER_ANNOUNCE_CHANNEL_ID.
    Couvre les deux cas : nouvelle traduction et mise a jour.
    Retourne True si l'envoi a reussi.
    """
    if not config.PUBLISHER_ANNOUNCE_CHANNEL_ID:
        logger.warning("[publisher] PUBLISHER_ANNOUNCE_CHANNEL_ID non configure, annonce non envoyee")
        return False

    title_clean       = (title             or "").strip() or "Sans titre"
    game_version      = (game_version      or "").strip() or "Non specifiee"
    translate_version = (translate_version or "").strip() or "Non specifiee"
    prefixe = "🔄 **Mise a jour d'une traduction**" if is_update else "🎮 **Nouvelle traduction**"

    msg  = f"{prefixe}\n\n"
    msg += f"**Nom du jeu :** [{title_clean}]({thread_url})\n"
    if translator_label and translator_label.strip():
        msg += f"**Traducteur :** {translator_label.strip()}\n"
    msg += f"**Version du jeu :** `{game_version}`\n"
    msg += f"**Version de la traduction :** `{translate_version}`\n"
    if state_label and state_label.strip():
        msg += f"\n**Etat :** {state_label.strip()}\n"
    msg += "\n**Bon jeu a vous** 😊"

    forum_link = _build_forum_link(thread_url, forum_id=forum_id)
    if forum_link:
        msg += f"\n\n> 📚 Retrouvez toutes mes traductions → [Acceder au forum]({forum_link})"

    payload = {"content": msg}
    if image_url and image_url.strip().startswith("http"):
        payload["embeds"] = [{"color": 0x4ADE80, "image": {"url": image_url.strip()}}]

    status, data, _ = await _discord_post_json(
        session,
        f"/channels/{config.PUBLISHER_ANNOUNCE_CHANNEL_ID}/messages",
        payload,
    )
    if status >= 300:
        logger.warning("[publisher] Echec envoi annonce (status=%d) : %s", status, data)
        return False

    logger.info("[publisher] Annonce envoyee (%s) : %s",
                "mise a jour" if is_update else "nouvelle traduction", title_clean)
    return True


async def _send_deletion_announcement(
    session,
    title:      str,
    reason:     str = None,
    thread_url: str = None,
) -> bool:
    """
    Envoie une annonce de suppression dans PUBLISHER_ANNOUNCE_CHANNEL_ID.
    Retourne True si l'envoi a reussi.
    """
    if not config.PUBLISHER_ANNOUNCE_CHANNEL_ID:
        logger.warning("[publisher] PUBLISHER_ANNOUNCE_CHANNEL_ID non configure, annonce suppression non envoyee")
        return False

    title_clean = (title  or "").strip() or "Publication"
    reason_clean = (reason or "").strip()

    msg  = "🗑️ **Suppression d'une publication**\n\n"
    msg += f"**Publication supprimee :** {title_clean}\n"
    if reason_clean:
        msg += f"**Raison :** {reason_clean}\n"

    forum_link = _build_forum_link(thread_url)
    if forum_link:
        msg += f"\n\n> 📚 Retrouvez toutes mes traductions → [Acceder au forum]({forum_link})"

    payload = {
        "content": msg,
        "embeds": [{
            "color":  0xFF6B6B,
            "footer": {"text": "Cette publication a ete retiree definitivement"},
        }],
    }

    status, data, _ = await _discord_post_json(
        session,
        f"/channels/{config.PUBLISHER_ANNOUNCE_CHANNEL_ID}/messages",
        payload,
    )
    if status >= 300:
        logger.warning("[publisher] Echec envoi annonce suppression (status=%d) : %s", status, data)
        return False

    logger.info("[publisher] Annonce de suppression envoyee : %s", title_clean)
    return True
