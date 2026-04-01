"""
Handlers HTTP aiohttp + make_app() — point d'entree REST.
Dependances : config, api_key_auth, supabase_client, discord_api,
              forum_manager, announcements
Logger       : [api]
"""

import os
import json
import time
import asyncio
import logging
import datetime
from zoneinfo import ZoneInfo
from typing import Optional
from pathlib import Path
import aiohttp
from aiohttp import web

import tempfile

from config import config
from translator import translate_text
from scraper import (
    scrape_f95_synopsis, scrape_f95_title, scrape_f95_game_data,
    extract_f95_thread_id,
    scrape_thread_updated_date, enrich_dates_with_fallback,
    extract_thread_updated_from_html,
    enrich_dates_with_fallback,
    _PLACEHOLDER_DATE,
)
from image_utils import convert_image_url, batch_convert_images
from nexus_export import parse_nexus_db
from api_key_auth import _auth_request, LEGACY_KEY_WARNING
from supabase_client import (
    _get_supabase, _fetch_post_by_thread_id_sync,
    _delete_from_supabase_sync, _normalize_history_row,
    _fetch_all_jeux_sync, _dedupe_jeux_by_site, _sync_jeux_to_supabase,
    _norm_nom_url,
    _delete_account_data_sync, _transfer_post_ownership_sync,
    _transfer_profile_data_sync,
)
from discord_api import rate_limiter
from forum_manager import (
    _create_forum_post, _reroute_post,
    _get_thread_parent_id, _build_metadata_embed,
    _resolve_applied_tag_ids, _delete_old_metadata_messages,
    get_forum_available_tags, sync_forum_fixed_tags,
    _ensure_thread_unarchived,
)
from announcements import _send_announcement, _send_deletion_announcement
from discord_api import (
    _discord_post_json, _discord_patch_json, _discord_list_messages,
    _discord_delete_channel, _discord_suppress_embeds,
    _discord_patch_message_with_attachment,
)
from forum_manager import _fetch_image_from_url, _strip_image_url_from_content
LOG_FILE = Path(__file__).resolve().parent.parent / "logs" / "bot.log"
logger = logging.getLogger("api")

# API externe jeux
F95FR_API_URL = "https://f95fr.duckdns.org/api/jeux"
F95FR_API_KEY = os.getenv("F95FR_API_KEY", "")
_PLACEHOLDER_DATE = "2020-01-01"
# Cache IP -> UUID pour les requetes OPTIONS sans UUID
_ip_user_cache: dict = {}


# ==================== HELPERS ====================

def _get_client_ip(request) -> str:
    """Extrait l'IP du client en tenant compte des reverse proxies."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return request.remote or "unknown"


def _get_user_id(request) -> str:
    """Extrait l'UUID utilisateur du header X-User-ID."""
    uid = request.headers.get("X-User-ID", "").strip()
    return uid if uid else "NULL"


def _with_cors(request, resp):
    """Applique les headers CORS avec whitelist d'origines autorisees."""
    origin = request.headers.get("Origin", "")
    allowed_raw    = config.ALLOWED_ORIGINS or "tauri://localhost"
    allowed_origins = [o.strip() for o in allowed_raw.split(",") if o.strip()]

    if (
        origin in allowed_origins
        or origin.startswith("http://localhost")
        or origin.startswith("http://127.0.0.1")
        or origin.startswith("tauri://")
    ):
        resp.headers.update({
            "Access-Control-Allow-Origin":      origin,
            "Access-Control-Allow-Methods":     "GET,POST,PATCH,OPTIONS",
            "Access-Control-Allow-Headers":     "*",
            "Access-Control-Allow-Credentials": "true",
        })
    else:
        resp.headers.update({
            "Access-Control-Allow-Origin":  "*",
            "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
            "Access-Control-Allow-Headers": "*",
        })
    return resp


# ==================== MIDDLEWARE ====================

