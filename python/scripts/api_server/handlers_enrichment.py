import asyncio
import datetime
import json
import logging
from zoneinfo import ZoneInfo

import aiohttp
from aiohttp import web

from api_key_auth import _auth_request
from scraper import enrich_dates_with_fallback
from supabase_client import _get_supabase
from translator import translate_text

from .middleware import with_cors

logger = logging.getLogger("api")


async def translate_handler(request):
    is_valid, _, _, _ = await _auth_request(request, "/api/translate")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    try:
        data = await request.json()
        text = (data.get("text") or "").strip()
        if not text:
            return with_cors(request, web.json_response({"ok": False, "error": "Texte vide"}, status=400))
        source_lang = (data.get("source_lang") or "en").strip() or "en"
        target_lang = (data.get("target_lang") or "fr").strip() or "fr"
        async with aiohttp.ClientSession() as session:
            translated = await translate_text(session, text, source_lang, target_lang)
        if translated is None:
            return with_cors(request, web.json_response({"ok": False, "error": "Traduction échouée"}, status=500))
        return with_cors(request, web.json_response({"ok": True, "translated": translated}))
    except Exception as e:
        logger.exception("[api] /api/translate erreur: %s", e)
        return with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))


async def reset_synopsis(request):
    is_valid, _, _, _ = await _auth_request(request, "/api/enrich/reset-synopsis")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    try:
        body = await request.json() if request.body_exists else {}
    except Exception:
        body = {}
    if (body.get("confirm") or "").strip() != "RESET":
        return with_cors(request, web.json_response({"ok": False, "error": "Confirmation manquante — envoyez { \"confirm\": \"RESET\" }"}, status=400))

    sb = _get_supabase()
    if not sb:
        return with_cors(request, web.json_response({"ok": False, "error": "Supabase non configuré"}, status=500))
    try:
        res = sb.table("f95_jeux").update({"synopsis_en": None, "synopsis_fr": None}).gt("id", 0).execute()
        affected = len(res.data) if res.data else 0
        return with_cors(request, web.json_response({"ok": True, "updated": affected, "message": f"{affected} ligne(s) remises à NULL (synopsis_en + synopsis_fr)"}))
    except Exception as e:
        logger.exception("[api] reset_synopsis : %s", e)
        return with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))


async def get_enrich_synopsis_stats(request):
    is_valid, _, _, _ = await _auth_request(request, "/api/enrich/synopsis-stats")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    sb = _get_supabase()
    if not sb:
        return with_cors(request, web.json_response({"ok": False, "error": "Supabase non configuré"}, status=500))
    try:
        all_rows = []
        offset = 0
        page_size = 1000
        while True:
            res = sb.table("f95_jeux").select("id, site_id, nom_du_jeu, nom_url, synopsis_en, synopsis_fr").range(offset, offset + page_size - 1).execute()
            batch = res.data or []
            all_rows.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size

        groups = {}
        for row in all_rows:
            key = (row.get("nom_url") or "").strip() or f"id:{row.get('id')}"
            groups.setdefault(key, []).append(row)

        total_groups = len(groups)
        with_en = 0
        with_fr = 0
        missing_fr_entries = []
        for group_rows in groups.values():
            has_en = any((r.get("synopsis_en") or "").strip() for r in group_rows)
            has_fr = any((r.get("synopsis_fr") or "").strip() for r in group_rows)
            if has_en:
                with_en += 1
            if has_fr:
                with_fr += 1
            if has_en and not has_fr:
                first = group_rows[0]
                missing_fr_entries.append({
                    "id": first.get("id"),
                    "site_id": first.get("site_id"),
                    "nom_du_jeu": first.get("nom_du_jeu"),
                    "nom_url": first.get("nom_url"),
                    "group_size": len(group_rows),
                    "group_ids": [r.get("id") for r in group_rows if r.get("id") is not None],
                })

        missing_fr_entries = missing_fr_entries[:300]
        return with_cors(request, web.json_response({
            "ok": True,
            "stats": {
                "total_groups": total_groups,
                "with_synopsis_en": with_en,
                "with_synopsis_fr": with_fr,
                "missing_synopsis_fr": total_groups - with_fr,
            },
            "missing_entries": missing_fr_entries,
        }))
    except Exception as e:
        logger.exception("[api] get_enrich_synopsis_stats : %s", e)
        return with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))


async def scrape_thread_dates(request):
    is_valid, _, _, _ = await _auth_request(request, "/api/scrape/thread-dates")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    try:
        body = await request.json() or {}
    except Exception:
        return with_cors(request, web.json_response({"ok": False, "error": "Body JSON invalide"}, status=400))

    jeux = body.get("jeux") or []
    rss_raw = body.get("rss_date_map") or {}
    f95_cookies = (body.get("f95_cookies") or "").strip() or None
    try:
        scrape_delay = max(1.0, float(body.get("scrape_delay") or 2.0))
    except (TypeError, ValueError):
        scrape_delay = 2.0
    rss_date_map = {int(k): v for k, v in rss_raw.items() if str(k).isdigit()}
    if not jeux:
        return with_cors(request, web.json_response({"ok": False, "error": "Paramètre 'jeux' requis (liste non vide)"}, status=400))

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
        updated_count = 0
        sb = _get_supabase()

        async def on_progress(current, total, site_id, date):
            nonlocal updated_count
            if client_disconnected[0]:
                return
            msg = f"✅ [{current}/{total}] site_id={site_id} → {date}" if date else f"⏭️ [{current}/{total}] site_id={site_id} — introuvable"
            await send({"progress": {"current": current, "total": total}, "log": msg})
            if date and sb:
                try:
                    sb.table("f95_jeux").update({"f95_date_maj": date}).eq("site_id", site_id).execute()
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
            await send({"log": f"🎉 Terminé : {updated_count} date(s) mise(s) à jour dans f95_jeux", "status": "completed", "updated": updated_count})
    except Exception as e:
        logger.error("[api] scrape_thread_dates erreur : %s", e, exc_info=True)
        await send({"error": str(e), "status": "error"})
    finally:
        await response.write_eof()
    return response
