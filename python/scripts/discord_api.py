"""
Wrappers REST bas niveau vers l'API Discord — aucune logique metier.
Dependances : config
Logger       : [discord]
"""

import json
import time
import logging
from typing import Optional, Tuple

import aiohttp

from config import config

logger = logging.getLogger("discord")


# ==================== RATE LIMIT TRACKER ====================

class RateLimitTracker:
    def __init__(self):
        self.remaining: Optional[int] = None
        self.limit:     Optional[int] = None
        self.reset_at:  Optional[float] = None

    def update_from_headers(self, headers: dict):
        try:
            if "X-RateLimit-Remaining" in headers:
                self.remaining = int(headers["X-RateLimit-Remaining"])
            if "X-RateLimit-Limit" in headers:
                self.limit = int(headers["X-RateLimit-Limit"])
            if "X-RateLimit-Reset" in headers:
                self.reset_at = float(headers["X-RateLimit-Reset"])
            if self.remaining is not None and self.remaining < 5:
                logger.warning(
                    "[discord] Rate limit proche : %d requetes restantes", self.remaining
                )
        except Exception as e:
            logger.error("[discord] Erreur lecture headers rate limit : %s", e)

    def get_info(self) -> dict:
        info = {
            "remaining":        self.remaining,
            "limit":            self.limit,
            "reset_at":         self.reset_at,
            "reset_in_seconds": None,
        }
        if self.reset_at:
            info["reset_in_seconds"] = int(max(0, self.reset_at - time.time()))
        return info


rate_limiter = RateLimitTracker()


# ==================== HELPERS ====================

def _auth_headers() -> dict:
    return {"Authorization": f"Bot {config.PUBLISHER_DISCORD_TOKEN}"}


# ==================== REQUETE DE BASE ====================

async def _discord_request(
    session, method: str, path: str,
    headers=None, json_data=None, data=None
) -> tuple[int, any, dict]:
    url = f"{config.DISCORD_API_BASE}{path}"
    try:
        async with session.request(
            method, url, headers=headers, json=json_data, data=data
        ) as resp:
            rate_limiter.update_from_headers(resp.headers)
            try:
                resp_data = await resp.json()
            except Exception:
                resp_data = await resp.text()

            if resp.status >= 400:
                logger.warning("[discord] %s %s -> HTTP %d : %s",
                               method, path, resp.status, resp_data)

            return resp.status, resp_data, dict(resp.headers)
    except Exception as e:
        logger.error("[discord] Erreur requete %s %s : %s", method, path, e)
        return 500, {"error": str(e)}, {}


# ==================== METHODES REST ====================

async def _discord_get(session, path: str) -> Tuple[int, any]:
    status, data, _ = await _discord_request(
        session, "GET", path, headers=_auth_headers()
    )
    return status, data


async def _discord_post_json(
    session, path: str, payload: dict
) -> Tuple[int, any, dict]:
    return await _discord_request(
        session, "POST", path,
        headers={**_auth_headers(), "Content-Type": "application/json"},
        json_data=payload,
    )


async def _discord_patch_json(
    session, path: str, payload: dict
) -> Tuple[int, any]:
    status, data, _ = await _discord_request(
        session, "PATCH", path,
        headers={**_auth_headers(), "Content-Type": "application/json"},
        json_data=payload,
    )
    return status, data


async def _discord_delete_message(
    session, channel_id: str, message_id: str
) -> bool:
    """Supprime un message Discord. Retourne True si succes."""
    status, _, _ = await _discord_request(
        session, "DELETE",
        f"/channels/{channel_id}/messages/{message_id}",
        headers=_auth_headers(),
    )
    return status < 300


async def _discord_delete_channel(
    session, channel_id: str
) -> Tuple[bool, int]:
    """Supprime un channel/thread Discord. Retourne (succes, status_code)."""
    status, _, _ = await _discord_request(
        session, "DELETE",
        f"/channels/{channel_id}",
        headers=_auth_headers(),
    )
    return (status < 300, status)


async def _discord_list_messages(
    session, channel_id: str, limit: int = 50
) -> list:
    """Liste les derniers messages d'un channel/thread (du plus recent au plus ancien)."""
    status, data, _ = await _discord_request(
        session, "GET",
        f"/channels/{channel_id}/messages?limit={limit}",
        headers=_auth_headers(),
    )
    if status >= 300 or not isinstance(data, list):
        return []
    return data


async def _discord_suppress_embeds(
    session, channel_id: str, message_id: str
) -> bool:
    """Active le flag SUPPRESS_EMBEDS sur un message (masque les embeds)."""
    try:
        status, msg = await _discord_get(
            session, f"/channels/{channel_id}/messages/{message_id}"
        )
        if status >= 300:
            logger.warning(
                "[discord] Impossible de lire le message avant SUPPRESS_EMBEDS (status=%d)", status
            )
            return False

        new_flags = (msg.get("flags", 0) | 4)
        status, data = await _discord_patch_json(
            session,
            f"/channels/{channel_id}/messages/{message_id}",
            {"flags": new_flags},
        )
        if status >= 300:
            logger.warning("[discord] SUPPRESS_EMBEDS echoue (status=%d) : %s", status, data)
            return False
        return True
    except Exception as e:
        logger.warning("[discord] Exception SUPPRESS_EMBEDS : %s", e)
        return False


async def _discord_post_thread_with_attachment(
    session,
    forum_id: str,
    name: str,
    message_content: str,
    applied_tag_ids: Optional[list],
    file_bytes: bytes,
    filename: str,
    content_type: str,
) -> Tuple[int, any, dict]:
    """
    Cree un thread avec une piece jointe (multipart/form-data).
    Retourne (status, data, headers).
    """
    payload = {
        "name":    name,
        "message": {"content": message_content or " "},
    }
    if applied_tag_ids:
        payload["applied_tags"] = applied_tag_ids

    form = aiohttp.FormData()
    form.add_field("payload_json", json.dumps(payload), content_type="application/json")
    form.add_field("files[0]", file_bytes, filename=filename, content_type=content_type)

    return await _discord_request(
        session, "POST",
        f"/channels/{forum_id}/threads",
        headers=_auth_headers(),
        data=form,
    )


async def _discord_patch_message_with_attachment(
    session,
    thread_id: str,
    message_id: str,
    content: str,
    file_bytes: bytes,
    filename: str,
    content_type: str,
) -> Tuple[int, any]:
    """
    Met a jour un message en remplacant sa piece jointe (multipart/form-data).
    Retourne (status, data).
    """
    payload = {
        "content":     content or " ",
        "embeds":      [],
        "attachments": [{"id": 0, "filename": filename}],
    }
    form = aiohttp.FormData()
    form.add_field("payload_json", json.dumps(payload), content_type="application/json")
    form.add_field("files[0]", file_bytes, filename=filename, content_type=content_type)

    status, data, _ = await _discord_request(
        session, "PATCH",
        f"/channels/{thread_id}/messages/{message_id}",
        headers=_auth_headers(),
        data=form,
    )
    return status, data
