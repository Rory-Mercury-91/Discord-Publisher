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
from scraper import scrape_f95_synopsis, scrape_f95_title, scrape_f95_game_data, extract_f95_thread_id
from nexus_export import parse_nexus_db
from api_key_auth import _auth_request, LEGACY_KEY_WARNING
from supabase_client import (
    _get_supabase, _fetch_post_by_thread_id_sync,
    _delete_from_supabase_sync, _normalize_history_row,
    _fetch_all_jeux_sync, _dedupe_jeux_by_site, _sync_jeux_to_supabase,
    _norm_nom_url,
    _delete_account_data_sync, _transfer_post_ownership_sync,
)
from discord_api import rate_limiter
from forum_manager import (
    _create_forum_post, _reroute_post,
    _get_thread_parent_id, _build_metadata_embed,
    _resolve_applied_tag_ids, _delete_old_metadata_messages,
    get_forum_available_tags, sync_forum_fixed_tags,
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
    is_valid, discord_user_id, discord_name, is_legacy = await _auth_request(
        request, "/api/scrape/enrich"
    )
    if not is_valid:
        return web.json_response(
            {"ok": False, "error": "Invalid API key"},
            status=401
        )

    body_params = {}
    try:
        body = await request.read()
        if body:
            body_params = json.loads(body.decode("utf-8")) or {}
    except Exception:
        pass

    force          = body_params.get("force", False)
    f95_cookies    = (body_params.get("f95_cookies") or "").strip() or None  # ← NOUVEAU
    target_ids_raw = body_params.get("target_ids")
    target_set: set = set()
    if target_ids_raw and isinstance(target_ids_raw, list):
        for i in target_ids_raw:
            try:
                target_set.add(int(i))
            except (TypeError, ValueError):
                pass

    logger.info(
        "[api] /scrape/enrich lancé par %s (id=%s) force=%s target_ids=%s cookies=%s",
        discord_name or "unknown", discord_user_id or "N/A", force,
        len(target_set) if target_set else "tous",
        "oui" if f95_cookies else "non",   # ← NOUVEAU
    )

    sb = _get_supabase()
    if not sb:
        return web.json_response(
            {"ok": False, "error": "Supabase non configuré"},
            status=500
        )

    response = web.StreamResponse()
    response.headers['Content-Type'] = 'application/x-ndjson'
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'

    origin = request.headers.get("Origin", "")
    if origin:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'

    await response.prepare(request)

    client_disconnected = [False]

    async def send_json(data: dict) -> bool:
        try:
            await response.write((json.dumps(data, ensure_ascii=False) + '\n').encode('utf-8'))
            await response.drain()
            return True
        except Exception as e:
            err_lower = str(e).lower()
            if "closing transport" in err_lower or "connection reset" in err_lower or "broken pipe" in err_lower:
                client_disconnected[0] = True
                return False
            logger.warning("[api] Erreur envoi SSE : %s", e)
            return False

    try:
        await send_json({"log": "📥 Récupération des jeux depuis f95_jeux..."})

        all_jeux = []
        offset = 0
        PAGE_SIZE = 1000

        while True:
            # ← MODIFIÉ : ajout de .order("id") pour garantir une pagination stable
            res = sb.table("f95_jeux") \
                .select("id, nom_du_jeu, nom_url, site_id") \
                .order("id") \
                .range(offset, offset + PAGE_SIZE - 1) \
                .execute()

            batch = res.data or []
            all_jeux.extend(batch)

            if len(batch) < PAGE_SIZE:
                break
            offset += PAGE_SIZE

        if not all_jeux:
            await send_json({"log": "⚠️ Aucun jeu trouvé dans f95_jeux"})
            await send_json({"status": "completed"})
            await response.write_eof()
            return response

        await send_json({
            "log": f"📊 {len(all_jeux)} jeux récupérés depuis f95_jeux",
            "progress": {"current": 0, "total": len(all_jeux)}
        })

        await send_json({"log": "🔍 Vérification des synopsis existants (f95_jeux)..."})

        jeux_synopsis_res = sb.table("f95_jeux") \
            .select("nom_url, synopsis_fr") \
            .not_.is_("synopsis_fr", "null") \
            .execute()

        existing_by_url = {}
        for g in (jeux_synopsis_res.data or []):
            norm = _norm_nom_url(g.get("nom_url"))
            if norm:
                existing_by_url[norm] = True

        await send_json({
            "log": f"✅ {len(existing_by_url)} URL(s) avec synopsis dans f95_jeux"
        })

        from collections import defaultdict
        by_norm_url = defaultdict(list)
        for jeu in all_jeux:
            url = (jeu.get("nom_url") or "").strip()
            if not url or "f95zone.to" not in url.lower():
                continue
            norm = _norm_nom_url(url)
            if norm:
                by_norm_url[norm].append(jeu)

        to_enrich = []
        for norm_url, group in by_norm_url.items():
            if not group:
                continue
            if target_set:
                if not any(jeu.get("id") in target_set for jeu in group):
                    continue
            elif not force and existing_by_url.get(norm_url):
                continue
            to_enrich.append((norm_url, group))

        total = len(to_enrich)

        if total == 0:
            if target_set:
                msg = f"ℹ️ Aucun groupe trouvé pour les {len(target_set)} ID(s) ciblé(s)."
            else:
                msg = f"ℹ️ Aucun jeu à enrichir ({len(by_norm_url)} groupes, tous ont déjà un synopsis). Utilisez « Forcer la re-traduction » pour tout refaire."
            await send_json({"log": msg})
            await send_json({"status": "completed", "failed_entries": []})
            await response.write_eof()
            return response

        total_rows = sum(len(g) for _, g in to_enrich)
        await send_json({
            "log": f"🎮 {total} groupe(s) à enrichir ({total_rows} ligne(s) au total) — 1 scrape + 1 traduction par groupe",
            "progress": {"current": 0, "total": total}
        })

        enriched = 0
        failed: list = []

        async with aiohttp.ClientSession() as session:
            for idx, (norm_url, group) in enumerate(to_enrich, 1):
                if client_disconnected[0]:
                    break
                first = group[0]
                nom = first.get("nom_du_jeu", "Sans nom")
                f95_url = (first.get("nom_url") or "").strip()
                expected_site_id = first.get("site_id")

                if not await send_json({"progress": {"current": idx, "total": total}}):
                    break

                if not await send_json({"log": f"🕷️ [{idx}/{total}] {nom} — Scraping synopsis..."}):
                    break

                # ← MODIFIÉ : déballage du tuple (synopsis, scraped_id)
                synopsis_en, scraped_id = await scrape_f95_synopsis(session, f95_url, cookies=f95_cookies)

                if not synopsis_en:
                    failed.append({
                        "id":        first.get("id"),
                        "nom_du_jeu": nom,
                        "nom_url":   f95_url,
                        "group_ids": [j.get("id") for j in group if j.get("id") is not None],
                        "raison":    "synopsis_introuvable",
                    })
                    if not await send_json({"log": f"⏭️ [{idx}/{total}] {nom} — Synopsis introuvable"}):
                        break
                    continue

                # ← MODIFIÉ : validation cohérence — l'URL scrappée doit correspondre au site_id attendu
                if scraped_id and expected_site_id and int(scraped_id) != int(expected_site_id):
                    failed.append({
                        "id":        first.get("id"),
                        "nom_du_jeu": nom,
                        "nom_url":   f95_url,
                        "group_ids": [j.get("id") for j in group if j.get("id") is not None],
                        "raison":    "url_incoherente",
                    })
                    if not await send_json({"log": (
                        f"🚫 [{idx}/{total}] {nom} — Incohérence URL détectée "
                        f"(site_id attendu={expected_site_id}, ID scrapé={scraped_id}). "
                        f"Écriture annulée pour éviter toute corruption."
                    )}):
                        break
                    continue

                if not await send_json({"log": f"🌐 [{idx}/{total}] {nom} — Traduction EN → FR..."}):
                    break

                synopsis_fr = await translate_text(session, synopsis_en, "en", "fr")

                if not synopsis_fr:
                    failed.append({
                        "id":        first.get("id"),
                        "nom_du_jeu": nom,
                        "nom_url":   f95_url,
                        "group_ids": [j.get("id") for j in group if j.get("id") is not None],
                        "raison":    "traduction_echouee",
                    })
                    if not await send_json({"log": f"❌ [{idx}/{total}] {nom} — Traduction échouée"}):
                        break
                    continue

                now = datetime.datetime.now(ZoneInfo("UTC")).isoformat()
                try:
                    for jeu in group:
                        jeu_id = jeu.get("id")
                        if jeu_id is None:
                            continue
                        sb.table("f95_jeux").update({
                            "synopsis_en": synopsis_en,
                            "synopsis_fr": synopsis_fr,
                            "updated_at": now
                        }).eq("id", jeu_id).execute()
                    enriched += len(group)
                    if not await send_json({"log": f"✅ [{idx}/{total}] {nom} — {len(group)} ligne(s) mise(s) à jour"}):
                        break
                except Exception as e:
                    logger.error(
                        "[api] Erreur sauvegarde f95_jeux synopsis (%s) : %s",
                        nom, e
                    )
                    if not await send_json({"log": f"❌ [{idx}/{total}] {nom} — Erreur sauvegarde : {e}"}):
                        break

                if idx < total and not client_disconnected[0]:
                    await asyncio.sleep(2.0)

        if not client_disconnected[0]:
            failed_count = len(failed)
            summary_parts = [f"{enriched} ligne(s) mise(s) à jour dans {total} groupe(s)"]
            if failed_count:
                summary_parts.append(f"{failed_count} échec(s)")
            await send_json({
                "log":            f"🎉 Enrichissement terminé : {', '.join(summary_parts)}",
                "status":         "completed",
                "failed_entries": failed,
            })

    except Exception as e:
        logger.error("[api] Erreur enrichissement : %s", e, exc_info=True)
        await send_json({
            "error": str(e),
            "status": "error"
        })

    finally:
        await response.write_eof()

    return response

async def translate_handler(request):
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


async def collection_resolve(request):
    """
    Résout une URL ou un ID F95 via le scraper complet (scrape_f95_game_data) et retourne
    f95_thread_id, titre, URL et scraped_data (image, version, statut, tags, type, synopsis, synopsis_fr).
    POST /api/collection/resolve
    Body JSON: { "url": "..." } ou { "f95_thread_id": 12345 }
    Option: "translate_synopsis" (bool, défaut True) — traduit le synopsis EN→FR via Google Translate.
    """
    is_valid, _, _, _ = await _auth_request(request, "/api/collection/resolve")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    try:
        data = await request.json() or {}
        url = (data.get("url") or "").strip()
        thread_id_raw = data.get("f95_thread_id")
        f95_thread_id = int(thread_id_raw) if thread_id_raw is not None and str(thread_id_raw).strip() != "" else None

        if url and "f95zone.to" not in url.lower() and "lewdcorner.com" not in url.lower():
            return _with_cors(request, web.json_response({"ok": False, "error": "URL F95Zone/LewdCorner invalide"}, status=400))
        if not url and f95_thread_id is None:
            return _with_cors(request, web.json_response({"ok": False, "error": "Fournir url ou f95_thread_id"}, status=400))

        if url:
            tid_str = extract_f95_thread_id(url)
            f95_thread_id = int(tid_str) if tid_str else None
            if not f95_thread_id:
                return _with_cors(request, web.json_response({"ok": False, "error": "Impossible d'extraire l'ID du thread depuis l'URL"}, status=400))
            if not url.startswith("http"):
                url = "https://f95zone.to" + url if url.startswith("/") else "https://f95zone.to/threads/thread." + str(f95_thread_id) + "/"
        else:
            url = f"https://f95zone.to/threads/thread.{f95_thread_id}/"

        cookies = (data.get("cookies") or "").strip() or None
        translate_synopsis = data.get("translate_synopsis", True)

        synopsis_en = None
        synopsis_fr = None
        async with aiohttp.ClientSession() as session:
            game_data = await scrape_f95_game_data(session, url, cookies=cookies)

            if not game_data:
                return _with_cors(request, web.json_response({
                    "ok": True,
                    "f95_thread_id": f95_thread_id,
                    "title": None,
                    "f95_url": url,
                    "scraped_data": None,
                }))

            synopsis_en = (game_data.get("synopsis") or "").strip()
            if synopsis_en and translate_synopsis:
                try:
                    synopsis_fr = await translate_text(session, synopsis_en, "en", "fr")
                except Exception as e:
                    logger.warning("[api] collection_resolve: traduction synopsis échouée: %s", e)

        title = game_data.get("name") or game_data.get("title")
        scraped_data = {
            "name": game_data.get("name"),
            "version": game_data.get("version"),
            "image": game_data.get("image"),
            "status": game_data.get("status"),
            "tags": game_data.get("tags"),
            "type": game_data.get("type"),
            "synopsis": synopsis_en or game_data.get("synopsis"),
            "synopsis_fr": synopsis_fr,
        }

        return _with_cors(request, web.json_response({
            "ok": True,
            "f95_thread_id": game_data.get("id") or f95_thread_id,
            "title": title,
            "f95_url": url,
            "scraped_data": scraped_data,
        }))
    except ValueError as e:
        return _with_cors(request, web.json_response({"ok": False, "error": "f95_thread_id invalide"}, status=400))
    except Exception as e:
        logger.exception("[api] /api/collection/resolve erreur: %s", e)
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))