@web.middleware
async def logging_middleware(request, handler):
    client_ip = _get_client_ip(request)
    user_id   = _get_user_id(request)
    method    = request.method
    path      = request.path

    raw_key  = (request.headers.get("X-API-KEY") or "").strip()
    key_hint = raw_key[:8] + "..." if len(raw_key) > 8 else ("NOKEY" if not raw_key else raw_key)

    # Resoudre le cache UUID depuis l'IP pour les OPTIONS
    if not user_id or user_id == "NULL":
        if client_ip in _ip_user_cache:
            user_id = _ip_user_cache[client_ip]
    else:
        _ip_user_cache[client_ip] = user_id

    # Ne pas logger les requêtes OPTIONS (prévol CORS) pour réduire le bruit
    if method != "OPTIONS":
        logger.info("[REQUEST] %s | %s | %s | %s %s", client_ip, user_id, key_hint, method, path)

    response = await handler(request)

    if response.status >= 400:
        logger.warning(
            "[HTTP_ERROR] %s | %s | %s | %s %s | STATUS=%d",
            client_ip, user_id, key_hint, method, path, response.status,
        )
    return response


# ==================== HANDLERS ====================

async def scrape_enrich(request):
    from api_server.handlers_enrichment_stream import scrape_enrich as delegated
    return await delegated(request)

async def translate_handler(request):
    from api_server.handlers_enrichment import translate_handler as delegated
    return await delegated(request)

    """
    Traduit un texte (ex. synopsis) via Google Translate.
    POST /api/translate
    Body JSON: { "text": "...", "source_lang": "en", "target_lang": "fr" }
    Réponse: { "ok": true, "translated": "..." } ou { "ok": false, "error": "..." }
    """
    is_valid, _, _, _ = await _auth_request(request, "/api/translate")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    try:
        data = await request.json()
        text = (data.get("text") or "").strip()
        if not text:
            return _with_cors(request, web.json_response({"ok": False, "error": "Texte vide"}, status=400))
        source_lang = (data.get("source_lang") or "en").strip() or "en"
        target_lang = (data.get("target_lang") or "fr").strip() or "fr"
        async with aiohttp.ClientSession() as session:
            translated = await translate_text(session, text, source_lang, target_lang)
        if translated is None:
            return _with_cors(request, web.json_response({"ok": False, "error": "Traduction échouée"}, status=500))
        return _with_cors(request, web.json_response({"ok": True, "translated": translated}))
    except Exception as e:
        logger.exception("[api] /api/translate erreur: %s", e)
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))

# ── Fonction complète : _extract_f95_date_maj ─────────────────────────────────
# Helper utilisé par plusieurs handlers

def _extract_f95_date_maj(scraped_data: dict | None) -> str | None:
    """
    Extrait f95_date_maj depuis scraped_data en excluant le placeholder.
    Valide le format YYYY-MM-DD.
    Retourne None si absent, invalide ou égal au placeholder.
    """
    import re as _re2
    if not scraped_data:
        return None
    raw = str(scraped_data.get("f95_date_maj") or "").strip()
    if not raw or raw == _PLACEHOLDER_DATE:
        return None
    return raw if _re2.match(r'^\d{4}-\d{2}-\d{2}$', raw) else None


# ── Fonction complète : _get_date_from_rss ────────────────────────────────────

async def _get_date_from_rss(
    session: aiohttp.ClientSession,
    thread_id: int,
) -> str | None:
    """
    Cherche la date de MAJ d'un thread dans le flux RSS F95Zone.
    Retourne "YYYY-MM-DD" si trouvé, None sinon.
    Couvre uniquement les ~90 dernières MAJ — rapide (1 requête HTTP partageable).
    """
    import re as _re2
    import xml.etree.ElementTree as ET2
    from email.utils import parsedate_to_datetime as _ptd

    RSS_URL = "https://f95zone.to/sam/latest_alpha/latest_data.php?cmd=rss&cat=games&rows=90"
    try:
        async with session.get(
            RSS_URL,
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=aiohttp.ClientTimeout(total=10),
        ) as resp:
            if resp.status != 200:
                return None
            xml_text = await resp.text(encoding="utf-8", errors="replace")

        root = ET2.fromstring(xml_text)
        for item in root.iter("item"):
            raw = ET2.tostring(item, encoding="unicode")
            m = _re2.search(r'/threads/(?:[^/]*\.)?(\d+)', raw)
            if not m or int(m.group(1)) != thread_id:
                continue
            pub_raw = (item.findtext("pubDate") or "").strip()
            try:
                return _ptd(pub_raw).strftime("%Y-%m-%d") if pub_raw else None
            except Exception:
                return None
        return None

    except Exception:
        return None
async def collection_resolve(request):
    from api_server.handlers_collection import collection_resolve as delegated
    return await delegated(request)


