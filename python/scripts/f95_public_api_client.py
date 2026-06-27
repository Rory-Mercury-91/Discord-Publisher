"""
Client API publique F95 France + mapping vers le format historique f95_jeux.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import time
from typing import Any

import aiohttp

logger = logging.getLogger("f95-public-api")

F95_PUBLIC_API_BASE = (os.getenv("F95_PUBLIC_API_BASE") or "https://api.f95france.site").rstrip("/")
F95_PUBLIC_API_GAMES_URL = f"{F95_PUBLIC_API_BASE}/v1/games"
F95_PUBLIC_API_TRANSLATORS_URL = f"{F95_PUBLIC_API_BASE}/v1/translators"
F95_PUBLIC_API_KEY = (os.getenv("F95_PUBLIC_API_KEY") or os.getenv("F95FR_API_KEY") or "").strip()

# Cache court pour éviter de re-télécharger toute la liste à chaque résolution unitaire.
_GAMES_INDEX_CACHE: dict[int, dict[str, Any]] | None = None
_GAMES_INDEX_CACHE_AT: float = 0.0
_GAMES_INDEX_TTL_SECONDS = 300.0

_WEBSITE_TO_SITE = {
    "f95z"  : "F95Zone",
    "lc"    : "LewdCorner",
    "other" : "Autres",
}
# Anciennes valeurs présentes dans f95_jeux avant migration vers la nouvelle API
_SITE_LEGACY_ALIASES = {
    "f95z"    : "F95Zone",
    "lewdcorner": "LewdCorner",
}
_INVALID_TRANSLATOR_NAMES = {
    "integrated",
    "no_translation",
    "translation",
    "translation_with_mods",
}
_STATUS_LABELS = {
    "in_progress": "EN COURS",
    "completed": "TERMINÉ",
    "abandoned": "ABANDONNÉ",
}
_TRAD_TYPE_LABELS = {
    "auto": "Traduction Automatique",
    "manual": "Traduction Humaine",
    "semi-auto": "Traduction Semi-Automatique",
    "semi_auto": "Traduction Semi-Automatique",
    "hs": "Lien de traduction HS",
    "vf": "Version française",
    "to_tested": "À tester",
}


def _stable_int_id(seed: str) -> int:
    """
    Produit un entier stable (31 bits) compatible avec une PK integer.
    """
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:8]
    return int(digest, 16) & 0x7FFFFFFF


def _normalize_thread_id(raw: Any, link: str | None) -> int | None:
    if isinstance(raw, int):
        return raw
    if isinstance(raw, str) and raw.strip().isdigit():
        return int(raw.strip())
    if link:
        match = re.search(r"/threads/(?:[^/]*\.)?(\d+)", link)
        if match:
            return int(match.group(1))
    return None


def _clean_optional_text(value: Any) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def extract_game_synopsis(game: dict[str, Any]) -> tuple[str | None, str | None]:
    """
    Extrait synopsis EN/FR depuis un objet Game de l'API publique.
    """
    synopsis_en = _clean_optional_text(game.get("description"))
    synopsis_fr = _clean_optional_text(game.get("descriptionFr"))
    return synopsis_en, synopsis_fr


def build_games_index_by_thread_id(games: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    """
    Indexe les jeux API par threadId (site_id F95/LewdCorner).
    """
    index: dict[int, dict[str, Any]] = {}
    for game in games:
        if not isinstance(game, dict):
            continue
        thread_id = _normalize_thread_id(game.get("threadId"), game.get("link"))
        if thread_id is not None:
            index[thread_id] = game
    return index


def build_api_date_map(games_index: dict[int, dict[str, Any]]) -> dict[int, str]:
    """
    Extrait {threadId: YYYY-MM-DD} depuis l'index API (champ updatedAt du jeu).
    """
    result: dict[int, str] = {}
    for thread_id, game in games_index.items():
        date_value = _iso_to_yyyy_mm_dd(game.get("updatedAt"))
        if date_value and date_value != "2020-01-01":
            result[int(thread_id)] = date_value
    return result


def _pick_primary_translation(game: dict[str, Any]) -> dict[str, Any]:
    translations = game.get("translations")
    if not isinstance(translations, list):
        return {}
    valid = [tr for tr in translations if isinstance(tr, dict)]
    if not valid:
        return {}
    ac_rows = [tr for tr in valid if bool(tr.get("ac"))]
    return (ac_rows or valid)[0]


def public_game_to_scraped_data(
    game: dict[str, Any],
    *,
    f95_date_override: str | None = None,
) -> dict[str, Any]:
    """
    Convertit un jeu API publique vers le format scraped_data utilisé en collection.
    """
    synopsis_en, synopsis_fr = extract_game_synopsis(game)
    api_date = _iso_to_yyyy_mm_dd(game.get("updatedAt"))
    f95_date = api_date or f95_date_override
    translation = _pick_primary_translation(game)

    data: dict[str, Any] = {
        "name"        : game.get("name"),
        "version"     : game.get("gameVersion"),
        "image"       : game.get("image"),
        "tags"        : game.get("tags"),
        "synopsis"    : synopsis_en,
        "synopsis_en" : synopsis_en,
        "synopsis_fr" : synopsis_fr,
        "f95_date_maj": f95_date,
        "source"      : "f95_public_api",
    }
    if translation:
        data.update({
            "trad_ver"          : translation.get("tversion"),
            "lien_trad"         : translation.get("tlink"),
            "status"            : _to_legacy_status(translation.get("status")),
            "type"              : translation.get("gameType"),
            "type_de_traduction": _to_legacy_trad_type(translation.get("ttype")),
        })
    return {k: v for k, v in data.items() if v is not None}


def _iso_to_yyyy_mm_dd(value: Any) -> str | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:10] if len(text) >= 10 else None


def _to_legacy_site_label(website_code: Any) -> str | None:
    code = (str(website_code or "")).strip().lower()
    if not code:
        return None
    # Valeur connue → label canonique ; sinon on capitalise proprement
    return _WEBSITE_TO_SITE.get(code, code.capitalize())


def normalize_site_label(raw: Any) -> str | None:
    """
    Normalise un label site déjà stocké (ex. ancien 'F95z' → 'F95Zone').
    Utilisé pour la migration des lignes créées avant la nouvelle API.
    """
    if not raw:
        return raw
    stripped = str(raw).strip()
    return _SITE_LEGACY_ALIASES.get(stripped, stripped) or stripped


def _to_legacy_translator_name(value: Any) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    if raw.lower() in _INVALID_TRANSLATOR_NAMES:
        return None
    return raw


def _to_legacy_status(value: Any) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    return _STATUS_LABELS.get(raw.lower(), raw.upper())


def _to_legacy_trad_type(value: Any) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    return _TRAD_TYPE_LABELS.get(raw.lower(), raw)


def map_public_games_to_legacy_rows(
    games: list[dict[str, Any]],
    translator_name_by_id: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """
    Aplati /v1/games (avec include=translations) vers le format f95_jeux.

    Correspondance des champs :
      Game API          → f95_jeux
      ─────────────────────────────────────────────────────────────────
      name              → nom_du_jeu
      tags              → tags
      image             → image
      description       → synopsis_en
      descriptionFr     → synopsis_fr
      website           → site  (f95z→F95Zone, lc→LewdCorner)
      threadId          → site_id
      link              → nom_url
      gameVersion       → version
      updatedAt (game)  → f95_date_maj  (dernière MAJ du jeu sur F95)

      Translation API   → f95_jeux
      ─────────────────────────────────────────────────────────────────
      status            → statut  (in_progress→EN COURS, etc.)
      tversion          → trad_ver
      tlink             → lien_trad
      tname             → traducteur  (fallback si translatorId absent)
      ttype             → type_de_traduction
      gameType          → type
      ac                → ac  (bool → "1" / "")
      updatedAt (trad)  → date_maj  (dernière MAJ de la traduction)
    """
    rows: list[dict[str, Any]] = []
    for game in games:
        if not isinstance(game, dict):
            continue

        game_id      = str(game.get("id") or "").strip()
        name         = (game.get("name") or "").strip()
        link         = (game.get("link") or "").strip()
        site_id      = _normalize_thread_id(game.get("threadId"), link)
        description, description_fr = extract_game_synopsis(game)
        site_label   = _to_legacy_site_label(game.get("website"))
        game_version = game.get("gameVersion")
        tags         = game.get("tags")
        image        = game.get("image")
        # f95_date_maj = date de dernière MAJ du JEU sur F95Zone (≠ date_maj qui est la trad)
        f95_date_maj = _iso_to_yyyy_mm_dd(game.get("updatedAt"))

        translations = game.get("translations")
        if not isinstance(translations, list) or not translations:
            translations = [None]

        for idx, translation in enumerate(translations):
            tr    = translation if isinstance(translation, dict) else {}
            tr_id = str(tr.get("id") or "").strip() or f"none-{idx}"
            # Seed stable : UUID jeu + UUID traduction + site_id (évite toute collision)
            seed  = f"{game_id}:{tr_id}:{site_id or 0}"

            # Résolution du traducteur : translatorId (table /translators) > tname (direct)
            translator_id   = str(tr.get("translatorId") or "").strip()
            translator_info = (translator_name_by_id or {}).get(translator_id)

            if isinstance(translator_info, dict):
                # Nouveau format enrichi : {"name": ..., "pages": ...}
                translator_name = _to_legacy_translator_name(translator_info.get("name"))
                traducteur_url  = translator_info.get("pages") or None
            elif isinstance(translator_info, str):
                # Ancien format de compatibilité : {id: name}
                translator_name = _to_legacy_translator_name(translator_info)
                traducteur_url  = None
            else:
                translator_name = None
                traducteur_url  = None

            # Fallback sur tname si translatorId non résolu
            if not translator_name:
                translator_name = _to_legacy_translator_name(tr.get("tname"))

            row = {
                "id"                : _stable_int_id(seed),
                "game_uuid"         : game_id or None,
                "site_id"           : site_id,
                "site"              : site_label,
                "nom_du_jeu"        : name,
                "nom_url"           : link or (
                    f"https://f95zone.to/threads/{site_id}" if site_id else None
                ),
                "version"           : game_version,
                "trad_ver"          : tr.get("tversion"),
                "lien_trad"         : tr.get("tlink"),
                "statut"            : _to_legacy_status(tr.get("status")),
                "tags"              : tags,
                "type"              : tr.get("gameType"),
                "traducteur"        : translator_name,
                # traducteur_url : champ "pages" du traducteur depuis /v1/translators
                "traducteur_url"    : traducteur_url,
                "type_de_traduction": _to_legacy_trad_type(tr.get("ttype")),
                "ac"                : "1" if bool(tr.get("ac")) else "",
                "image"             : image,
                "type_maj"          : None,
                # date_maj  = MAJ de la traduction ; f95_date_maj = MAJ du jeu sur F95
                "date_maj"          : _iso_to_yyyy_mm_dd(tr.get("updatedAt")) or f95_date_maj,
                "f95_date_maj"      : f95_date_maj,
                "synopsis_en"       : description,
                "synopsis_fr"       : description_fr,
            }
            rows.append(row)

    return rows


def _extract_translator_url(pages: Any) -> str | None:
    """
    Extrait la première URL utilisable depuis le champ TranslatorPublic.pages.

    Le champ pages est un texte JSON de la forme :
      [{"name": "F95Zone", "link": "https://..."}, ...]
    On retourne le premier "link" non vide, ou None si le champ est absent/invalide.
    Si la valeur est déjà une URL directe (pas de JSON), on la retourne telle quelle.
    """
    import json as _json
    if not pages:
        return None
    raw = str(pages).strip()
    if not raw:
        return None
    try:
        parsed = _json.loads(raw)
        if isinstance(parsed, list):
            for entry in parsed:
                if isinstance(entry, dict):
                    link = str(entry.get("link") or "").strip()
                    if link:
                        return link
                elif isinstance(entry, str) and entry.strip():
                    return entry.strip()
        elif isinstance(parsed, str):
            return parsed.strip() or None
    except (_json.JSONDecodeError, TypeError, ValueError):
        # Pas du JSON — on suppose que c'est une URL directe
        if raw.startswith(("http://", "https://")):
            return raw
    return None


async def fetch_public_games_index(
    session: aiohttp.ClientSession,
    *,
    timeout_seconds: int = 60,
    force_refresh: bool = False,
) -> dict[int, dict[str, Any]]:
    """
    Retourne {threadId → Game} avec cache mémoire court.
    """
    global _GAMES_INDEX_CACHE, _GAMES_INDEX_CACHE_AT

    now = time.monotonic()
    if (
        not force_refresh
        and _GAMES_INDEX_CACHE is not None
        and (now - _GAMES_INDEX_CACHE_AT) < _GAMES_INDEX_TTL_SECONDS
    ):
        return _GAMES_INDEX_CACHE

    games = await fetch_public_games(session, timeout_seconds=timeout_seconds)
    _GAMES_INDEX_CACHE = build_games_index_by_thread_id(games)
    _GAMES_INDEX_CACHE_AT = now
    logger.info("[f95-public-api] index threadId : %d jeu(x)", len(_GAMES_INDEX_CACHE))
    return _GAMES_INDEX_CACHE


async def find_public_game_by_thread_id(
    session: aiohttp.ClientSession,
    thread_id: int,
    *,
    timeout_seconds: int = 60,
    force_refresh: bool = False,
) -> dict[str, Any] | None:
    """
    Recherche un jeu API publique par threadId (site_id).
    """
    try:
        tid = int(thread_id)
    except (TypeError, ValueError):
        return None
    index = await fetch_public_games_index(
        session,
        timeout_seconds=timeout_seconds,
        force_refresh=force_refresh,
    )
    return index.get(tid)


async def fetch_public_games(session: aiohttp.ClientSession, *, timeout_seconds: int = 60) -> list[dict[str, Any]]:
    """
    Récupère les jeux depuis l'API publique F95 France.
    """
    headers = {
        "Accept": "application/json",
    }
    if F95_PUBLIC_API_KEY:
        headers["Authorization"] = f"Bearer {F95_PUBLIC_API_KEY}"
        headers["X-Api-Key"] = F95_PUBLIC_API_KEY

    async with session.get(
        F95_PUBLIC_API_GAMES_URL,
        params={"include": "translations"},
        headers=headers,
        timeout=aiohttp.ClientTimeout(total=timeout_seconds),
    ) as resp:
        if resp.status != 200:
            body = await resp.text()
            raise RuntimeError(f"API publique HTTP {resp.status}: {body[:200]}")

        payload = await resp.json()
        if not isinstance(payload, list):
            raise RuntimeError("Réponse /v1/games invalide (liste attendue)")

        logger.info("[f95-public-api] %d jeu(x) récupéré(s)", len(payload))
        return payload


async def fetch_public_translators(
    session: aiohttp.ClientSession,
    *,
    timeout_seconds: int = 60,
) -> dict[str, dict[str, str | None]]:
    """
    Récupère la table des traducteurs publics.
    Retourne {translatorId (UUID str) → {"name": str, "pages": str | None}}.

    Le champ "pages" provient de TranslatorPublic.pages et est utilisé comme
    traducteur_url dans f95_jeux (lien vers la page/profil du traducteur).
    """
    headers = {"Accept": "application/json"}
    if F95_PUBLIC_API_KEY:
        headers["Authorization"] = f"Bearer {F95_PUBLIC_API_KEY}"
        headers["X-Api-Key"]     = F95_PUBLIC_API_KEY

    async with session.get(
        F95_PUBLIC_API_TRANSLATORS_URL,
        headers=headers,
        timeout=aiohttp.ClientTimeout(total=timeout_seconds),
    ) as resp:
        if resp.status != 200:
            body = await resp.text()
            raise RuntimeError(f"API publique /translators HTTP {resp.status}: {body[:200]}")
        payload = await resp.json()
        if not isinstance(payload, list):
            raise RuntimeError("Réponse /v1/translators invalide (liste attendue)")

        mapping: dict[str, dict[str, str | None]] = {}
        for row in payload:
            if not isinstance(row, dict):
                continue
            rid  = str(row.get("id") or "").strip()
            name = _to_legacy_translator_name(row.get("name"))
            if not rid or not name:
                continue
            mapping[rid] = {"name": name, "pages": _extract_translator_url(row.get("pages"))}

        logger.info("[f95-public-api] %d traducteur(s) public(s) récupéré(s)", len(mapping))
        return mapping