async def nexus_parse_db(request):
    """
    Analyse un fichier .db SQLite de Nexus et retourne les entrées de jeux adultes.
    POST /api/collection/nexus-parse-db (multipart form: champ "file")
    Réponse : { "ok": true, "entries": [...], "stats": {...}, "warnings": [...] }
    """
    is_valid, _, _, _ = await _auth_request(request, "/api/collection/nexus-parse-db")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    db_bytes = None
    try:
        reader = await request.multipart()
        async for field in reader:
            if field.name == "file":
                db_bytes = await field.read()
                break
    except Exception as e:
        return _with_cors(request, web.json_response({"ok": False, "error": f"Lecture du fichier échouée : {e}"}, status=400))

    if not db_bytes:
        return _with_cors(request, web.json_response({"ok": False, "error": "Champ 'file' manquant dans la requête"}, status=400))

    # Taille raisonnable (max 200 Mo pour une base SQLite)
    MAX_SIZE = 200 * 1024 * 1024
    if len(db_bytes) > MAX_SIZE:
        return _with_cors(request, web.json_response(
            {"ok": False, "error": "Fichier trop volumineux (max 200 Mo)"},
            status=413
        ))

    tmp_path = None
    try:
        # Écriture dans un fichier temporaire (sqlite3 ne peut pas lire depuis des bytes)
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
            tmp.write(db_bytes)
            tmp_path = tmp.name

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, parse_nexus_db, tmp_path)

        logger.info(
            "[api] nexus-parse-db : %d entrée(s) parsée(s) (%d F95, %d LC)",
            result["stats"]["total"],
            result["stats"]["with_f95"],
            result["stats"]["with_lc"],
        )
        return _with_cors(request, web.json_response({"ok": True, **result}))

    except ValueError as e:
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=422))
    except Exception as e:
        logger.exception("[api] nexus-parse-db erreur : %s", e)
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))
    finally:
        if tmp_path:
            try:
                import os
                os.unlink(tmp_path)
            except Exception:
                pass


async def collection_import_batch(request):
    """
    Import en masse de jeux depuis un export Nexus (ou tout autre source).
    POST /api/collection/import-batch

    Body JSON:
    {
        "owner_id": "<uuid>",          -- Requis : owner_id Supabase de l'utilisateur
        "entries": [                   -- Liste de jeux à importer
            {
                "f95_thread_id":        12345,      // Priorité 1
                "f95_url":              "https://...", // Optionnel
                "lewdcorner_thread_id": null,
                "lewdcorner_url":       null,
                "game_site":            "F95Zone",
                "title":                "Game Name",
                "executable_paths":     [{"path": "C:\\\\..."}],
                "labels":               [{"label": "Favori", "color": "#ff0"}],
                "notes":                "..."
            }
        ],
        "skip_existing":   true,   // Ne pas écraser les entrées déjà en collection
        "overwrite_labels": false, // Écraser les labels si le jeu est déjà en collection
        "overwrite_paths":  false  // Écraser les chemins exécutables si déjà en collection
    }

    Réponse streaming NDJSON :
        {"progress": {"current": 5, "total": 100}}
        {"log": "✅ Game Name importé"}
        {"log": "⏭️ Game Name déjà en collection (ignoré)"}
        {"log": "❌ ID 99999 — erreur: ..."}
        {"status": "completed", "imported": 80, "skipped": 15, "errors": 5}
    """
    is_valid, _, _, _ = await _auth_request(request, "/api/collection/import-batch")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    sb = _get_supabase()
    if not sb:
        return _with_cors(request, web.json_response({"ok": False, "error": "Supabase non configuré"}, status=500))

    try:
        body = await request.json() or {}
    except Exception:
        return _with_cors(request, web.json_response({"ok": False, "error": "Body JSON invalide"}, status=400))

    owner_id = (body.get("owner_id") or "").strip()
    if not owner_id:
        return _with_cors(request, web.json_response({"ok": False, "error": "owner_id requis"}, status=400))

    entries = body.get("entries")
    if not isinstance(entries, list) or not entries:
        return _with_cors(request, web.json_response({"ok": False, "error": "entries requis (liste non vide)"}, status=400))

    skip_existing    = bool(body.get("skip_existing", True))
    overwrite_labels = bool(body.get("overwrite_labels", False))
    overwrite_paths  = bool(body.get("overwrite_paths", False))
    overwrite_all    = bool(body.get("overwrite_all", False))
    # overwrite_all implique l'écrasement de tout, y compris labels et chemins
    if overwrite_all:
        overwrite_labels = True
        overwrite_paths  = True

    total = len(entries)

    # Streaming NDJSON
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
            await response.write((json.dumps(data, ensure_ascii=False) + "\n").encode("utf-8"))
            await response.drain()
            return True
        except Exception as e:
            err_lower = str(e).lower()
            if any(k in err_lower for k in ("closing transport", "connection reset", "broken pipe")):
                client_disconnected[0] = True
            return False

    try:
        await send({"log": f"📥 {total} entrée(s) à traiter…", "progress": {"current": 0, "total": total}})

        # Charger les f95_thread_id déjà en collection pour ce owner
        existing_ids: set[int] = set()
        try:
            res = sb.table("user_collection") \
                .select("f95_thread_id, id, labels, executable_paths") \
                .eq("owner_id", owner_id) \
                .execute()
            existing_map: dict[int, dict] = {}
            for row in (res.data or []):
                tid = row.get("f95_thread_id")
                if tid is not None:
                    existing_ids.add(int(tid))
                    existing_map[int(tid)] = row
        except Exception as e:
            logger.error("[api] import-batch : lecture collection existante : %s", e)
            existing_map = {}

        await send({"log": f"ℹ️ {len(existing_ids)} jeu(x) déjà en collection"})

        imported_count = 0
        skipped_count  = 0
        error_count    = 0
        now = datetime.datetime.now(ZoneInfo("UTC")).isoformat()

        for idx, entry in enumerate(entries, 1):
            if client_disconnected[0]:
                break

            if not await send({"progress": {"current": idx, "total": total}}):
                break

            f95_id  = entry.get("f95_thread_id")
            lc_id   = entry.get("lewdcorner_thread_id")
            f95_url = (entry.get("f95_url") or "").strip() or None
            title   = (entry.get("title") or "").strip() or None
            notes   = (entry.get("notes") or "").strip() or None
            labels  = entry.get("labels") or []
            raw_paths = entry.get("executable_paths") or []

            # Données de jeu exportées depuis Nexus → scraped_data
            game_version   = (entry.get("game_version") or "").strip() or None
            game_statut    = (entry.get("game_statut") or "").strip() or None
            game_engine    = (entry.get("game_engine") or "").strip() or None
            game_developer = (entry.get("game_developer") or "").strip() or None
            couverture_url = (entry.get("couverture_url") or "").strip() or None
            tags_list      = entry.get("tags") or []
            game_site      = (entry.get("game_site") or "").strip() or None

            # Construire scraped_data uniquement si des données sont disponibles
            has_scraped = any([game_version, game_statut, game_engine, couverture_url, tags_list])
            scraped_data = None
            if has_scraped:
                scraped_data = {
                    "name"     : title,
                    "version"  : game_version,
                    "status"   : game_statut,
                    "type"     : game_engine,
                    "developer": game_developer,
                    "image"    : couverture_url,
                    "tags"     : tags_list,
                    "source"   : game_site,
                }

            # Normalisation des chemins exécutables
            exe_paths = []
            for p in raw_paths:
                if isinstance(p, str) and p.strip():
                    exe_paths.append({"path": p.strip()})
                elif isinstance(p, dict) and p.get("path"):
                    exe_paths.append({"path": p["path"].strip()})

            # Validation : on a besoin d'au moins un identifiant
            if not f95_id and not lc_id and not f95_url:
                msg = f"⚠️  [{idx}/{total}] Entrée ignorée (aucun identifiant F95/Lewdcorner)"
                if not await send({"log": msg}):
                    break
                error_count += 1
                continue

            # f95_thread_id est NOT NULL en base — utiliser lewdcorner_thread_id comme fallback
            # (le champ stocke n'importe quel ID de thread numérique, pas seulement F95)
            effective_thread_id = int(f95_id) if f95_id else (int(lc_id) if lc_id else None)
            if effective_thread_id is None:
                msg = f"⚠️  [{idx}/{total}] Entrée ignorée (impossible de résoudre un thread_id)"
                if not await send({"log": msg}):
                    break
                error_count += 1
                continue

            # Construire f95_url si manquant
            if not f95_url:
                if f95_id:
                    f95_url = f"https://f95zone.to/threads/thread.{f95_id}/"
                elif entry.get("lewdcorner_url"):
                    f95_url = entry["lewdcorner_url"]

            display_name = title or (f"ID {f95_id}" if f95_id else f"Lewdcorner #{lc_id}")

            # Vérifier si déjà en collection
            if effective_thread_id in existing_ids:
                existing_row = existing_map.get(effective_thread_id, {})

                # Ignorer si aucune option d'écrasement active
                if skip_existing and not overwrite_labels and not overwrite_paths and not overwrite_all:
                    msg = f"⏭️  [{idx}/{total}] {display_name} — déjà en collection (ignoré)"
                    if not await send({"log": msg}):
                        break
                    skipped_count += 1
                    continue

                if overwrite_all:
                    # Écrasement complet : toutes les données Nexus
                    update_payload: dict = {
                        "title":            title,
                        "f95_url":          f95_url,
                        "notes":            notes or None,
                        "updated_at":       now,
                    }
                    if labels:
                        update_payload["labels"] = labels
                    if exe_paths:
                        update_payload["executable_paths"] = exe_paths
                    if scraped_data:
                        update_payload["scraped_data"] = scraped_data
                    try:
                        sb.table("user_collection") \
                            .update(update_payload) \
                            .eq("id", existing_row["id"]) \
                            .eq("owner_id", owner_id) \
                            .execute()
                        details = []
                        if scraped_data: details.append("données")
                        if labels:      details.append(f"{len(labels)} label(s)")
                        if exe_paths:   details.append(f"{len(exe_paths)} chemin(s)")
                        msg = f"🔄 [{idx}/{total}] {display_name} — réimporté ({', '.join(details) or 'titre/notes'})"
                        if not await send({"log": msg}):
                            break
                        imported_count += 1
                    except Exception as e:
                        logger.error("[api] import-batch overwrite_all %s: %s", display_name, e)
                        if not await send({"log": f"❌ [{idx}/{total}] {display_name} — erreur: {e}"}):
                            break
                        error_count += 1
                else:
                    # Mise à jour partielle (labels / chemins seulement)
                    update_payload = {"updated_at": now}
                    changes = []
                    if overwrite_labels and labels:
                        update_payload["labels"] = labels
                        changes.append("labels")
                    if overwrite_paths and exe_paths:
                        update_payload["executable_paths"] = exe_paths
                        changes.append("chemins")

                    if changes:
                        try:
                            sb.table("user_collection") \
                                .update(update_payload) \
                                .eq("id", existing_row["id"]) \
                                .eq("owner_id", owner_id) \
                                .execute()
                            msg = f"🔄 [{idx}/{total}] {display_name} — mis à jour ({', '.join(changes)})"
                            if not await send({"log": msg}):
                                break
                            imported_count += 1
                        except Exception as e:
                            logger.error("[api] import-batch update %s: %s", display_name, e)
                            if not await send({"log": f"❌ [{idx}/{total}] {display_name} — erreur: {e}"}):
                                break
                            error_count += 1
                    else:
                        if not await send({"log": f"⏭️  [{idx}/{total}] {display_name} — déjà en collection (ignoré)"}):
                            break
                        skipped_count += 1
                continue

            # Insertion (upsert) du jeu
            try:
                row: dict = {
                    "owner_id":         owner_id,
                    "f95_thread_id":    effective_thread_id,  # NOT NULL — toujours renseigné ici
                    "f95_url":          f95_url,
                    "title":            title,
                    "notes":            notes or None,
                    "updated_at":       now,
                }
                if labels:
                    row["labels"] = labels
                if exe_paths:
                    row["executable_paths"] = exe_paths
                if scraped_data:
                    row["scraped_data"] = scraped_data

                sb.table("user_collection").upsert(row, on_conflict="owner_id,f95_thread_id").execute()

                existing_ids.add(effective_thread_id)
                existing_map[effective_thread_id] = {"id": None}  # Marqueur pour éviter les doublons

                details = []
                if labels:       details.append(f"{len(labels)} label(s)")
                if exe_paths:    details.append(f"{len(exe_paths)} chemin(s)")
                if game_version: details.append(f"v{game_version}")
                detail_str = f" — {', '.join(details)}" if details else ""

                msg = f"✅ [{idx}/{total}] {display_name}{detail_str}"
                if not await send({"log": msg}):
                    break
                imported_count += 1

            except Exception as e:
                logger.error("[api] import-batch insert %s: %s", display_name, e)
                if not await send({"log": f"❌ [{idx}/{total}] {display_name} — erreur: {e}"}):
                    break
                error_count += 1

            # Pause légère entre insertions pour éviter la saturation
            if idx % 10 == 0 and not client_disconnected[0]:
                await asyncio.sleep(0.1)

        if not client_disconnected[0]:
            await send({
                "log": (
                    f"🎉 Import terminé : {imported_count} importé(s), "
                    f"{skipped_count} ignoré(s), {error_count} erreur(s)"
                ),
                "status":   "completed",
                "imported": imported_count,
                "skipped":  skipped_count,
                "errors":   error_count,
            })

    except Exception as e:
        logger.error("[api] import-batch erreur globale : %s", e, exc_info=True)
        await send({"error": str(e), "status": "error"})

    finally:
        await response.write_eof()

    return response