async def nexus_parse_db(request):
    from api_server.handlers_collection import nexus_parse_db as delegated
    return await delegated(request)


async def collection_import_batch(request):
    from api_server.handlers_collection_bulk import collection_import_batch as delegated
    return await delegated(request)


async def collection_f95_traducteurs(request):
    from api_server.handlers_collection import collection_f95_traducteurs as delegated
    return await delegated(request)


async def collection_f95_preview(request):
    from api_server.handlers_collection import collection_f95_preview as delegated
    return await delegated(request)


async def collection_f95_import(request):
    from api_server.handlers_collection_bulk import collection_f95_import as delegated
    return await delegated(request)


async def collection_enrich_entries(request):
    from api_server.handlers_collection_bulk import collection_enrich_entries as delegated
    return await delegated(request)


async def get_logs(request):
    from api_server.handlers_admin import get_logs as delegated
    return await delegated(request)

async def health(request):
    return _with_cors(request, web.json_response({
        "ok":         True,
        "configured": config.configured,
        "rate_limit": rate_limiter.get_info(),
    }))


async def options_handler(request):
    return _with_cors(request, web.Response(status=204))


async def handle_404(request):
    """Catch-all : logge toutes les routes inconnues."""
    client_ip = _get_client_ip(request)
    user_id   = _get_user_id(request)
    raw_key   = (request.headers.get("X-API-KEY") or "").strip()
    key_hint  = raw_key[:8] + "..." if len(raw_key) > 8 else "NOKEY"
    logger.warning(
        "[HTTP_ERROR] %s | %s | %s | %s %s | STATUS=404",
        client_ip, user_id, key_hint, request.method, request.path,
    )
    return _with_cors(request, web.json_response({"error": "Not found"}, status=404))


async def configure(request):
    from api_server.handlers_forum import configure as delegated
    return await delegated(request)


async def forum_post(request):
    from api_server.handlers_forum_publish import forum_post as delegated
    return await delegated(request)


def _save_post_to_supabase(result: dict, title: str, content: str, tags: str,
                            forum_id: int, history_payload_raw: Optional[str]):
    """Sauvegarde ou met a jour un post dans Supabase (published_posts)."""
    sb = _get_supabase()
    if not sb:
        return
    try:
        now = datetime.datetime.now(ZoneInfo("UTC")).isoformat()
        if history_payload_raw:
            try:
                payload = json.loads(history_payload_raw)
            except Exception:
                payload = {}
        else:
            payload = {}

        payload["thread_id"]   = result.get("thread_id") or ""
        payload["message_id"]  = result.get("message_id") or ""
        payload["discord_url"] = result.get("thread_url") or ""
        payload["forum_id"]    = forum_id
        payload.setdefault("title",   title)
        payload.setdefault("content", content)
        payload.setdefault("tags",    tags)
        payload.setdefault("created_at", now)
        payload["updated_at"] = now

        supabase_payload = {k: v for k, v in payload.items() if k not in ("timestamp", "template")}
        sb.table("published_posts").upsert(supabase_payload, on_conflict="id").execute()
        logger.info("[api] Post enregistre dans Supabase : %s", title)
    except Exception as e:
        logger.warning("[api] Echec sauvegarde Supabase : %s", e)


async def forum_post_update(request):
    from api_server.handlers_forum_publish import forum_post_update as delegated
    return await delegated(request)


async def forum_post_delete(request):
    from api_server.handlers_forum import forum_post_delete as delegated
    return await delegated(request)


async def get_history(request):
    from api_server.handlers_forum import get_history as delegated
    return await delegated(request)


async def get_instructions(request):
    from api_server.handlers_forum import get_instructions as delegated
    return await delegated(request)


async def get_forum_tags(request):
    from api_server.handlers_forum import get_forum_tags as delegated
    return await delegated(request)


async def sync_forum_tags(request):
    from api_server.handlers_forum import sync_forum_tags as delegated
    return await delegated(request)


