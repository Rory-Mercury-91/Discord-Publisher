import asyncio
import logging
import tempfile

import aiohttp
from aiohttp import web

from api_key_auth import _auth_request
from nexus_export import parse_nexus_db
from scraper import _PLACEHOLDER_DATE, extract_f95_thread_id, scrape_f95_game_data
from supabase_client import _get_supabase
from translator import translate_text

from .middleware import with_cors

logger = logging.getLogger("api")


async def _get_date_from_rss(
    session: aiohttp.ClientSession,
    thread_id: int,
) -> str | None:
    import re as _re2
    import xml.etree.ElementTree as ET2
    from email.utils import parsedate_to_datetime as _ptd

    rss_url = "https://f95zone.to/sam/latest_alpha/latest_data.php?cmd=rss&cat=games&rows=90"
    try:
        async with session.get(
            rss_url,
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=aiohttp.ClientTimeout(total=10),
        ) as resp:
            if resp.status != 200:
                return None
            xml_text = await resp.text(encoding="utf-8", errors="replace")

        root = ET2.fromstring(xml_text)
        for item in root.iter("item"):
            raw = ET2.tostring(item, encoding="unicode")
            m = _re2.search(r"/threads/(?:[^/]*\.)?(\d+)", raw)
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
    is_valid, _, _, _ = await _auth_request(request, "/api/collection/resolve")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    try:
        data = await request.json() or {}
        url = (data.get("url") or "").strip()
        thread_id_raw = data.get("f95_thread_id")
        f95_thread_id = int(thread_id_raw) if thread_id_raw is not None and str(thread_id_raw).strip() != "" else None

        if url and "f95zone.to" not in url.lower() and "lewdcorner.com" not in url.lower():
            return with_cors(request, web.json_response({"ok": False, "error": "URL F95Zone/LewdCorner invalide"}, status=400))
        if not url and f95_thread_id is None:
            return with_cors(request, web.json_response({"ok": False, "error": "Fournir url ou f95_thread_id"}, status=400))

        if url:
            tid_str = extract_f95_thread_id(url)
            f95_thread_id = int(tid_str) if tid_str else None
            if not f95_thread_id:
                return with_cors(request, web.json_response(
                    {"ok": False, "error": "Impossible d'extraire l'ID du thread depuis l'URL"},
                    status=400,
                ))
            if not url.startswith("http"):
                url = "https://f95zone.to" + url if url.startswith("/") else f"https://f95zone.to/threads/thread.{f95_thread_id}/"
        else:
            url = f"https://f95zone.to/threads/thread.{f95_thread_id}/"

        cookies = (data.get("cookies") or "").strip() or None
        translate_synopsis = data.get("translate_synopsis", True)
        synopsis_en = None
        synopsis_fr = None
        rss_date = None

        async with aiohttp.ClientSession() as session:
            rss_date = await _get_date_from_rss(session, f95_thread_id)
            if rss_date:
                logger.info("[api] collection_resolve : date RSS thread %d -> %s", f95_thread_id, rss_date)
            game_data = await scrape_f95_game_data(session, url, cookies=cookies)
            if not game_data:
                return with_cors(request, web.json_response({
                    "ok": True, "f95_thread_id": f95_thread_id, "title": None,
                    "f95_url": url, "scraped_data": None, "f95_date_maj": rss_date,
                }))
            synopsis_en = (game_data.get("synopsis") or "").strip()
            if synopsis_en and translate_synopsis:
                try:
                    synopsis_fr = await translate_text(session, synopsis_en, "en", "fr")
                except Exception as error:
                    logger.warning("[api] collection_resolve : traduction synopsis échouée : %s", error)

        scraped_page_date = game_data.get("f95_date_maj")
        final_date = rss_date or (scraped_page_date if scraped_page_date and scraped_page_date != _PLACEHOLDER_DATE else None)
        title = game_data.get("name") or game_data.get("title")
        scraped_data = {
            "name": game_data.get("name"),
            "version": game_data.get("version"),
            "image": game_data.get("image"),
            "status": game_data.get("status"),
            "tags": game_data.get("tags"),
            "type": game_data.get("type"),
            "synopsis": synopsis_en or game_data.get("synopsis"),
            "synopsis_en": synopsis_en or game_data.get("synopsis"),
            "synopsis_fr": synopsis_fr,
            "f95_date_maj": final_date,
        }
        return with_cors(request, web.json_response({
            "ok": True,
            "f95_thread_id": game_data.get("id") or f95_thread_id,
            "title": title,
            "f95_url": url,
            "scraped_data": scraped_data,
            "f95_date_maj": final_date,
        }))
    except ValueError:
        return with_cors(request, web.json_response({"ok": False, "error": "f95_thread_id invalide"}, status=400))
    except Exception as error:
        logger.exception("[api] /api/collection/resolve erreur : %s", error)
        return with_cors(request, web.json_response({"ok": False, "error": str(error)}, status=500))