async def collection_f95_traducteurs(request):
    """
    Liste des traducteurs distincts de f95_jeux (pour le select).
    GET /api/collection/f95-traducteurs
    """
    is_valid, _, _, _ = await _auth_request(request, "/api/collection/f95-traducteurs")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    sb = _get_supabase()
    if not sb:
        return _with_cors(request, web.json_response({"ok": False, "error": "Supabase non configuré"}, status=500))

    try:
        res = sb.table("f95_jeux").select("traducteur").not_.is_("traducteur", "null").execute()
        raw = [r.get("traducteur", "").strip() for r in (res.data or []) if r.get("traducteur")]
        traducteurs = sorted({t for t in raw if t})
        return _with_cors(request, web.json_response({"ok": True, "traducteurs": traducteurs}))
    except Exception as e:
        logger.exception("[api] f95-traducteurs : %s", e)
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))


async def collection_f95_preview(request):
    """
    Prévisualise les jeux de f95_jeux correspondant aux filtres fournis.
    POST /api/collection/f95-preview
    Body JSON: { "owner_id": "<uuid>", "traducteur": "...", "type": "...", "statut": "...", "search": "...", "limit": 500 }
    Réponse: { "ok": true, "count": N, "already_in_collection": M, "new_count": K, "sample": [...] }
    """
    is_valid, _, _, _ = await _auth_request(request, "/api/collection/f95-preview")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    sb = _get_supabase()
    if not sb:
        return _with_cors(request, web.json_response({"ok": False, "error": "Supabase non configuré"}, status=500))

    try:
        body = await request.json() or {}
    except Exception:
        return _with_cors(request, web.json_response({"ok": False, "error": "Body JSON invalide"}, status=400))

    owner_id   = (body.get("owner_id")   or "").strip()
    traducteur = (body.get("traducteur") or "").strip()
    type_jeu   = (body.get("type")       or "").strip()
    statut     = (body.get("statut")     or "").strip()
    search     = (body.get("search")     or "").strip()
    try:
        limit = min(int(body.get("limit") or 500), 2000)
    except (TypeError, ValueError):
        limit = 500

    if not owner_id:
        return _with_cors(request, web.json_response({"ok": False, "error": "owner_id requis"}, status=400))
    if not traducteur and not type_jeu and not statut and not search:
        return _with_cors(request, web.json_response(
            {"ok": False, "error": "Au moins un filtre requis (traducteur, type, statut, search)"},
            status=400,
        ))

    full_list = bool(body.get("full_list", False))

    try:
        query = sb.table("f95_jeux").select(
            "site_id, nom_du_jeu, traducteur, version, trad_ver, statut, type, nom_url"
        ).not_.is_("site_id", "null")

        if traducteur:
            query = query.eq("traducteur", traducteur)
        if type_jeu:
            query = query.ilike("type", f"%{type_jeu}%")
        if statut:
            query = query.ilike("statut", f"%{statut}%")
        if search:
            query = query.ilike("nom_du_jeu", f"%{search}%")

        res = query.limit(limit).execute()
        all_jeux = res.data or []

        # Dédupliquer par site_id (plusieurs lignes peuvent partager le même site_id)
        seen: set = set()
        unique_jeux = []
        for j in all_jeux:
            sid = j.get("site_id")
            if sid and sid not in seen:
                seen.add(sid)
                unique_jeux.append(j)

        # Jeux déjà en collection
        existing_site_ids: set = set()
        if unique_jeux:
            site_ids = [j["site_id"] for j in unique_jeux]
            coll_res = sb.table("user_collection") \
                .select("f95_thread_id") \
                .eq("owner_id", owner_id) \
                .in_("f95_thread_id", site_ids) \
                .execute()
            existing_site_ids = {r["f95_thread_id"] for r in (coll_res.data or [])}

        new_count     = sum(1 for j in unique_jeux if j.get("site_id") not in existing_site_ids)
        already_count = len(unique_jeux) - new_count

        result = {
            "ok":                   True,
            "count":                len(unique_jeux),
            "already_in_collection": already_count,
            "new_count":            new_count,
        }
        if full_list:
            result["items"] = unique_jeux
        else:
            sample_new = [j for j in unique_jeux if j.get("site_id") not in existing_site_ids][:8]
            sample_old = [j for j in unique_jeux if j.get("site_id") in existing_site_ids][:2]
            result["sample"] = (sample_new + sample_old)[:10]

        return _with_cors(request, web.json_response(result))

    except Exception as e:
        logger.exception("[api] /api/collection/f95-preview erreur: %s", e)
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))


