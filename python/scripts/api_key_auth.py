"""
Validation et cache des cles API individuelles.
Dependances : config, supabase_client
Logger       : [auth]
"""

import os
import time
import secrets
import hashlib
import asyncio
import logging
import datetime
from dataclasses import dataclass
from typing import Optional

from config import config
from supabase_client import _get_supabase, _update_key_usage_sync

logger = logging.getLogger("auth")

# Message d'avertissement renvoye au frontend quand l'ancienne cle partagee est detectee
LEGACY_KEY_WARNING = (
    "Votre cle API est la cle partagee (usage obsolete). "
    "Tapez /generer-cle sur le serveur Discord pour obtenir votre cle personnelle."
)


# ==================== CACHE ====================

@dataclass
class _CachedEntry:
    discord_user_id: str   # "" si cle refusee ou legacy
    discord_name:    str   # "" si cle refusee ou legacy
    is_valid:        bool
    expires_at:      float # time.monotonic()


class _ApiKeyCache:
    """
    Cache memoire TTL pour les lookups Supabase.
    Asyncio est single-threaded -> pas besoin de Lock.
    TTL par defaut : 5 minutes (configurable via env API_KEY_CACHE_TTL).
    """

    def __init__(self, ttl: int = 300):
        self._store: dict[str, _CachedEntry] = {}
        self._ttl = ttl

    def get(self, key_hash: str) -> Optional[_CachedEntry]:
        entry = self._store.get(key_hash)
        if not entry:
            return None
        if time.monotonic() > entry.expires_at:
            del self._store[key_hash]
            return None
        return entry

    def set(self, key_hash: str, discord_user_id: str, discord_name: str, is_valid: bool):
        self._store[key_hash] = _CachedEntry(
            discord_user_id=discord_user_id,
            discord_name=discord_name,
            is_valid=is_valid,
            expires_at=time.monotonic() + self._ttl,
        )

    def evict_user(self, discord_user_id: str):
        """Invalide immediatement toutes les entrees d'un utilisateur."""
        to_del = [h for h, e in self._store.items() if e.discord_user_id == discord_user_id]
        for h in to_del:
            del self._store[h]
        if to_del:
            logger.info("[auth] Cache : %d entree(s) invalidee(s) pour discord_user_id=%s",
                        len(to_del), discord_user_id)

    def evict_hash(self, key_hash: str):
        """Invalide immediatement une cle specifique par son hash."""
        if self._store.pop(key_hash, None):
            logger.info("[auth] Cache : entree invalidee par hash")


_api_key_cache = _ApiKeyCache(
    ttl=int(os.getenv("API_KEY_CACHE_TTL", "300"))
)


# ==================== HELPERS ====================

def _hash_raw_key(raw_key: str) -> str:
    """SHA-256 hex — identique a la fonction SQL hash_api_key()."""
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def _generate_raw_key() -> str:
    """Genere une cle API lisible et unique. Format : tr_<32 hex chars>"""
    return f"tr_{secrets.token_hex(16)}"


# ==================== VALIDATION ====================

async def _validate_api_key(
    raw_key: str,
) -> tuple[bool, Optional[str], Optional[str], bool]:
    if not raw_key:
        return False, None, None, False

    # ── 1. Cache ──────────────────────────────────────────────────────────────
    key_hash = _hash_raw_key(raw_key)
    cached = _api_key_cache.get(key_hash)
    if cached is not None:
        uid  = cached.discord_user_id or None
        name = cached.discord_name    or None
        return cached.is_valid, uid, name, False

    # ── 2. Legacy ─────────────────────────────────────────────────────────────
    if config.PUBLISHER_API_KEY and raw_key == config.PUBLISHER_API_KEY:
        logger.warning("[auth] Cle legacy (partagee) utilisee — migration recommandee")
        return True, None, None, True

    # ── 3. Supabase ───────────────────────────────────────────────────────────
    sb = _get_supabase()
    if not sb:
        logger.warning("[auth] Supabase indisponible — validation impossible")
        return False, None, None, False

    try:
        res = (
            sb.table("api_keys")
            .select("discord_user_id, discord_name, is_active")
            .eq("key_hash", key_hash)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        if res.data:
            row = res.data[0]
            _api_key_cache.set(key_hash, row["discord_user_id"], row["discord_name"], True)
            loop = asyncio.get_event_loop()
            loop.run_in_executor(None, _update_key_usage_sync, key_hash)
            logger.info("[auth] Cle valide pour %s (discord_id=%s)",
                        row["discord_name"], row["discord_user_id"])
            return True, row["discord_user_id"], row["discord_name"], False
        else:
            _api_key_cache.set(key_hash, "", "", False)
            logger.warning("[auth] Cle inconnue ou revoquee (hash=%s...)", key_hash[:12])
            return False, None, None, False

    except Exception as e:
        logger.error("[auth] Supabase erreur validation cle : %s", e)
        return False, None, None, False


async def _auth_request(
    request,
    route: str,
) -> tuple[bool, Optional[str], Optional[str], bool]:
    """
    Helper utilise en tete de chaque handler protege.
    Retourne (is_valid, discord_user_id, discord_name, is_legacy).
    Loggue automatiquement les echecs d'auth.
    """
    raw_key = (
        request.headers.get("X-API-KEY")
        or request.query.get("api_key")
        or ""
    ).strip()

    is_valid, uid, name, is_legacy = await _validate_api_key(raw_key)

    if not is_valid:
        forwarded = request.headers.get("X-Forwarded-For")
        client_ip = forwarded.split(",")[0].strip() if forwarded else (request.remote or "unknown")
        logger.warning("[auth] Echec auth depuis %s (route: %s)", client_ip, route)

    return is_valid, uid, name, is_legacy