async def nexus_parse_db(request):
    is_valid, _, _, _ = await _auth_request(request, "/api/collection/nexus-parse-db")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    db_bytes = None
    try:
        reader = await request.multipart()
        async for field in reader:
            if field.name == "file":
                db_bytes = await field.read()
                break
    except Exception as error:
        return with_cors(request, web.json_response({"ok": False, "error": f"Lecture du fichier échouée : {error}"}, status=400))
    if not db_bytes:
        return with_cors(request, web.json_response({"ok": False, "error": "Champ 'file' manquant dans la requête"}, status=400))

    max_size = 200 * 1024 * 1024
    if len(db_bytes) > max_size:
        return with_cors(request, web.json_response({"ok": False, "error": "Fichier trop volumineux (max 200 Mo)"}, status=413))

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
            tmp.write(db_bytes)
            tmp_path = tmp.name
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, parse_nexus_db, tmp_path)
        logger.info("[api] nexus-parse-db : %d entrée(s) parsée(s) (%d F95, %d LC)", result["stats"]["total"], result["stats"]["with_f95"], result["stats"]["with_lc"])
        return with_cors(request, web.json_response({"ok": True, **result}))
    except ValueError as error:
        return with_cors(request, web.json_response({"ok": False, "error": str(error)}, status=422))
    except Exception as error:
        logger.exception("[api] nexus-parse-db erreur : %s", error)
        return with_cors(request, web.json_response({"ok": False, "error": str(error)}, status=500))
    finally:
        if tmp_path:
            try:
                import os
                os.unlink(tmp_path)
            except Exception:
                pass


async def collection_f95_traducteurs(request):
    is_valid, _, _, _ = await _auth_request(request, "/api/collection/f95-traducteurs")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    sb = _get_supabase()
    if not sb:
        return with_cors(request, web.json_response({"ok": False, "error": "Supabase non configuré"}, status=500))

    try:
        res = sb.table("f95_jeux").select("traducteur").not_.is_("traducteur", "null").execute()
        raw = [r.get("traducteur", "").strip() for r in (res.data or []) if r.get("traducteur")]
        traducteurs = sorted({t for t in raw if t})
        return with_cors(request, web.json_response({"ok": True, "traducteurs": traducteurs}))
    except Exception as error:
        logger.exception("[api] f95-traducteurs : %s", error)
        return with_cors(request, web.json_response({"ok": False, "error": str(error)}, status=500))


async def collection_f95_preview(request):
    is_valid, _, _, _ = await _auth_request(request, "/api/collection/f95-preview")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    sb = _get_supabase()
    if not sb:
        return with_cors(request, web.json_response({"ok": False, "error": "Supabase non configuré"}, status=500))
    try:
        body = await request.json() or {}
    except Exception:
        return with_cors(request, web.json_response({"ok": False, "error": "Body JSON invalide"}, status=400))

    owner_id = (body.get("owner_id") or "").strip()
    traducteur = (body.get("traducteur") or "").strip()
    type_jeu = (body.get("type") or "").strip()
    statut = (body.get("statut") or "").strip()
    search = (body.get("search") or "").strip()
    try:
        limit = min(int(body.get("limit") or 2000), 5000)
    except (TypeError, ValueError):
        limit = 500

    if not owner_id:
        return with_cors(request, web.json_response({"ok": False, "error": "owner_id requis"}, status=400))
    if not traducteur and not type_jeu and not statut and not search:
        return with_cors(request, web.json_response({"ok": False, "error": "Au moins un filtre requis (traducteur, type, statut, search)"}, status=400))

    full_list = bool(body.get("full_list", False))
    try:
        query = sb.table("f95_jeux").select("site_id, nom_du_jeu, traducteur, version, trad_ver, statut, type, nom_url").not_.is_("site_id", "null")
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

        seen: set = set()
        unique_jeux = []
        for jeu in all_jeux:
            sid = jeu.get("site_id")
            if sid and sid not in seen:
                seen.add(sid)
                unique_jeux.append(jeu)

        existing_site_ids: set = set()
        if unique_jeux:
            site_ids = [j["site_id"] for j in unique_jeux]
            coll_res = sb.table("user_collection").select("f95_thread_id").eq("owner_id", owner_id).in_("f95_thread_id", site_ids).execute()
            existing_site_ids = {r["f95_thread_id"] for r in (coll_res.data or [])}

        new_count = sum(1 for j in unique_jeux if j.get("site_id") not in existing_site_ids)
        already_count = len(unique_jeux) - new_count
        result = {"ok": True, "count": len(unique_jeux), "already_in_collection": already_count, "new_count": new_count}
        if full_list:
            result["items"] = unique_jeux
        else:
            sample_new = [j for j in unique_jeux if j.get("site_id") not in existing_site_ids][:8]
            sample_old = [j for j in unique_jeux if j.get("site_id") in existing_site_ids][:2]
            result["sample"] = (sample_new + sample_old)[:10]
        return with_cors(request, web.json_response(result))
    except Exception as error:
        logger.exception("[api] /api/collection/f95-preview erreur: %s", error)
        return with_cors(request, web.json_response({"ok": False, "error": str(error)}, status=500))