async def collection_f95_import(request):
    """
    Importe en masse des jeux filtrés depuis f95_jeux vers user_collection (streaming NDJSON).
    POST /api/collection/f95-import
    Body JSON: { "owner_id": "...", "traducteur": "...", "type": "...", "statut": "...",
                 "search": "...", "limit": 500, "skip_existing": true, "overwrite_all": false }
    """
    is_valid, _, _, _ = await _auth_request(request, "/api/collection/f95-import")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    sb = _get_supabase()
    if not sb:
        return _with_cors(request, web.json_response({"ok": False, "error": "Supabase non configuré"}, status=500))

    try:
        body = await request.json() or {}
    except Exception:
        return _with_cors(request, web.json_response({"ok": False, "error": "Body JSON invalide"}, status=400))

    owner_id         = (body.get("owner_id")   or "").strip()
    traducteur       = (body.get("traducteur") or "").strip()
    type_jeu         = (body.get("type")       or "").strip()
    statut           = (body.get("statut")     or "").strip()
    search           = (body.get("search")     or "").strip()
    skip_existing    = bool(body.get("skip_existing", True))
    overwrite_all    = bool(body.get("overwrite_all", False))
    selected_site_ids = body.get("selected_site_ids")
    if selected_site_ids is not None and not isinstance(selected_site_ids, list):
        selected_site_ids = None
    try:
        limit = min(int(body.get("limit") or 500), 2000)
    except (TypeError, ValueError):
        limit = 500

    if not owner_id:
        return _with_cors(request, web.json_response({"ok": False, "error": "owner_id requis"}, status=400))
    if not selected_site_ids and not traducteur and not type_jeu and not statut and not search:
        return _with_cors(request, web.json_response({"ok": False, "error": "Au moins un filtre ou selected_site_ids requis"}, status=400))

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
            await response.write((json.dumps(data, ensure_ascii=False) + "\n").encode("utf-8"))
            await response.drain()
            return True
        except Exception as e:
            if any(k in str(e).lower() for k in ("closing transport", "connection reset", "broken pipe")):
                client_disconnected[0] = True
            return False

    try:
        await send({"log": "🔍 Récupération des jeux depuis f95_jeux..."})

        if selected_site_ids:
            # Import ciblé par IDs sélectionnés
            ids_clean = [int(x) for x in selected_site_ids if x is not None and str(x).isdigit()][:2000]
            if not ids_clean:
                await send({"log": "ℹ️ Aucun ID valide.", "status": "completed", "imported": 0, "skipped": 0, "errors": 0})
                await response.write_eof()
                return response
            res = sb.table("f95_jeux").select(
                "site_id, nom_du_jeu, traducteur, traducteur_url, version, trad_ver, statut, "
                "type, type_de_traduction, lien_trad, nom_url, image, tags, synopsis_fr, synopsis_en"
            ).in_("site_id", ids_clean).execute()
        else:
            query = sb.table("f95_jeux").select(
                "site_id, nom_du_jeu, traducteur, traducteur_url, version, trad_ver, statut, "
                "type, type_de_traduction, lien_trad, nom_url, image, tags, synopsis_fr, synopsis_en"
            ).not_.is_("site_id", "null")
            if traducteur:
                query = query.eq("traducteur", traducteur)
            if type_jeu:
                query = query.ilike("type", f"%{type_jeu}%")
            if statut:
                query = query.ilike("statut", f"%{statut}%")
            if search:
                query = query.ilike("nom_du_jeu", f"%{search}%")
            res = query.limit(limit).execute()

        all_jeux = res.data or []

        # Dédupliquer par site_id
        seen: set = set()
        jeux = []
        for j in all_jeux:
            sid = j.get("site_id")
            if sid and sid not in seen:
                seen.add(sid)
                jeux.append(j)

        total = len(jeux)
        if total == 0:
            await send({"log": "ℹ️ Aucun jeu correspondant aux filtres.", "status": "completed",
                        "imported": 0, "skipped": 0, "errors": 0})
            await response.write_eof()
            return response

        await send({"log": f"📊 {total} jeu(x) trouvé(s)", "progress": {"current": 0, "total": total}})

        # Entrées déjà en collection
        coll_res = sb.table("user_collection").select("f95_thread_id, id").eq("owner_id", owner_id).execute()
        existing_map: dict = {}
        for row in (coll_res.data or []):
            tid = row.get("f95_thread_id")
            if tid is not None:
                existing_map[int(tid)] = row
        await send({"log": f"ℹ️ {len(existing_map)} jeu(x) déjà en collection"})

        imported_count = 0
        skipped_count  = 0
        error_count    = 0
        now = datetime.datetime.now(ZoneInfo("UTC")).isoformat()

        for idx, jeu in enumerate(jeux, 1):
            if client_disconnected[0]:
                break
            if not await send({"progress": {"current": idx, "total": total}}):
                break

            site_id      = jeu.get("site_id")
            title        = (jeu.get("nom_du_jeu") or "").strip() or None
            f95_url      = (jeu.get("nom_url")    or "").strip() or None
            display_name = title or f"site_id={site_id}"

            scraped_data = {
                "name":               title,
                "version":            jeu.get("version"),
                "trad_ver":           jeu.get("trad_ver"),
                "status":             jeu.get("statut"),
                "type":               jeu.get("type"),
                "type_de_traduction": jeu.get("type_de_traduction"),
                "traducteur":         jeu.get("traducteur"),
                "traducteur_url":     jeu.get("traducteur_url"),
                "lien_trad":          jeu.get("lien_trad"),
                "image":              jeu.get("image"),
                "tags":               jeu.get("tags"),
                "synopsis":           jeu.get("synopsis_en"),
                "synopsis_fr":        jeu.get("synopsis_fr"),
                "source":             "f95_jeux",
            }

            if site_id in existing_map:
                if skip_existing and not overwrite_all:
                    if not await send({"log": f"⏭️ [{idx}/{total}] {display_name} — déjà en collection (ignoré)"}):
                        break
                    skipped_count += 1
                    continue
                if overwrite_all:
                    try:
                        sb.table("user_collection").update({
                            "title":        title,
                            "f95_url":      f95_url,
                            "scraped_data": scraped_data,
                            "updated_at":   now,
                        }).eq("id", existing_map[site_id]["id"]).eq("owner_id", owner_id).execute()
                        if not await send({"log": f"🔄 [{idx}/{total}] {display_name} — données mises à jour"}):
                            break
                        imported_count += 1
                    except Exception as e:
                        logger.error("[api] f95-import overwrite %s: %s", display_name, e)
                        if not await send({"log": f"❌ [{idx}/{total}] {display_name} — erreur: {e}"}):
                            break
                        error_count += 1
                continue

            try:
                sb.table("user_collection").upsert({
                    "owner_id":      owner_id,
                    "f95_thread_id": int(site_id),
                    "f95_url":       f95_url,
                    "title":         title,
                    "scraped_data":  scraped_data,
                    "updated_at":    now,
                }, on_conflict="owner_id,f95_thread_id").execute()
                existing_map[site_id] = {"id": None}
                if not await send({"log": f"✅ [{idx}/{total}] {display_name}"}):
                    break
                imported_count += 1
            except Exception as e:
                logger.error("[api] f95-import insert %s: %s", display_name, e)
                if not await send({"log": f"❌ [{idx}/{total}] {display_name} — erreur: {e}"}):
                    break
                error_count += 1

            if idx % 20 == 0 and not client_disconnected[0]:
                await asyncio.sleep(0.05)

        if not client_disconnected[0]:
            await send({
                "log": f"🎉 Import terminé : {imported_count} importé(s), {skipped_count} ignoré(s), {error_count} erreur(s)",
                "status":   "completed",
                "imported": imported_count,
                "skipped":  skipped_count,
                "errors":   error_count,
            })

    except Exception as e:
        logger.error("[api] f95-import erreur globale : %s", e, exc_info=True)
        await send({"error": str(e), "status": "error"})
    finally:
        await response.write_eof()

    return response


