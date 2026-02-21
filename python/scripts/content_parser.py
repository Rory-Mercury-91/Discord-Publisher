"""
Parsing et normalisation du contenu texte des posts Discord.
Toutes les regex de detection + helpers purs.
Dependances : aucune (module feuille, zero risque circular import)
Logger       : aucun (fonctions pures)
"""

import re
import json
import base64
from typing import Optional


# ==================== REGEX ====================

# Format markdown : * **Version du jeu :** `v1.0`
_RE_GAME_VERSION_MD = re.compile(
    r"^\s*\*\s*\*\*Version\s+du\s+jeu\s*:\s*\*\*\s*`(?P<ver>[^`]+)`\s*$",
    re.IGNORECASE | re.MULTILINE,
)

# Format markdown : * **Lien du jeu :** [texte](<url>)
_RE_GAME_LINK_MD = re.compile(
    r"^\s*\*\s*\*\*Lien\s+du\s+jeu\s*:\s*\*\*\s*\[.*?\]\(<(?P<url>https?://[^>]+)>\)\s*$",
    re.IGNORECASE | re.MULTILINE,
)

# Format legacy (sans markdown)
_RE_GAME_VERSION_PLAIN = re.compile(
    r"^\s*Version\s+du\s+jeu\s*:\s*`?(?P<ver>[^`\n]+)`?\s*$",
    re.IGNORECASE | re.MULTILINE,
)
_RE_GAME_LINK_PLAIN = re.compile(
    r"^\s*Lien\s+du\s+jeu\s*:\s*\[.*?\]\(<(?P<url>https?://[^)>]+)>\)\s*$",
    re.IGNORECASE | re.MULTILINE,
)

# Nouveau format : * [Jeu original](<url>)
_RE_GAME_LINK_JEU_ORIGINAL = re.compile(
    r"^\s*\*\s*\[\s*Jeu\s+original\s*\]\s*\(\s*<\s*(?P<url>https?://[^>]+)\s*>\s*\)\s*$",
    re.IGNORECASE | re.MULTILINE,
)

# Extraction generique de valeurs entre crochets
_RE_BRACKETS = re.compile(r"\[(?P<val>[^\]]+)\]")

# Version en fin de nom de thread : "Jeu [v0.12]" -> "v0.12"
_RE_VERSION_IN_THREAD_NAME = re.compile(r"\[(?P<ver>v?[^\]]+)\]\s*$", re.IGNORECASE)


# ==================== HELPERS PURS ====================

def _normalize_version(version: str) -> str:
    """Normalise une version pour la comparaison (retire backticks, espaces superflus)."""
    if not version:
        return ""
    normalized = version.strip().replace("`", "")
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def _extract_f95_thread_id(url: str) -> Optional[str]:
    """
    Extrait l'ID numerique d'un thread F95Zone depuis son URL.

    Exemples :
        https://f95zone.to/threads/game-name.285451/          -> "285451"
        https://f95zone.to/threads/game.8012/post-11944222    -> "8012"
        https://f95zone.to/threads/285451                     -> "285451"
    """
    if not url:
        return None
    match = re.search(r"/threads/(?:[^/]*\.)?(\d+)", url)
    return match.group(1) if match else None


def _extract_version_from_thread_name(thread_name: str) -> Optional[str]:
    """
    Extrait la version depuis le nom d'un thread Discord.
    Ex : 'Growing Problems [v0.12]' -> 'v0.12'
    """
    if not thread_name or not isinstance(thread_name, str):
        return None
    m = _RE_VERSION_IN_THREAD_NAME.search(thread_name.strip())
    return m.group("ver").strip() if m else None


def _build_thread_title_with_version(thread_name: str, new_version: str) -> str:
    """
    Remplace la reference de version entre crochets en fin de titre.
    Ex : 'The Legend of the Goblins [Ch.5]' -> 'The Legend of the Goblins [Ch.6]'
    """
    if not (thread_name and new_version):
        return thread_name or ""
    new_title = _RE_VERSION_IN_THREAD_NAME.sub(
        f"[{new_version}]", thread_name.strip()
    ).strip()
    return new_title or thread_name


def _b64decode_padded(s: str) -> bytes:
    """Decodage base64 tolerant (padding manquant, espaces)."""
    s = (s or "").strip()
    if not s:
        return b""
    missing = (-len(s)) % 4
    if missing:
        s += "=" * missing
    return base64.b64decode(s)


def _decode_metadata_b64(metadata_b64: str) -> Optional[dict]:
    """Decode les metadonnees encodees en base64 vers un dict Python."""
    if not metadata_b64:
        return None
    raw = _b64decode_padded(metadata_b64)
    s = raw.decode("utf-8")
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        import urllib.parse
        return json.loads(urllib.parse.unquote(s))