async def update_f95_jeu_synopsis(request):
    """
    Met à jour synopsis_fr et/ou synopsis_en d'une ligne f95_jeux (édition depuis l'app).
    PATCH /api/f95-jeux/{id}/synopsis
    Body: { "synopsis_fr": "...", "synopsis_en": "..." } (au moins un des deux)
    """
    is_valid, _, _, _ = await _auth_request(request, "/api/f95-jeux/synopsis")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    try:
        jeu_id = request.match_info.get("id")
        if not jeu_id:
            return _with_cors(request, web.json_response({"ok": False, "error": "id manquant"}, status=400))
        try:
            jeu_id = int(jeu_id)
        except ValueError:
            return _with_cors(request, web.json_response({"ok": False, "error": "id invalide"}, status=400))
        body = await request.json() if request.body_exists else {}
        synopsis_fr = body.get("synopsis_fr")
        synopsis_en = body.get("synopsis_en")
        if synopsis_fr is None and synopsis_en is None:
            return _with_cors(request, web.json_response(
                {"ok": False, "error": "Fournir au moins synopsis_fr ou synopsis_en"},
                status=400
            ))
        sb = _get_supabase()
        if not sb:
            return _with_cors(request, web.json_response({"ok": False, "error": "Supabase non configuré"}, status=500))
        payload = {"updated_at": datetime.datetime.now(ZoneInfo("UTC")).isoformat()}
        if synopsis_fr is not None:
            payload["synopsis_fr"] = synopsis_fr
        if synopsis_en is not None:
            payload["synopsis_en"] = synopsis_en
        res = sb.table("f95_jeux").update(payload).eq("id", jeu_id).execute()
        if not res.data:
            return _with_cors(request, web.json_response({"ok": False, "error": "Ligne non trouvée"}, status=404))
        return _with_cors(request, web.json_response({"ok": True}))
    except Exception as e:
        logger.exception("[api] PATCH f95_jeux synopsis : %s", e)
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))

async def jeux_sync_force(request):
    """
    Force la resynchronisation complete de f95_jeux depuis l'API externe.
    POST /api/jeux/sync-force
    Retourne { ok, synced_count, errors }
    """
    is_valid, discord_user_id, discord_name, is_legacy = await _auth_request(
        request, "/api/jeux/sync-force"
    )
    if not is_valid:
        return _with_cors(request, web.json_response(
            {"ok": False, "error": "Invalid API key"}, status=401
        ))

    logger.info(
        "[api] /api/jeux/sync-force declenche par %s (id=%s)",
        discord_name or "unknown", discord_user_id or "N/A",
    )

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                F95FR_API_URL,
                headers={"X-API-KEY": F95FR_API_KEY},
                timeout=aiohttp.ClientTimeout(total=60),
            ) as resp:
                if resp.status != 200:
                    logger.warning("[api] jeux/sync-force : API f95fr HTTP %d", resp.status)
                    return _with_cors(request, web.json_response(
                        {"ok": False, "error": f"API upstream HTTP {resp.status}"},
                        status=502,
                    ))
                data = await resp.json()

        if not isinstance(data, list) or not data:
            return _with_cors(request, web.json_response(
                {"ok": False, "error": "Reponse API vide ou invalide"}, status=502
            ))

        synced_count = len(data)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _sync_jeux_to_supabase, data)

        logger.info(
            "[api] jeux/sync-force : %d jeux synchronises par %s",
            synced_count, discord_name or "unknown",
        )
        return _with_cors(request, web.json_response({
            "ok":           True,
            "synced_count": synced_count,
            "errors":       None,
        }))

    except Exception as e:
        logger.exception("[api] jeux/sync-force erreur : %s", e)
        return _with_cors(request, web.json_response(
            {"ok": False, "error": str(e)}, status=500
        ))


async def get_jeux(request):
    """Sert les jeux depuis le cache Supabase (f95_jeux). Fallback sur l'API externe."""
    is_valid, _, _, _ = await _auth_request(request, "/api/jeux")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    sb = _get_supabase()
    if sb:
        try:
            loop = asyncio.get_event_loop()
            data = await loop.run_in_executor(None, _fetch_all_jeux_sync)
            if data:
                data = _dedupe_jeux_by_site(data)
                data = batch_convert_images(data)
                logger.info("[api] %d jeux depuis Supabase (cache, dédupliqués)", len(data))
                return _with_cors(request, web.json_response({
                    "ok": True, "jeux": data, "count": len(data), "source": "cache",
                }))
        except Exception as e:
            logger.warning("[api] Supabase indisponible pour jeux, fallback API externe : %s", e)

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                F95FR_API_URL,
                headers={"X-API-KEY": F95FR_API_KEY},
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                if resp.status != 200:
                    logger.warning("[api] API f95fr erreur %d", resp.status)
                    return _with_cors(request, web.json_response(
                        {"ok": False, "error": f"API upstream {resp.status}"}, status=502
                    ))
                data = await resp.json()

        if sb and isinstance(data, list):
            loop = asyncio.get_event_loop()
            loop.run_in_executor(None, _sync_jeux_to_supabase, data)

        if isinstance(data, list):
            data = _dedupe_jeux_by_site(data)
            data = batch_convert_images(data)
        logger.info("[api] %d jeux depuis API externe (fallback, dédupliqués)", len(data) if isinstance(data, list) else "?")
        return _with_cors(request, web.json_response({
            "ok": True, "jeux": data,
            "count": len(data) if isinstance(data, list) else 0,
            "source": "api",
        }))
    except Exception as e:
        logger.error("[api] Exception get_jeux : %s", e)
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))