async def collection_enrich_entries(request):
    """
    Met à jour les scraped_data des entrées user_collection depuis f95_jeux (streaming NDJSON).
    Si scrape_missing=True, scrape directement F95Zone pour les entrées sans correspondance f95_jeux.
    POST /api/collection/enrich-entries
    Body JSON:
    {
        "owner_id":      "<uuid>",
        "fields":        [...],          // optionnel, défaut = tous les champs
        "scrape_missing": false,         // si true : scrape F95 pour les entrées sans données (rate-limited)
        "f95_cookies":   "...",          // optionnel : cookie xf_session pour les jeux 18+
        "scrape_delay":  2.0             // délai entre les scrapes (défaut 2s)
    }
    """
    is_valid, _, _, _ = await _auth_request(request, "/api/collection/enrich-entries")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    sb = _get_supabase()
    if not sb:
        return _with_cors(request, web.json_response({"ok": False, "error": "Supabase non configuré"}, status=500))

    try:
        body = await request.json() or {}
    except Exception:
        return _with_cors(request, web.json_response({"ok": False, "error": "Body JSON invalide"}, status=400))

    owner_id       = (body.get("owner_id") or "").strip()
    scrape_missing = bool(body.get("scrape_missing", False))
    f95_cookies    = (body.get("f95_cookies") or "").strip() or None
    try:
        scrape_delay = max(1.0, float(body.get("scrape_delay") or 2.0))
    except (TypeError, ValueError):
        scrape_delay = 2.0

    if not owner_id:
        return _with_cors(request, web.json_response({"ok": False, "error": "owner_id requis"}, status=400))

    # Champs à synchroniser (f95_jeux → scraped_data)
    F95_TO_SCRAPED = {
        "version":            "version",
        "trad_ver":           "trad_ver",
        "statut":             "status",
        "type":               "type",
        "type_de_traduction": "type_de_traduction",
        "lien_trad":          "lien_trad",
        "traducteur":         "traducteur",
        "traducteur_url":     "traducteur_url",
        "image":              "image",
        "tags":               "tags",
        "synopsis_en":        "synopsis",
        "synopsis_fr":        "synopsis_fr",
    }
    fields_to_sync = body.get("fields") or list(F95_TO_SCRAPED.keys())

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
            await response.write((json.dumps(data, ensure_ascii=False) + "\n").encode("utf-8"))
            await response.drain()
            return True
        except Exception as e:
            if any(k in str(e).lower() for k in ("closing transport", "connection reset", "broken pipe")):
                client_disconnected[0] = True
            return False

    try:
        await send({"log": "📋 Chargement des entrées de la collection..."})

        coll_res = sb.table("user_collection") \
            .select("id, f95_thread_id, title, f95_url, scraped_data") \
            .eq("owner_id", owner_id) \
            .execute()
        entries = [r for r in (coll_res.data or []) if r.get("f95_thread_id")]

        if not entries:
            await send({"log": "ℹ️ Aucune entrée à enrichir.", "status": "completed", "updated": 0, "skipped": 0, "scraped": 0})
            await response.write_eof()
            return response

        total = len(entries)
        await send({"log": f"📊 {total} entrée(s) — récupération des données f95_jeux…",
                    "progress": {"current": 0, "total": total}})

        # Charger les données f95_jeux par batches
        thread_ids = [e["f95_thread_id"] for e in entries]
        f95_map: dict = {}
        BATCH = 500
        for i in range(0, len(thread_ids), BATCH):
            batch = thread_ids[i:i + BATCH]
            f95_res = sb.table("f95_jeux").select(
                "site_id, nom_du_jeu, version, trad_ver, statut, type, type_de_traduction, "
                "lien_trad, traducteur, traducteur_url, nom_url, image, tags, synopsis_fr, synopsis_en"
            ).in_("site_id", batch).execute()
            for row in (f95_res.data or []):
                sid = row.get("site_id")
                if sid:
                    f95_map[sid] = row

        matched = len(f95_map)
        missing = total - matched
        log_msg = f"✅ {matched} correspondance(s) f95_jeux"
        if scrape_missing and missing > 0:
            log_msg += f" — {missing} à scraper depuis F95Zone ({scrape_delay:.0f}s entre chaque)"
        await send({"log": log_msg})

        updated_count = 0
        skipped_count = 0
        scraped_count = 0
        now = datetime.datetime.now(ZoneInfo("UTC")).isoformat()

        # Séparation : entrées avec/sans correspondance f95_jeux
        entries_with_f95    = [e for e in entries if f95_map.get(e["f95_thread_id"])]
        entries_without_f95 = [e for e in entries if not f95_map.get(e["f95_thread_id"])]

        # ─── Phase 1 : enrichissement depuis f95_jeux ───────────────────────────
        # Une session aiohttp pour les traductions à la volée (Bug 2 fix)
        async with aiohttp.ClientSession() as session_translate:
            for idx, entry in enumerate(entries_with_f95, 1):
                if client_disconnected[0]:
                    break
                if not await send({"progress": {"current": idx, "total": total}}):
                    break

                tid   = entry["f95_thread_id"]
                f95   = f95_map.get(tid)
                title = entry.get("title") or f"ID {tid}"

                existing_scraped = entry.get("scraped_data") or {}
                if isinstance(existing_scraped, str):
                    try:
                        existing_scraped = json.loads(existing_scraped)
                    except Exception:
                        existing_scraped = {}

                new_scraped    = dict(existing_scraped)
                changed_fields = []

                for f95_field, scraped_field in F95_TO_SCRAPED.items():
                    if f95_field not in fields_to_sync:
                        continue
                    f95_val = f95.get(f95_field)
                    if f95_val is not None and new_scraped.get(scraped_field) != f95_val:
                        new_scraped[scraped_field] = f95_val
                        changed_fields.append(scraped_field)

                # ── Bug 2 FIX : synopsis EN présent mais pas de FR → traduire ──
                # Note : on ne persiste PAS le résultat dans f95_jeux depuis ici.
                # f95_jeux est alimenté exclusivement par scrape_enrich (source de vérité).
                # Écrire depuis user_collection vers f95_jeux créerait un risque de
                # propagation de données corrompues vers la table partagée.
                synopsis_en_available = new_scraped.get("synopsis") or new_scraped.get("synopsis_en")
                needs_translation = (
                    synopsis_en_available
                    and not new_scraped.get("synopsis_fr")
                    and not f95.get("synopsis_fr")
                )
                if needs_translation:
                    if not await send({"log": f"🌐 [{idx}/{total}] {title} — Traduction EN→FR du synopsis…"}):
                        break
                    try:
                        synopsis_fr = await translate_text(session_translate, synopsis_en_available, "en", "fr")
                        if synopsis_fr:
                            new_scraped["synopsis_fr"] = synopsis_fr
                            changed_fields.append("synopsis_fr")
                            # ← MODIFIÉ : write-back vers f95_jeux supprimé intentionnellement
                    except Exception as te:
                        logger.warning("[api] enrich-entries phase1 translation %s: %s", title, te)

                new_title   = f95.get("nom_du_jeu") or entry.get("title")
                new_f95_url = f95.get("nom_url") or entry.get("f95_url")
                title_changed = bool(new_title and new_title != entry.get("title"))

                if not changed_fields and not title_changed:
                    if not await send({"log": f"⏭️ [{idx}/{total}] {title} — déjà à jour"}):
                        break
                    skipped_count += 1
                    continue

                try:
                    update_payload: dict = {"scraped_data": new_scraped, "updated_at": now}
                    if new_title:
                        update_payload["title"] = new_title
                    if new_f95_url:
                        update_payload["f95_url"] = new_f95_url
                    sb.table("user_collection").update(update_payload) \
                        .eq("id", entry["id"]).eq("owner_id", owner_id).execute()
                    fields_str = ", ".join(changed_fields[:4]) + ("…" if len(changed_fields) > 4 else "")
                    if not await send({"log": f"✅ [{idx}/{total}] {new_title or title} — {fields_str or 'titre'}"}):
                        break
                    updated_count += 1
                except Exception as e:
                    logger.error("[api] enrich-entries update %s: %s", title, e)
                    if not await send({"log": f"❌ [{idx}/{total}] {title} — erreur: {e}"}):
                        break

        # ─── Phase 2 : scraping F95Zone pour les entrées sans f95_jeux ──────────
        if scrape_missing and entries_without_f95 and not client_disconnected[0]:
            base_idx = len(entries_with_f95)
            total_scrape = len(entries_without_f95)
            await send({"log": f"🕷️ Démarrage du scraping F95Zone pour {total_scrape} entrée(s) sans données…"})

            async with aiohttp.ClientSession() as session:
                for s_idx, entry in enumerate(entries_without_f95, 1):
                    if client_disconnected[0]:
                        break

                    global_idx = base_idx + s_idx
                    if not await send({"progress": {"current": global_idx, "total": total}}):
                        break

                    tid   = entry["f95_thread_id"]
                    title = entry.get("title") or f"ID {tid}"

                    # Construire l'URL F95 si absente
                    f95_url = (entry.get("f95_url") or "").strip()
                    if not f95_url:
                        f95_url = f"https://f95zone.to/threads/thread.{tid}/"

                    # Ignorer les URLs non-F95 (LewdCorner, manuels sans URL valide)
                    if "f95zone.to" not in f95_url.lower():
                        if not await send({"log": f"⏭️ [{global_idx}/{total}] {title} — URL non-F95 (ignoré)"}):
                            break
                        skipped_count += 1
                        continue

                    if not await send({"log": f"🕷️ [{global_idx}/{total}] {title} — scraping F95…"}):
                        break

                    try:
                        game_data = await scrape_f95_game_data(
                            session, f95_url, cookies=f95_cookies or None
                        )
                    except Exception as e:
                        logger.warning("[api] enrich-entries scrape %s: %s", title, e)
                        if not await send({"log": f"❌ [{global_idx}/{total}] {title} — scrape échoué: {e}"}):
                            break
                        if s_idx < total_scrape:
                            await asyncio.sleep(scrape_delay)
                        continue

                    if not game_data:
                        if not await send({"log": f"⏭️ [{global_idx}/{total}] {title} — aucune donnée scrappée"}):
                            break
                        skipped_count += 1
                        if s_idx < total_scrape:
                            await asyncio.sleep(scrape_delay)
                        continue

                    existing_scraped = entry.get("scraped_data") or {}
                    if isinstance(existing_scraped, str):
                        try:
                            existing_scraped = json.loads(existing_scraped)
                        except Exception:
                            existing_scraped = {}

                    # ── Bug 4 FIX : préserver synopsis_fr déjà traduit ──────────
                    # Ne jamais écraser une traduction existante avec None
                    existing_synopsis_fr = existing_scraped.get("synopsis_fr")
                    synopsis_en = game_data.get("synopsis")
                    synopsis_fr = existing_synopsis_fr  # conserver par défaut

                    if synopsis_en and not synopsis_fr:
                        try:
                            synopsis_fr = await translate_text(session, synopsis_en, "en", "fr")
                        except Exception as e:
                            logger.warning("[api] enrich-entries translation failed: %s", e)

                    new_scraped = {
                        **existing_scraped,
                        "name":        game_data.get("name") or game_data.get("title"),
                        "version":     game_data.get("version"),
                        "status":      game_data.get("status"),
                        "type":        game_data.get("type"),
                        "image":       game_data.get("image"),
                        "tags":        game_data.get("tags"),
                        "synopsis":    synopsis_en,
                        "synopsis_fr": synopsis_fr,
                        "source":      "f95zone_scraped",
                    }
                    # Nettoyer les None sans jamais effacer synopsis_fr si déjà traduit
                    new_scraped = {k: v for k, v in new_scraped.items() if v is not None}

                    new_title      = game_data.get("name") or game_data.get("title") or entry.get("title")
                    scraped_f95_id = game_data.get("id")

                    try:
                        update_payload = {
                            "scraped_data": new_scraped,
                            "updated_at":   now,
                        }
                        if new_title:
                            update_payload["title"] = new_title
                        if scraped_f95_id:
                            update_payload["f95_url"] = f95_url
                        sb.table("user_collection").update(update_payload) \
                            .eq("id", entry["id"]).eq("owner_id", owner_id).execute()
                        v = new_scraped.get("version", "")
                        ver_str = f" (v{v})" if v else ""
                        if not await send({"log": f"✅ [{global_idx}/{total}] {new_title or title}{ver_str} — scrappé et mis à jour"}):
                            break
                        updated_count += 1
                        scraped_count += 1
                    except Exception as e:
                        logger.error("[api] enrich-entries scrape save %s: %s", title, e)
                        if not await send({"log": f"❌ [{global_idx}/{total}] {title} — erreur sauvegarde: {e}"}):
                            break

                    # Rate limiting entre les scrapes
                    if s_idx < total_scrape and not client_disconnected[0]:
                        await asyncio.sleep(scrape_delay)

        if not client_disconnected[0]:
            parts = [f"{updated_count} mis à jour"]
            if scraped_count:
                parts.append(f"dont {scraped_count} scrappé(s) depuis F95")
            parts.append(f"{skipped_count} ignoré(s)")
            await send({
                "log":     f"🎉 Enrichissement terminé : {', '.join(parts)}",
                "status":  "completed",
                "updated": updated_count,
                "skipped": skipped_count,
                "scraped": scraped_count,
            })

    except Exception as e:
        logger.error("[api] enrich-entries erreur globale : %s", e, exc_info=True)
        await send({"error": str(e), "status": "error"})
    finally:
        await response.write_eof()

    return response


async def get_logs(request):
    """Retourne le fichier de logs complet (protégé par clé API)."""
    # ✅ Utilise le nouveau système d'auth
    is_valid, _, _, _ = await _auth_request(request, "/api/logs")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    content = ""
    unique_user_ids = set()
    line_count = 0

    if LOG_FILE.exists():
        try:
            # Utilisation de errors="replace" pour éviter les crashs sur des caractères spéciaux
            with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
                all_lines = f.readlines()
                line_count = len(all_lines)
                # On limite éventuellement aux 500 dernières lignes pour éviter de saturer le navigateur
                content = "".join(all_lines[-500:]) 

                for line in all_lines:
                    if "[REQUEST]" in line:
                        parts = line.split(" | ")
                        if len(parts) >= 2:
                            user_id = parts[1].strip()
                            if user_id != "NULL" and len(user_id) >= 32 and "-" in user_id:
                                unique_user_ids.add(user_id)
        except Exception as e:
            logger.warning(f"[get_logs] ❌ Erreur lecture logs: {e}")
            content = f"[Erreur lecture: {e}]"
    else:
        logger.warning(f"[get_logs] ⚠️ Fichier log introuvable: {LOG_FILE}")

    return _with_cors(request, web.json_response({
        "ok": True,
        "logs": content,
        "unique_user_ids": list(unique_user_ids)
    }))

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
    is_valid, _, _, _ = await _auth_request(request, "/api/configure")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    try:
        data = await request.json()
        config.update_from_frontend(data)
        return _with_cors(request, web.json_response({
            "ok": True, "message": "Configuration mise a jour", "configured": config.configured,
        }))
    except Exception as e:
        logger.error("[api] Erreur configuration : %s", e)
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=400))


async def forum_post(request):
    is_valid, discord_user_id, discord_name, is_legacy = await _auth_request(request, "/api/forum-post")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    if not config.FORUM_MY_ID:
        return _with_cors(request, web.json_response({"ok": False, "error": "PUBLISHER_FORUM_TRAD_ID non configure"}, status=500))

    title = content = tags = metadata_b64 = ""
    translator_label = state_label = game_version = ""
    received_forum_id = translate_version = announce_image_url = ""
    history_payload_raw = None
    skip_version_control = False

    reader = await request.multipart()
    async for part in reader:
        n = part.name
        if   n == "title":                 title               = (await part.text()).strip()
        elif n == "content":               content             = (await part.text()).strip()
        elif n == "tags":                  tags                = (await part.text()).strip()
        elif n == "metadata":              metadata_b64        = (await part.text()).strip()
        elif n == "translator_label":      translator_label    = (await part.text()).strip()
        elif n == "state_label":           state_label         = (await part.text()).strip()
        elif n == "game_version":          game_version        = (await part.text()).strip()
        elif n == "translate_version":     translate_version   = (await part.text()).strip()
        elif n == "announce_image_url":    announce_image_url  = (await part.text()).strip()
        elif n == "forum_channel_id":      received_forum_id   = (await part.text()).strip()
        elif n == "history_payload":       history_payload_raw = (await part.text()).strip()
        elif n == "skip_version_control":  skip_version_control = (await part.text()).strip().lower() in ("true", "1", "yes")

    forum_id = int(received_forum_id) if received_forum_id else config.FORUM_MY_ID

    async with aiohttp.ClientSession() as session:
        ok, result = await _create_forum_post(session, forum_id, title, content, tags, [], metadata_b64)
        if ok and config.PUBLISHER_ANNOUNCE_CHANNEL_ID:
            await _send_announcement(
                session, is_update=False, title=title,
                thread_url=result.get("thread_url", ""),
                translator_label=translator_label, state_label=state_label,
                game_version=game_version, translate_version=translate_version,
                image_url=announce_image_url or None, forum_id=forum_id,
            )

    if not ok:
        return _with_cors(request, web.json_response({"ok": False, "details": result}, status=500))

    _save_post_to_supabase(result, title, content, tags, forum_id, history_payload_raw)

    logger.info("[api] POST /api/forum-post OK : thread_id=%s titre='%s' forum_id=%s",
                result.get("thread_id"), title, forum_id)

    resp_data = {"ok": True, **result}
    if is_legacy:
        resp_data["legacy_key_warning"] = LEGACY_KEY_WARNING
    return _with_cors(request, web.json_response(resp_data))


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
    """Met a jour un post existant — avec re-routage automatique si mauvais salon."""
    is_valid, _, _, is_legacy = await _auth_request(request, "/api/forum-post/update")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    if not config.FORUM_MY_ID:
        return _with_cors(request, web.json_response({"ok": False, "error": "PUBLISHER_FORUM_TRAD_ID non configure"}, status=500))

    title = content = tags = thread_id = message_id = metadata_b64 = ""
    translator_label = state_label = game_version = received_forum_id = ""
    translate_version = announce_image_url = thread_url = ""
    history_payload_raw = None
    silent_update = False
    skip_version_control = False

    reader = await request.multipart()
    async for part in reader:
        n = part.name
        if   n == "silent_update":       silent_update       = (await part.text()).strip().lower() in ("true", "1", "yes")
        elif n == "skip_version_control": skip_version_control = (await part.text()).strip().lower() in ("true", "1", "yes")
        elif n == "title":               title               = (await part.text()).strip()
        elif n == "content":             content             = (await part.text()).strip()
        elif n == "tags":                tags                = (await part.text()).strip()
        elif n == "threadId":            thread_id           = (await part.text()).strip()
        elif n == "messageId":           message_id          = (await part.text()).strip()
        elif n == "metadata":            metadata_b64        = (await part.text()).strip()
        elif n == "translator_label":    translator_label    = (await part.text()).strip()
        elif n == "state_label":         state_label         = (await part.text()).strip()
        elif n == "game_version":        game_version        = (await part.text()).strip()
        elif n == "translate_version":   translate_version   = (await part.text()).strip()
        elif n == "announce_image_url":  announce_image_url  = (await part.text()).strip()
        elif n == "forum_channel_id":    received_forum_id   = (await part.text()).strip()
        elif n == "thread_url":          thread_url          = (await part.text()).strip()
        elif n == "history_payload":     history_payload_raw = (await part.text()).strip()

    if not thread_id or not message_id:
        return _with_cors(request, web.json_response(
            {"ok": False, "error": "threadId and messageId required"}, status=400
        ))

    target_forum_id = int(received_forum_id) if received_forum_id else config.FORUM_MY_ID
    reroute_info    = None

    async with aiohttp.ClientSession() as session:

        # Detection re-routage
        current_parent_id = await _get_thread_parent_id(session, thread_id)
        needs_reroute = (
            current_parent_id
            and received_forum_id
            and current_parent_id != received_forum_id
        )

        if needs_reroute:
            logger.info("[api] Re-routage : thread %s est dans %s, doit etre dans %s",
                        thread_id, current_parent_id, received_forum_id)
            reroute_info = await _reroute_post(
                session,
                old_thread_id=thread_id, old_message_id=message_id,
                target_forum_id=received_forum_id,
                title=title, content=content, tags_raw=tags, metadata_b64=metadata_b64,
            )
            if reroute_info:
                old_thread_id = thread_id
                thread_id  = reroute_info["thread_id"]
                message_id = reroute_info["message_id"]
                thread_url = reroute_info["thread_url"]
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, _delete_from_supabase_sync, old_thread_id, None)
            else:
                logger.error("[api] Re-routage echoue, mise a jour classique en fallback")
                needs_reroute = False

        # Mise a jour classique
        if not needs_reroute:
            import re
            image_exts = r"(?:jpg|jpeg|png|gif|webp|avif|bmp|svg|ico|tiff|tif)"
            image_url_pattern = re.compile(
                rf"https?://[^\s<>\"']+\.{image_exts}(?:\?[^\s<>\"']*)?", re.IGNORECASE
            )
            image_urls_full = [m.group(0) for m in image_url_pattern.finditer(content or "")]
            final_content   = content or " "
            use_attachment  = False
            file_bytes, filename, content_type = None, "image.png", "image/png"

            if image_urls_full:
                fetched = await _fetch_image_from_url(session, image_urls_full[0])
                if fetched:
                    file_bytes, filename, content_type = fetched
                    final_content  = _strip_image_url_from_content(content or " ", image_urls_full[0])
                    use_attachment = True
                else:
                    final_content = _strip_image_url_from_content(content or " ", image_urls_full[0])

            message_path = f"/channels/{thread_id}/messages/{message_id}"
            if use_attachment and file_bytes:
                status, data = await _discord_patch_message_with_attachment(
                    session, str(thread_id), str(message_id),
                    final_content or " ", file_bytes, filename, content_type,
                )
            else:
                status, data = await _discord_patch_json(
                    session, message_path, {"content": final_content or " ", "embeds": []}
                )

            if status >= 300:
                return _with_cors(request, web.json_response({"ok": False, "details": data}, status=500))

            # Mise a jour metadata
            if metadata_b64 and len(metadata_b64) <= 25000:
                try:
                    messages = await _discord_list_messages(session, str(thread_id), limit=50)
                    metadata_msg_id = None
                    for m in messages:
                        for e in (m.get("embeds") or []):
                            ft = (e.get("footer") or {}).get("text") or ""
                            if ft.startswith("metadata:v1:") or ft.startswith("metadata:"):
                                metadata_msg_id = m.get("id")
                                break
                        if metadata_msg_id:
                            break

                    meta_payload = {"content": " ", "embeds": [_build_metadata_embed(metadata_b64)]}
                    if metadata_msg_id:
                        s3, _ = await _discord_patch_json(
                            session, f"/channels/{thread_id}/messages/{metadata_msg_id}", meta_payload
                        )
                        if s3 < 300:
                            await _discord_suppress_embeds(session, str(thread_id), str(metadata_msg_id))
                            await _delete_old_metadata_messages(session, str(thread_id), keep_message_id=str(metadata_msg_id))
                    else:
                        await _delete_old_metadata_messages(session, str(thread_id))
                        s2, d2, _ = await _discord_post_json(session, f"/channels/{thread_id}/messages", meta_payload)
                        if s2 < 300 and isinstance(d2, dict) and d2.get("id"):
                            await _discord_suppress_embeds(session, str(thread_id), str(d2["id"]))
                except Exception as e:
                    logger.warning("[api] Exception update metadata message : %s", e)

            # Mise a jour titre + tags
            applied_tag_ids = await _resolve_applied_tag_ids(session, target_forum_id, tags)
            status, data    = await _discord_patch_json(
                session, f"/channels/{thread_id}",
                {"name": title, "applied_tags": applied_tag_ids},
            )
            if status >= 300:
                return _with_cors(request, web.json_response({"ok": False, "details": data}, status=500))

        # Annonce
        if config.PUBLISHER_ANNOUNCE_CHANNEL_ID and thread_url and not silent_update:
            await _send_announcement(
                session, is_update=True, title=title, thread_url=thread_url,
                translator_label=translator_label, state_label=state_label,
                game_version=game_version, translate_version=translate_version,
                image_url=announce_image_url or None, forum_id=target_forum_id,
            )
        elif silent_update:
            logger.info("[api] Mise a jour silencieuse (sans annonce) : %s", title)

        # Sauvegarde Supabase
        loop = asyncio.get_event_loop()
        existing_row = await loop.run_in_executor(None, _fetch_post_by_thread_id_sync, thread_id)
        now = datetime.datetime.now(ZoneInfo("UTC")).isoformat()

        try:
            payload = json.loads(history_payload_raw) if history_payload_raw else {}
        except Exception:
            payload = {}

        final_payload = dict(existing_row) if existing_row else {}
        final_payload.update(payload)
        final_payload.update({
            "thread_id":   thread_id,
            "message_id":  message_id,
            "discord_url": (thread_url or "").strip() or final_payload.get("discord_url", ""),
            "title":       title,
            "content":     content,
            "tags":        tags,
            "updated_at":  now,
        })
        final_payload.setdefault("created_at", now)
        final_payload = _normalize_history_row(final_payload)

        sb = _get_supabase()
        if sb:
            try:
                supabase_payload = {k: v for k, v in final_payload.items() if k not in ("timestamp", "template")}
                sb.table("published_posts").upsert(supabase_payload, on_conflict="id").execute()
                logger.info("[api] Post %smis a jour dans Supabase : %s",
                            "re-route et " if reroute_info else "", title)
            except Exception as e:
                logger.warning("[api] Echec sauvegarde Supabase : %s", e)

    logger.info("[api] POST /api/forum-post/update OK : thread_id=%s titre='%s' reroute=%s",
                    thread_id, title, bool(reroute_info))

    resp_data = {
        "ok":         True,
        "updated":    True,
        "rerouted":   bool(reroute_info),
        "thread_id":  thread_id,
        "message_id": message_id,
        "thread_url": thread_url,
        "discord_url": thread_url,
        "forum_id":   target_forum_id or 0,
        "threadId":   thread_id,
        "messageId":  message_id,
        "threadUrl":  thread_url,
        "discordUrl": thread_url,
        "forumId":    target_forum_id or 0,
    }
    if is_legacy:
        resp_data["legacy_key_warning"] = LEGACY_KEY_WARNING
    return _with_cors(request, web.json_response(resp_data))


async def forum_post_delete(request):
    """Supprime definitivement un post Discord + Supabase + annonce."""
    is_valid, _, _, _ = await _auth_request(request, "/api/forum-post/delete")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    try:
        body = await request.json()
    except Exception:
        body = {}

    thread_id  = (body.get("threadId")  or body.get("thread_id")  or "").strip()
    post_id    = (body.get("postId")    or body.get("post_id")    or body.get("id") or "").strip()
    post_title = (body.get("postTitle") or body.get("title")      or "").strip()
    reason     = (body.get("reason")    or "").strip()

    logger.info("[api] Suppression post : %s (thread=%s, raison=%s)",
                post_title or post_id, thread_id, reason or "N/A")

    if not thread_id:
        if post_id:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, _delete_from_supabase_sync, None, post_id)
        return _with_cors(request, web.json_response({"ok": True, "skipped_discord": True}))

    async with aiohttp.ClientSession() as session:
        deleted, status = await _discord_delete_channel(session, thread_id)

        if not deleted:
            if status == 404:
                logger.info("[api] Thread deja supprime : %s", thread_id)
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, _delete_from_supabase_sync, thread_id, post_id)
                return _with_cors(request, web.json_response(
                    {"ok": False, "error": "Thread introuvable (deja supprime ?)", "not_found": True},
                    status=404,
                ))
            logger.warning("[api] Echec suppression thread Discord %s (status=%d)", thread_id, status)
            return _with_cors(request, web.json_response(
                {"ok": False, "error": "Echec suppression du thread sur Discord"}, status=500
            ))

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _delete_from_supabase_sync, thread_id, post_id)

        if post_title:
            discord_url = (
                body.get("discordUrl") or body.get("discord_url") or body.get("thread_url") or ""
            )
            await _send_deletion_announcement(session, post_title, reason, thread_url=discord_url)

    logger.info("[api] Post supprime : %s", post_title or thread_id)
    return _with_cors(request, web.json_response({"ok": True, "thread_id": thread_id}))