async def account_delete(request):
    from api_server.handlers_admin import account_delete as delegated
    return await delegated(request)

async def server_action(request):
    from api_server.handlers_admin import server_action as delegated
    return await delegated(request)


async def transfer_ownership(request):
    from api_server.handlers_admin import transfer_ownership as delegated
    return await delegated(request)


async def admin_profile_transfer(request):
    from api_server.handlers_admin import admin_profile_transfer as delegated
    return await delegated(request)


async def reset_synopsis(request):
    from api_server.handlers_enrichment import reset_synopsis as delegated
    return await delegated(request)

    """
    Remet à NULL synopsis_en et synopsis_fr sur toutes les lignes de f95_jeux.
    POST /api/enrich/reset-synopsis
    Body: { "confirm": "RESET" }  — confirmation explicite obligatoire
    """
    is_valid, _, _, _ = await _auth_request(request, "/api/enrich/reset-synopsis")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    try:
        body = await request.json() if request.body_exists else {}
    except Exception:
        body = {}

    if (body.get("confirm") or "").strip() != "RESET":
        return _with_cors(request, web.json_response(
            {"ok": False, "error": "Confirmation manquante — envoyez { \"confirm\": \"RESET\" }"},
            status=400
        ))

    sb = _get_supabase()
    if not sb:
        return _with_cors(request, web.json_response({"ok": False, "error": "Supabase non configuré"}, status=500))

    try:
        # Mettre synopsis_en et synopsis_fr à NULL sur toutes les lignes
        # Supabase PostgREST ne supporte pas UPDATE sans filtre → on filtre sur id > 0
        res = sb.table("f95_jeux").update({
            "synopsis_en": None,
            "synopsis_fr": None,
        }).gt("id", 0).execute()

        affected = len(res.data) if res.data else 0
        logger.info("[api] reset_synopsis : %d lignes remises à NULL", affected)
        return _with_cors(request, web.json_response({
            "ok":      True,
            "updated": affected,
            "message": f"{affected} ligne(s) remises à NULL (synopsis_en + synopsis_fr)",
        }))
    except Exception as e:
        logger.exception("[api] reset_synopsis : %s", e)
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))