async def get_history(request):
    is_valid, _, _, is_legacy = await _auth_request(request, "/api/history")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    sb = _get_supabase()
    if not sb:
        return _with_cors(request, web.json_response({"ok": False, "error": "Supabase non configure"}, status=500))

    res   = sb.table("published_posts").select("*").order("updated_at", desc=True).limit(1000).execute()
    posts = [_normalize_history_row(r) for r in (res.data or [])]

    resp_data = {"ok": True, "posts": posts, "count": len(posts)}
    if is_legacy:
        resp_data["legacy_key_warning"] = LEGACY_KEY_WARNING
    return _with_cors(request, web.json_response(resp_data))


async def get_instructions(request):
    """Retourne toutes les instructions (owner_data, data_key=instructions) pour les master admin uniquement."""
    is_valid, discord_user_id, _, is_legacy = await _auth_request(request, "/api/instructions")
    if not is_valid or is_legacy or not discord_user_id:
        return _with_cors(request, web.json_response({"ok": False, "error": "Accès refusé"}, status=403))
    sb = _get_supabase()
    if not sb:
        return _with_cors(request, web.json_response({"ok": False, "error": "Supabase non configure"}, status=500))
    try:
        res = sb.table("profiles").select("is_master_admin").eq("discord_id", discord_user_id).limit(1).execute()
        if not res.data or not res.data[0].get("is_master_admin"):
            logger.warning("[api] get_instructions refusé — discord_id=%s non master_admin", discord_user_id)
            return _with_cors(request, web.json_response({"ok": False, "error": "Droits insuffisants"}, status=403))
    except Exception as e:
        logger.error("[api] Vérification master_admin (instructions): %s", e)
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))
    try:
        res = sb.table("owner_data").select("owner_type, owner_id, value").eq("data_key", "instructions").execute()
        rows = [{"owner_type": r["owner_type"], "owner_id": r["owner_id"], "value": r["value"]} for r in (res.data or [])]
        return _with_cors(request, web.json_response({"ok": True, "instructions": rows, "count": len(rows)}))
    except Exception as e:
        logger.error("[api] Erreur lecture owner_data (instructions): %s", e)
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))


async def get_forum_tags(request):
    """
    Retourne les tags disponibles d'un salon forum Discord (GET /api/forum-tags?forum_id=...).
    Permet au frontend de pré-remplir la Gestion des tags secondaires depuis Discord.
    """
    is_valid, _, _, _ = await _auth_request(request, "/api/forum-tags")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    forum_id = (request.query.get("forum_id") or "").strip()
    if not forum_id:
        return _with_cors(request, web.json_response({"ok": False, "error": "forum_id requis"}, status=400))
    async with aiohttp.ClientSession() as session:
        status, tags = await get_forum_available_tags(session, forum_id)
    if status >= 400:
        return _with_cors(request, web.json_response(
            {"ok": False, "error": "Salon introuvable ou inaccessible", "status": status},
            status=502 if status >= 500 else 400,
        ))
    return _with_cors(request, web.json_response({"ok": True, "tags": tags, "count": len(tags)}))


async def sync_forum_tags(request):
    """
    Crée les tags fixes sur un salon forum Discord (POST /api/forum-tags/sync).
    Body: { "forum_id": "..." }. Préserve les tags libres existants et les IDs des tags fixes déjà présents.
    """
    is_valid, _, _, _ = await _auth_request(request, "/api/forum-tags/sync")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    try:
        body = await request.json()
    except Exception:
        return _with_cors(request, web.json_response({"ok": False, "error": "Body JSON invalide"}, status=400))
    forum_id = (body.get("forum_id") or "").strip()
    if not forum_id:
        return _with_cors(request, web.json_response({"ok": False, "error": "forum_id requis"}, status=400))
    async with aiohttp.ClientSession() as session:
        status, err_msg, tags = await sync_forum_fixed_tags(session, forum_id)
    if status >= 400:
        return _with_cors(request, web.json_response(
            {"ok": False, "error": err_msg or "Erreur Discord", "status": status},
            status=502 if status >= 500 else 400,
        ))
    return _with_cors(request, web.json_response({"ok": True, "tags": tags, "count": len(tags)}))


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
    """Supprime definitivement le compte d'un utilisateur."""
    is_valid, _, _, _ = await _auth_request(request, "/api/account/delete")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    try:
        body = await request.json()
    except Exception:
        return _with_cors(request, web.json_response({"ok": False, "error": "Body JSON invalide"}, status=400))

    user_id = (body.get("user_id") or "").strip()
    if not user_id:
        return _with_cors(request, web.json_response({"ok": False, "error": "user_id requis"}, status=400))

    logger.info("[api] Suppression compte : user_id=%s", user_id)

    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _delete_account_data_sync, user_id)

    if not result["ok"]:
        logger.error("[api] Echec suppression compte : %s", result)
        return _with_cors(request, web.json_response(
            {"ok": False, "error": "Echec suppression du compte", "details": result.get("details")},
            status=500,
        ))

    logger.info("[api] Compte supprime : %s", user_id)
    return _with_cors(request, web.json_response({"ok": True, "details": result["details"]}))

async def server_action(request):
    """Gestion du serveur Ubuntu — master admin uniquement."""
    import re
    import subprocess as _sp

    is_valid, discord_user_id, discord_name, is_legacy = await _auth_request(request, "/api/server/action")
    if not is_valid or is_legacy or not discord_user_id:
        return _with_cors(request, web.json_response({"ok": False, "error": "Accès refusé"}, status=403))

    # Vérification is_master_admin via Supabase
    sb = _get_supabase()
    if sb:
        try:
            res = sb.table("profiles").select("is_master_admin") \
                .eq("discord_id", discord_user_id).limit(1).execute()
            if not res.data or not res.data[0].get("is_master_admin"):
                logger.warning("[api] server_action refusé — discord_id=%s non master_admin", discord_user_id)
                return _with_cors(request, web.json_response({"ok": False, "error": "Droits insuffisants"}, status=403))
        except Exception as e:
            logger.error("[api] Vérification master_admin : %s", e)
            return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))

    try:
        body = await request.json()
    except Exception:
        return _with_cors(request, web.json_response({"ok": False, "error": "JSON invalide"}, status=400))

    action = (body.get("action") or "").strip()
    params = body.get("params") or {}

    def run(*cmd) -> str:
        try:
            r = _sp.run(list(cmd), capture_output=True, text=True, timeout=30)
            return (r.stdout + r.stderr).strip()
        except _sp.TimeoutExpired:
            return "⏰ Timeout (30s)"
        except Exception as exc:
            return f"❌ {exc}"

    output = ""

    if action == "service_status":
        output = run("sudo", "systemctl", "status", "discord-bots", "--no-pager", "-l")

    elif action == "service_restart":
        out = run("sudo", "systemctl", "restart", "discord-bots")
        output = out or "✅ Service redémarré avec succès"

    elif action == "service_stop":
        out = run("sudo", "systemctl", "stop", "discord-bots")
        output = out or "✅ Service arrêté"

    elif action == "firewall_status":
        output = run("sudo", "iptables", "-L", "INPUT", "-n", "-v", "--line-numbers")

    elif action == "firewall_reset":
        # 1. Réinitialisation complète
        flush_cmds = [
            ("sudo", "iptables", "-P", "INPUT",   "ACCEPT"),
            ("sudo", "iptables", "-P", "FORWARD", "ACCEPT"),
            ("sudo", "iptables", "-P", "OUTPUT",  "ACCEPT"),
            ("sudo", "iptables", "-F"),
            ("sudo", "iptables", "-X"),
        ]
        # 2. Restauration des règles ACCEPT de base
        #    Même logique que 10_SSH_FixFirewall.ps1 :
        #    -I INPUT 1 (insertion en tête) pour SSH/4242 — priorité absolue
        #    -A (append) pour le reste — ordre identique au script PowerShell
        restore_cmds = [
            # SSH port actuel  (-I = insertion en tête, priorité absolue)
            ("sudo", "iptables", "-I", "INPUT", "1", "-p", "tcp", "--dport", "22",   "-j", "ACCEPT"),
            # SSH port alternatif / bots  (-I = insertion en tête)
            ("sudo", "iptables", "-I", "INPUT", "1", "-p", "tcp", "--dport", "4242", "-j", "ACCEPT"),
            # API REST  (-A = append, comme le .ps1)
            ("sudo", "iptables", "-A", "INPUT", "-p", "tcp", "--dport", "8080", "-j", "ACCEPT"),
            # ICMP Path MTU Discovery (type 3 code 4) — Oracle
            ("sudo", "iptables", "-A", "INPUT", "-p", "icmp", "--icmp-type", "3/4",  "-j", "ACCEPT"),
            # ICMP réseau interne OCI (10.0.0.0/16)
            ("sudo", "iptables", "-A", "INPUT", "-s", "10.0.0.0/16", "-p", "icmp", "--icmp-type", "3", "-j", "ACCEPT"),
            # Loopback
            ("sudo", "iptables", "-A", "INPUT", "-i", "lo", "-j", "ACCEPT"),
            # Connexions établies / liées
            ("sudo", "iptables", "-A", "INPUT", "-m", "conntrack", "--ctstate", "ESTABLISHED,RELATED", "-j", "ACCEPT"),
        ]
        # 3. Sauvegarde + rechargement Fail2ban
        post_cmds = [
            ("sudo", "netfilter-persistent", "save"),
            ("sudo", "fail2ban-client", "reload"),
        ]

        parts = []
        for cmd in flush_cmds:
            r = run(*cmd)
            parts.append(f"$ {' '.join(cmd)}\n{r if r else '(ok)'}")

        parts.append("\n── Restauration des règles ACCEPT de base ──")
        for cmd in restore_cmds:
            r = run(*cmd)
            parts.append(f"$ {' '.join(cmd)}\n{r if r else '(ok)'}")

        parts.append("\n── Sauvegarde + rechargement Fail2ban ──")
        for cmd in post_cmds:
            r = run(*cmd)
            parts.append(f"$ {' '.join(cmd)}\n{r if r else '(ok)'}")

        output = "\n".join(parts)

    elif action == "ip_block":
        ips = [i.strip() for i in params.get("ips", []) if i.strip()]
        if not ips:
            return _with_cors(request, web.json_response({"ok": False, "error": "Aucune IP fournie"}))
        lines = []
        for ip in ips:
            r = run("sudo", "iptables", "-I", "INPUT", "1", "-s", ip, "-j", "DROP")
            lines.append(f"  DROP {ip} : {r or 'ok'}")
        run("sudo", "netfilter-persistent", "save")
        output = "Blocage appliqué :\n" + "\n".join(lines) + "\n\n✅ Règles sauvegardées (netfilter-persistent)"

    elif action == "ip_unblock":
        ips = [i.strip() for i in params.get("ips", []) if i.strip()]
        if not ips:
            return _with_cors(request, web.json_response({"ok": False, "error": "Aucune IP fournie"}))
        lines = []
        for ip in ips:
            r = run("sudo", "iptables", "-D", "INPUT", "-s", ip, "-j", "DROP")
            lines.append(f"  Unblock {ip} : {r or 'ok'}")
        run("sudo", "netfilter-persistent", "save")
        output = "Déblocage appliqué :\n" + "\n".join(lines) + "\n\n✅ Règles sauvegardées"

    elif action == "ip_list_blocked":
        ipt = run("sudo", "iptables", "-L", "INPUT", "-n", "-v", "--line-numbers")
        drops = [l for l in ipt.splitlines() if "DROP" in l and "icmp-port-unreachable" not in l]

        f2b_raw = run("sudo", "fail2ban-client", "status")
        jail_m = re.search(r"Jail list:\s*(.+)", f2b_raw)
        f2b_section = ""
        if jail_m:
            jails = [j.strip() for j in jail_m.group(1).replace(",", " ").split() if j.strip()]
            f2b_lines = []
            for jail in jails:
                st = run("sudo", "fail2ban-client", "status", jail)
                banned_m = re.search(r"Banned IP list:\s*(.+)", st)
                count_m  = re.search(r"Currently banned:\s*(\d+)", st)
                count  = count_m.group(1) if count_m else "?"
                # ← Toutes les IPs, sans limite [:10]
                banned = (banned_m.group(1).strip() if banned_m else "").split()
                f2b_lines.append(f"  [{jail}] {count} banni(e)s")
                for b in banned:
                    f2b_lines.append(f"    - {b}")
            f2b_section = "\n".join(f2b_lines)

        output = (
            f"=== IPTABLES DROP ({len(drops)}) ===\n"
            + ("\n".join(drops) if drops else "  (aucun blocage manuel)")
            + f"\n\n=== FAIL2BAN ===\n"
            + (f2b_section or "  (aucune prison active)")
        )

    elif action == "fail2ban_status":
        raw = run("sudo", "fail2ban-client", "status")
        jail_m = re.search(r"Jail list:\s*(.+)", raw)
        parts = [raw]
        if jail_m:
            jails = [j.strip() for j in jail_m.group(1).replace(",", " ").split() if j.strip()]
            for jail in jails:
                st = run("sudo", "fail2ban-client", "status", jail)
                parts.append(f"\n{'─'*40}\n[{jail}]\n{st}")
        output = "\n".join(parts)

    elif action == "fail2ban_unban":
        ip   = (params.get("ip")   or "").strip()
        jail = (params.get("jail") or "").strip()
        if not ip:
            return _with_cors(request, web.json_response({"ok": False, "error": "IP requise"}))
        if jail:
            output = run("sudo", "fail2ban-client", "set", jail, "unbanip", ip)
            output = output or f"✅ {ip} débannie de [{jail}]"
        else:
            raw = run("sudo", "fail2ban-client", "status")
            jail_m = re.search(r"Jail list:\s*(.+)", raw)
            lines = []
            if jail_m:
                jails = [j.strip() for j in jail_m.group(1).replace(",", " ").split() if j.strip()]
                for j in jails:
                    r = run("sudo", "fail2ban-client", "set", j, "unbanip", ip)
                    lines.append(f"  [{j}] : {r or 'ok'}")
            output = f"Tentative unban {ip} dans toutes les prisons :\n" + ("\n".join(lines) or "Aucune prison trouvée")

    elif action == "logs_purge":
        mode = params.get("mode", "both")          # "bot" | "journal" | "both"
        vacuum_time = params.get("vacuum_time", "7d")  # "1d" | "7d" | "30d" | "all"
        parts = []

        if mode in ("bot", "both"):
            r = run("sudo", "truncate", "-s", "0", str(LOG_FILE))
            parts.append(f"Bot.log vidé : {r or '✅ OK'}")

        if mode in ("journal", "both"):
            if vacuum_time == "all":
                r1 = run("sudo", "journalctl", "--rotate")
                r2 = run("sudo", "journalctl", "--vacuum-time=1s")
                parts.append(f"Journalctl --rotate : {r1 or 'ok'}")
                parts.append(f"Journalctl --vacuum-time=1s : {r2 or '✅ OK'}")
            else:
                r = run("sudo", "journalctl", f"--vacuum-time={vacuum_time}")
                parts.append(f"Journalctl vacuum ({vacuum_time}) : {r or '✅ OK'}")

        output = "\n".join(parts) if parts else "Aucune action effectuée"

    elif action == "api_test":
        port_raw  = run("sudo", "ss", "-tunlp")
        port_hits = [l for l in port_raw.splitlines() if "8080" in l]
        
        # Curl avec timeout augmenté + fallback wget
        health = run("curl", "-s", "--max-time", "10",
                    "http://127.0.0.1:8080/api/publisher/health")
        if not health:
            health = run("wget", "-qO-", "--timeout=10",
                        "http://127.0.0.1:8080/api/publisher/health")
        
        output = (
            f"=== Port 8080 (ss -tunlp) ===\n"
            + ("\n".join(port_hits) if port_hits else "  ❌ Port 8080 non trouvé")
            + f"\n\n=== Health check (localhost) ===\n"
            + (health or "❌ Pas de réponse (service arrêté ?)")
        )

    else:
        return _with_cors(request, web.json_response({"ok": False, "error": f"Action inconnue : {action}"}, status=400))

    logger.info("[api] server_action '%s' par %s", action, discord_name or discord_user_id)
    return _with_cors(request, web.json_response({"ok": True, "output": output, "error": None}))