async def get_enrich_synopsis_stats(request):
    from api_server.handlers_enrichment import get_enrich_synopsis_stats as delegated
    return await delegated(request)

    """
    Retourne les statistiques de synopsis pour f95_jeux + liste des entrées manquantes.
    GET /api/enrich/synopsis-stats
    """
    is_valid, _, _, _ = await _auth_request(request, "/api/enrich/synopsis-stats")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    sb = _get_supabase()
    if not sb:
        return _with_cors(request, web.json_response({"ok": False, "error": "Supabase non configuré"}, status=500))

    try:
        # Charger tous les jeux avec leurs synopsis (paginations par blocs de 1000)
        all_rows: list = []
        offset = 0
        PAGE_SIZE = 1000
        while True:
            res = sb.table("f95_jeux") \
                .select("id, nom_du_jeu, nom_url, site_id, synopsis_en, synopsis_fr") \
                .range(offset, offset + PAGE_SIZE - 1) \
                .execute()
            batch = res.data or []
            all_rows.extend(batch)
            if len(batch) < PAGE_SIZE:
                break
            offset += PAGE_SIZE

        if not all_rows:
            return _with_cors(request, web.json_response({
                "ok": True,
                "stats": {"total_groups": 0, "with_synopsis_en": 0, "with_synopsis_fr": 0, "missing_synopsis_fr": 0},
                "missing_entries": [],
            }))

        # Grouper par nom_url normalisé (1 groupe = 1 jeu logique)
        from collections import defaultdict
        by_norm: dict = defaultdict(list)
        for row in all_rows:
            url  = (row.get("nom_url") or "").strip()
            norm = _norm_nom_url(url) if url else None
            if norm:
                by_norm[norm].append(row)
            else:
                # Entrées sans URL normalisable : clé unique par id
                by_norm[f"_noid_{row.get('id', '')}"].append(row)

        total_groups = len(by_norm)
        with_en  = 0
        with_fr  = 0
        missing_fr_entries: list = []

        for _norm, group in by_norm.items():
            has_en = any(r.get("synopsis_en") for r in group)
            has_fr = any(r.get("synopsis_fr") for r in group)
            if has_en:
                with_en += 1
            if has_fr:
                with_fr += 1
            else:
                first   = group[0]
                f95_url = (first.get("nom_url") or "").strip()
                # N'inclure que les entrées avec une URL F95Zone valide (scraping possible)
                if f95_url and "f95zone.to" in f95_url.lower():
                    missing_fr_entries.append({
                        "id":         first.get("id"),
                        "nom_du_jeu": first.get("nom_du_jeu") or "Inconnu",
                        "nom_url":    f95_url,
                        "site_id":    first.get("site_id"),
                        "synopsis_en": first.get("synopsis_en") or "",
                        "group_ids":  [r.get("id") for r in group if r.get("id") is not None],
                    })

        # Limiter la liste retournée (la suite peut être rechargée avec un filtre)
        missing_fr_entries = missing_fr_entries[:300]

        return _with_cors(request, web.json_response({
            "ok": True,
            "stats": {
                "total_groups":       total_groups,
                "with_synopsis_en":   with_en,
                "with_synopsis_fr":   with_fr,
                "missing_synopsis_fr": total_groups - with_fr,
            },
            "missing_entries": missing_fr_entries,
        }))
    except Exception as e:
        logger.exception("[api] get_enrich_synopsis_stats : %s", e)
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))


async def get_journal_logs(request):
    from api_server.handlers_admin import get_journal_logs as delegated
    return await delegated(request)

async def get_f95_rss_updates(request):
    """
    Proxy le flux RSS F95Zone pour éviter les restrictions CORS en mode web.
    GET /api/rss/f95-updates
    Réponse : { ok, entries: [{ threadId, url, title, pubDate }], count }
    """
    is_valid, _, _, _ = await _auth_request(request, "/api/rss/f95-updates")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    import re
    import xml.etree.ElementTree as ET
    from email.utils import parsedate_to_datetime

    RSS_URL = "https://f95zone.to/sam/latest_alpha/latest_data.php?cmd=rss&cat=games&rows=90"

    def _extract_id(url: str):
        m = re.search(r'/threads/(?:[^/]*\.)?(\d+)', url or '')
        return int(m.group(1)) if m else None

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                RSS_URL,
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status != 200:
                    return _with_cors(request, web.json_response(
                        {"ok": False, "error": f"RSS upstream HTTP {resp.status}"},
                        status=502,
                    ))
                xml_text = await resp.text(encoding="utf-8", errors="replace")

        # Parse RSS 2.0 — xml.etree gère bien le namespace vide
        root = ET.fromstring(xml_text)
        entries = []
        for item in root.iter("item"):
            link     = (item.findtext("link") or "").strip()
            title    = (item.findtext("title") or "").strip()
            pub_raw  = (item.findtext("pubDate") or "").strip()
            tid = _extract_id(link)
            if not tid:
                continue
            try:
                pub_iso = parsedate_to_datetime(pub_raw).isoformat() if pub_raw else ""
            except Exception:
                pub_iso = ""
            entries.append({
                "threadId": tid,
                "url":      link,
                "title":    title,
                "pubDate":  pub_iso,
            })

        logger.info("[api] RSS F95 : %d entrées récupérées", len(entries))
        return _with_cors(request, web.json_response({
            "ok":      True,
            "entries": entries,
            "count":   len(entries),
        }))

    except ET.ParseError as e:
        logger.warning("[api] RSS parse error : %s", e)
        return _with_cors(request, web.json_response({"ok": False, "error": f"Parse XML : {e}"}, status=500))
    except Exception as e:
        logger.exception("[api] get_f95_rss_updates : %s", e)
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))