async def transfer_ownership(request):
    """
    Transfère la propriété des posts. Admin : toute source → toute cible.
    Utilisateur : uniquement ses propres posts (source = son discord_id) vers une cible.
    Body: source_author_discord_id ou source_author_external_id, target_author_discord_id ou target_author_external_id, post_id? (optionnel), post_ids? (optionnel, liste).
    Pas de re-routage Discord : seul le propriétaire en base est modifié (re-routage uniquement à la mise à jour).
    """
    is_valid, discord_user_id, _, is_legacy = await _auth_request(request, "/api/transfer-ownership")
    if not is_valid or is_legacy or not discord_user_id:
        return _with_cors(request, web.json_response({"ok": False, "error": "Accès refusé"}, status=403))
    sb = _get_supabase()
    if not sb:
        return _with_cors(request, web.json_response({"ok": False, "error": "Supabase non configuré"}, status=500))
    is_admin = False
    try:
        res = sb.table("profiles").select("is_master_admin").eq("discord_id", discord_user_id).limit(1).execute()
        if res.data and len(res.data) > 0:
            is_admin = bool(res.data[0].get("is_master_admin"))
    except Exception as e:
        logger.error("[api] Vérification master_admin (transfer): %s", e)
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))
    try:
        body = await request.json()
    except Exception:
        return _with_cors(request, web.json_response({"ok": False, "error": "Body JSON invalide"}, status=400))
    src_discord = (body.get("source_author_discord_id") or "").strip() or None
    src_ext = (body.get("source_author_external_id") or "").strip() or None
    tgt_discord = (body.get("target_author_discord_id") or "").strip() or None
    tgt_ext = (body.get("target_author_external_id") or "").strip() or None
    post_id = (body.get("post_id") or "").strip() or None
    post_ids = body.get("post_ids")
    if isinstance(post_ids, list):
        post_ids = [x for x in post_ids if x]
    else:
        post_ids = None
    if (not src_discord and not src_ext) or (not tgt_discord and not tgt_ext):
        return _with_cors(request, web.json_response({"ok": False, "error": "Source et cible requises (discord_id ou external_id)"}, status=400))
    if not is_admin:
        if src_ext:
            return _with_cors(request, web.json_response({"ok": False, "error": "Seul un admin peut transférer depuis un traducteur externe"}, status=403))
        if src_discord != discord_user_id:
            return _with_cors(request, web.json_response({"ok": False, "error": "Vous ne pouvez transférer que vos propres publications"}, status=403))
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, _transfer_post_ownership_sync, src_discord, src_ext, tgt_discord, tgt_ext, post_id, post_ids,
    )
    if not result.get("ok"):
        status = 404 if result.get("error") == "Post introuvable ou n'appartient pas à l'auteur source" else 400
        return _with_cors(request, web.json_response({"ok": False, "error": result.get("error", "Erreur")}, status=status))
    logger.info("[api] Transfert propriété : %d post(s) par %s (admin=%s)", result.get("count", 0), discord_user_id, is_admin)
    return _with_cors(request, web.json_response({"ok": True, "count": result.get("count", 0)}))


async def reset_synopsis(request):
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
    """
    Retourne les 300 dernières lignes du journal systemd du service discord-bot-traductions.
    GET /api/logs/journal
    """
    is_valid, _, _, _ = await _auth_request(request, "/api/logs/journal")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    try:
        proc = await asyncio.create_subprocess_exec(
            "journalctl", "-u", "discord-bot-traductions", "-n", "300", "--no-pager", "-o", "short",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10.0)
        except asyncio.TimeoutError:
            proc.kill()
            return _with_cors(request, web.json_response(
                {"ok": False, "error": "Timeout : journalctl a mis trop de temps à répondre"},
                status=500
            ))
        content = stdout.decode("utf-8", errors="replace")
        return _with_cors(request, web.json_response({"ok": True, "logs": content}))
    except FileNotFoundError:
        return _with_cors(request, web.json_response(
            {"ok": False, "error": "journalctl non disponible sur ce système"},
            status=500
        ))
    except Exception as e:
        logger.exception("[api] get_journal_logs : %s", e)
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))


# ==================== APP ====================

def make_app() -> web.Application:
    """Cree et configure l'application aiohttp avec toutes les routes."""
    app = web.Application(middlewares=[logging_middleware])

    routes = [
        ("OPTIONS", "/{tail:.*}",                         options_handler),
        ("GET",     "/",                                  health),
        ("GET",     "/api/status",                        health),
        ("POST",    "/api/configure",                     configure),
        ("POST",    "/api/forum-post",                    forum_post),
        ("POST",    "/api/forum-post/update",             forum_post_update),
        ("POST",    "/api/forum-post/delete",             forum_post_delete),
        ("GET",     "/api/publisher/health",              health),
        ("GET",     "/api/history",                       get_history),
        ("GET",     "/api/instructions",                  get_instructions),
        ("GET",     "/api/forum-tags",                    get_forum_tags),
        ("POST",    "/api/forum-tags/sync",               sync_forum_tags),
        ("GET",     "/api/jeux",                          get_jeux),
        ("POST",    "/api/account/delete",                account_delete),
        ("GET",     "/api/logs",                          get_logs),
        ("POST",    "/api/server/action",                 server_action),
        ("POST",    "/api/transfer-ownership",            transfer_ownership),
        ("POST",    "/api/scrape/enrich",                 scrape_enrich),
        ("POST",    "/api/translate",                     translate_handler),
        ("POST",    "/api/collection/resolve",            collection_resolve),
        ("POST",    "/api/collection/nexus-parse-db",     nexus_parse_db),
        ("POST",    "/api/collection/import-batch",       collection_import_batch),
        ("GET",     "/api/collection/f95-traducteurs",    collection_f95_traducteurs),
        ("POST",    "/api/collection/f95-preview",        collection_f95_preview),
        ("POST",    "/api/collection/f95-import",         collection_f95_import),
        ("POST",    "/api/collection/enrich-entries",     collection_enrich_entries),
        ("POST",    "/api/enrich/reset-synopsis",         reset_synopsis),
        ("GET",     "/api/enrich/synopsis-stats",         get_enrich_synopsis_stats),
        ("GET",     "/api/logs/journal",                  get_journal_logs),
        ("POST",    "/api/jeux/sync-force",               jeux_sync_force),
        ("PATCH",   "/api/f95-jeux/{id}/synopsis",        update_f95_jeu_synopsis),
        # Catch-all en dernier
        ("*",       "/{tail:.*}",                         handle_404),
    ]

    for method, path, handler in routes:
        app.router.add_route(method, path, handler)
        logger.info("[api] Route enregistree : %-7s %s", method, path)

    logger.info("[api] %d route(s) enregistree(s)", len(routes))
    return app