async def scrape_thread_dates(request):
    from api_server.handlers_enrichment import scrape_thread_dates as delegated
    return await delegated(request)

    """
    Enrichit date_maj pour les jeux absents du flux RSS.
    POST /api/scrape/thread-dates
    Body JSON: {
        "jeux": [{"site_id": 123, "nom_url": "https://..."}],
        "rss_date_map": {"123": "2026-03-14T..."},   # optionnel
        "f95_cookies": "...",                         # optionnel
        "scrape_delay": 2.0
    }
    Réponse streaming NDJSON (même pattern que scrape_enrich).
    """
    is_valid, _, _, _ = await _auth_request(request, "/api/scrape/thread-dates")
    if not is_valid:
        return _with_cors(request, web.json_response(
            {"ok": False, "error": "Invalid API key"}, status=401
        ))

    try:
        body = await request.json() or {}
    except Exception:
        return _with_cors(request, web.json_response(
            {"ok": False, "error": "Body JSON invalide"}, status=400
        ))

    jeux         = body.get("jeux") or []
    rss_raw      = body.get("rss_date_map") or {}
    f95_cookies  = (body.get("f95_cookies") or "").strip() or None
    try:
        scrape_delay = max(1.0, float(body.get("scrape_delay") or 2.0))
    except (TypeError, ValueError):
        scrape_delay = 2.0

    # Normaliser les clés du rss_date_map en int
    rss_date_map = {int(k): v for k, v in rss_raw.items() if str(k).isdigit()}

    if not jeux:
        return _with_cors(request, web.json_response(
            {"ok": False, "error": "Paramètre 'jeux' requis (liste non vide)"}, status=400
        ))

    response = web.StreamResponse()
    response.headers["Content-Type"] = "application/x-ndjson"
    response.headers["Cache-Control"] = "no-cache"
    response.headers["X-Accel-Buffering"] = "no"
    origin = request.headers.get("Origin", "")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    await response.prepare(request)

    client_disconnected = [False]

    async def send(data: dict) -> bool:
        try:
            await response.write(
                (json.dumps(data, ensure_ascii=False) + "\n").encode("utf-8")
            )
            await response.drain()
            return True
        except Exception as e:
            if any(k in str(e).lower() for k in ("closing transport", "connection reset", "broken pipe")):
                client_disconnected[0] = True
            return False

    try:
        updated_count = 0
        sb = _get_supabase()

        async def on_progress(current, total, site_id, date):
            if client_disconnected[0]:
                return
            msg = (
                f"✅ [{current}/{total}] site_id={site_id} → {date}"
                if date
                else f"⏭️ [{current}/{total}] site_id={site_id} — introuvable"
            )
            await send({"progress": {"current": current, "total": total}, "log": msg})
            if date and sb:
                try:
                    sb.table("f95_jeux").update({"f95_date_maj": date}).eq("site_id", site_id).execute()
                    nonlocal updated_count
                    updated_count += 1
                except Exception as e:
                    logger.warning("[api] scrape_thread_dates : erreur Supabase site_id=%s : %s", site_id, e)

        await send({"log": f"🔍 {len(jeux)} jeux à traiter ({len(rss_date_map)} depuis RSS)…"})

        async with aiohttp.ClientSession() as session:
            await enrich_dates_with_fallback(
                session,
                jeux=jeux,
                rss_date_map=rss_date_map,
                cookies=f95_cookies,
                scrape_delay=scrape_delay,
                progress_callback=on_progress,
            )

        if not client_disconnected[0]:
            await send({
                "log":     f"🎉 Terminé : {updated_count} date(s) mise(s) à jour dans f95_jeux",
                "status":  "completed",
                "updated": updated_count,
            })

    except Exception as e:
        logger.error("[api] scrape_thread_dates erreur : %s", e, exc_info=True)
        await send({"error": str(e), "status": "error"})
    finally:
        await response.write_eof()

    return response

async def scrape_missing_dates(request):
    from api_server.handlers_enrichment_stream import scrape_missing_dates as delegated
    return await delegated(request)

# ==================== APP ====================

def make_app() -> web.Application:
    """Façade de compatibilité: délègue à l'orchestrateur factorisé."""
    from api_server.app import make_app as make_app_orchestrated
    return make_app_orchestrated()
