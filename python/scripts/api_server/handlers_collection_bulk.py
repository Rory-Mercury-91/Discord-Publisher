import asyncio
import datetime
import json
import logging
from zoneinfo import ZoneInfo

import aiohttp
from aiohttp import web

from api_key_auth import _auth_request
from scraper import scrape_f95_game_data
from supabase_client import _get_supabase
from translator import translate_text

from .middleware import with_cors

logger = logging.getLogger("api")


async def collection_import_batch(request):
    is_valid, _, _, _ = await _auth_request(request, "/api/collection/import-batch")
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
    if not owner_id:
        return with_cors(request, web.json_response({"ok": False, "error": "owner_id requis"}, status=400))

    entries = body.get("entries")
    if not isinstance(entries, list) or not entries:
        return with_cors(request, web.json_response({"ok": False, "error": "entries requis (liste non vide)"}, status=400))

    skip_existing = bool(body.get("skip_existing", True))
    overwrite_labels = bool(body.get("overwrite_labels", False))
    overwrite_paths = bool(body.get("overwrite_paths", False))
    overwrite_all = bool(body.get("overwrite_all", False))
    if overwrite_all:
        overwrite_labels = True
        overwrite_paths = True

    total = len(entries)
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

        existing_ids: set[int] = set()
        try:
            res = sb.table("user_collection").select("f95_thread_id, id, labels, executable_paths").eq("owner_id", owner_id).execute()
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
        skipped_count = 0
        error_count = 0
        now = datetime.datetime.now(ZoneInfo("UTC")).isoformat()

        for idx, entry in enumerate(entries, 1):
            if client_disconnected[0]:
                break
            if not await send({"progress": {"current": idx, "total": total}}):
                break

            f95_id = entry.get("f95_thread_id")
            lc_id = entry.get("lewdcorner_thread_id")
            f95_url = (entry.get("f95_url") or "").strip() or None
            title = (entry.get("title") or "").strip() or None
            notes = (entry.get("notes") or "").strip() or None
            labels = entry.get("labels") or []
            raw_paths = entry.get("executable_paths") or []
            game_version = (entry.get("game_version") or "").strip() or None
            game_statut = (entry.get("game_statut") or "").strip() or None
            game_engine = (entry.get("game_engine") or "").strip() or None
            game_developer = (entry.get("game_developer") or "").strip() or None
            couverture_url = (entry.get("couverture_url") or "").strip() or None
            tags_list = entry.get("tags") or []
            game_site = (entry.get("game_site") or "").strip() or None

            has_scraped = any([game_version, game_statut, game_engine, couverture_url, tags_list])
            scraped_data = None
            if has_scraped:
                scraped_data = {
                    "name": title,
                    "version": game_version,
                    "status": game_statut,
                    "type": game_engine,
                    "developer": game_developer,
                    "image": couverture_url,
                    "tags": tags_list,
                    "source": game_site,
                }

            exe_paths = []
            for p in raw_paths:
                if isinstance(p, str) and p.strip():
                    exe_paths.append({"path": p.strip()})
                elif isinstance(p, dict) and p.get("path"):
                    exe_paths.append({"path": p["path"].strip()})

            if not f95_id and not lc_id and not f95_url:
                if not await send({"log": f"⚠️  [{idx}/{total}] Entrée ignorée (aucun identifiant F95/Lewdcorner)"}):
                    break
                error_count += 1
                continue

            effective_thread_id = int(f95_id) if f95_id else (int(lc_id) if lc_id else None)
            if effective_thread_id is None:
                if not await send({"log": f"⚠️  [{idx}/{total}] Entrée ignorée (impossible de résoudre un thread_id)"}):
                    break
                error_count += 1
                continue

            if not f95_url:
                if f95_id:
                    f95_url = f"https://f95zone.to/threads/thread.{f95_id}/"
                elif entry.get("lewdcorner_url"):
                    f95_url = entry["lewdcorner_url"]

            display_name = title or (f"ID {f95_id}" if f95_id else f"Lewdcorner #{lc_id}")

            if effective_thread_id in existing_ids:
                existing_row = existing_map.get(effective_thread_id, {})
                if skip_existing and not overwrite_labels and not overwrite_paths and not overwrite_all:
                    if not await send({"log": f"⏭️  [{idx}/{total}] {display_name} — déjà en collection (ignoré)"}):
                        break
                    skipped_count += 1
                    continue

                if overwrite_all:
                    update_payload: dict = {"title": title, "f95_url": f95_url, "notes": notes or None, "updated_at": now}
                    if labels:
                        update_payload["labels"] = labels
                    if exe_paths:
                        update_payload["executable_paths"] = exe_paths
                    if scraped_data:
                        update_payload["scraped_data"] = scraped_data
                    try:
                        sb.table("user_collection").update(update_payload).eq("id", existing_row["id"]).eq("owner_id", owner_id).execute()
                        details = []
                        if scraped_data:
                            details.append("données")
                        if labels:
                            details.append(f"{len(labels)} label(s)")
                        if exe_paths:
                            details.append(f"{len(exe_paths)} chemin(s)")
                        if not await send({"log": f"🔄 [{idx}/{total}] {display_name} — réimporté ({', '.join(details) or 'titre/notes'})"}):
                            break
                        imported_count += 1
                    except Exception as e:
                        logger.error("[api] import-batch overwrite_all %s: %s", display_name, e)
                        if not await send({"log": f"❌ [{idx}/{total}] {display_name} — erreur: {e}"}):
                            break
                        error_count += 1
                else:
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
                            sb.table("user_collection").update(update_payload).eq("id", existing_row["id"]).eq("owner_id", owner_id).execute()
                            if not await send({"log": f"🔄 [{idx}/{total}] {display_name} — mis à jour ({', '.join(changes)})"}):
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

            try:
                row: dict = {"owner_id": owner_id, "f95_thread_id": effective_thread_id, "f95_url": f95_url, "title": title, "notes": notes or None, "updated_at": now}
                if labels:
                    row["labels"] = labels
                if exe_paths:
                    row["executable_paths"] = exe_paths
                if scraped_data:
                    row["scraped_data"] = scraped_data
                sb.table("user_collection").upsert(row, on_conflict="owner_id,f95_thread_id").execute()
                existing_ids.add(effective_thread_id)
                existing_map[effective_thread_id] = {"id": None}
                details = []
                if labels:
                    details.append(f"{len(labels)} label(s)")
                if exe_paths:
                    details.append(f"{len(exe_paths)} chemin(s)")
                if game_version:
                    details.append(f"v{game_version}")
                detail_str = f" — {', '.join(details)}" if details else ""
                if not await send({"log": f"✅ [{idx}/{total}] {display_name}{detail_str}"}):
                    break
                imported_count += 1
            except Exception as e:
                logger.error("[api] import-batch insert %s: %s", display_name, e)
                if not await send({"log": f"❌ [{idx}/{total}] {display_name} — erreur: {e}"}):
                    break
                error_count += 1

            if idx % 10 == 0 and not client_disconnected[0]:
                await asyncio.sleep(0.1)

        if not client_disconnected[0]:
            await send({
                "log": f"🎉 Import terminé : {imported_count} importé(s), {skipped_count} ignoré(s), {error_count} erreur(s)",
                "status": "completed",
                "imported": imported_count,
                "skipped": skipped_count,
                "errors": error_count,
            })
    except Exception as e:
        logger.error("[api] import-batch erreur globale : %s", e, exc_info=True)
        await send({"error": str(e), "status": "error"})
    finally:
        await response.write_eof()
    return response


async def collection_f95_import(request):
    is_valid, _, _, _ = await _auth_request(request, "/api/collection/f95-import")
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
    skip_existing = bool(body.get("skip_existing", True))
    overwrite_all = bool(body.get("overwrite_all", False))
    selected_site_ids = body.get("selected_site_ids")
    if selected_site_ids is not None and not isinstance(selected_site_ids, list):
        selected_site_ids = None
    try:
        limit = min(int(body.get("limit") or 2000), 5000)
    except (TypeError, ValueError):
        limit = 500

    if not owner_id:
        return with_cors(request, web.json_response({"ok": False, "error": "owner_id requis"}, status=400))
    if not selected_site_ids and not traducteur and not type_jeu and not statut and not search:
        return with_cors(request, web.json_response({"ok": False, "error": "Au moins un filtre ou selected_site_ids requis"}, status=400))

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
        seen: set = set()
        jeux = []
        for j in all_jeux:
            sid = j.get("site_id")
            if sid and sid not in seen:
                seen.add(sid)
                jeux.append(j)

        total = len(jeux)
        if total == 0:
            await send({"log": "ℹ️ Aucun jeu correspondant aux filtres.", "status": "completed", "imported": 0, "skipped": 0, "errors": 0})
            await response.write_eof()
            return response

        await send({"log": f"📊 {total} jeu(x) trouvé(s)", "progress": {"current": 0, "total": total}})

        coll_res = sb.table("user_collection").select("f95_thread_id, id").eq("owner_id", owner_id).execute()
        existing_map: dict = {}
        for row in (coll_res.data or []):
            tid = row.get("f95_thread_id")
            if tid is not None:
                existing_map[int(tid)] = row
        await send({"log": f"ℹ️ {len(existing_map)} jeu(x) déjà en collection"})

        imported_count = 0
        skipped_count = 0
        error_count = 0
        now = datetime.datetime.now(ZoneInfo("UTC")).isoformat()

        for idx, jeu in enumerate(jeux, 1):
            if client_disconnected[0]:
                break
            if not await send({"progress": {"current": idx, "total": total}}):
                break

            site_id = jeu.get("site_id")
            title = (jeu.get("nom_du_jeu") or "").strip() or None
            f95_url = (jeu.get("nom_url") or "").strip() or None
            display_name = title or f"site_id={site_id}"

            scraped_data = {
                "name": title,
                "version": jeu.get("version"),
                "trad_ver": jeu.get("trad_ver"),
                "status": jeu.get("statut"),
                "type": jeu.get("type"),
                "type_de_traduction": jeu.get("type_de_traduction"),
                "traducteur": jeu.get("traducteur"),
                "traducteur_url": jeu.get("traducteur_url"),
                "lien_trad": jeu.get("lien_trad"),
                "image": jeu.get("image"),
                "tags": jeu.get("tags"),
                "synopsis": jeu.get("synopsis_en"),
                "synopsis_fr": jeu.get("synopsis_fr"),
                "source": "f95_jeux",
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
                            "title": title,
                            "f95_url": f95_url,
                            "scraped_data": scraped_data,
                            "updated_at": now,
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
                    "owner_id": owner_id,
                    "f95_thread_id": int(site_id),
                    "f95_url": f95_url,
                    "title": title,
                    "scraped_data": scraped_data,
                    "updated_at": now,
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
                "status": "completed",
                "imported": imported_count,
                "skipped": skipped_count,
                "errors": error_count,
            })

    except Exception as e:
        logger.error("[api] f95-import erreur globale : %s", e, exc_info=True)
        await send({"error": str(e), "status": "error"})
    finally:
        await response.write_eof()
    return response


async def collection_enrich_entries(request):
    is_valid, _, _, _ = await _auth_request(request, "/api/collection/enrich-entries")
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
    scrape_missing = bool(body.get("scrape_missing", False))
    f95_cookies = (body.get("f95_cookies") or "").strip() or None
    try:
        scrape_delay = max(1.0, float(body.get("scrape_delay") or 2.0))
    except (TypeError, ValueError):
        scrape_delay = 2.0

    if not owner_id:
        return with_cors(request, web.json_response({"ok": False, "error": "owner_id requis"}, status=400))

    f95_to_scraped = {
        "version": "version",
        "trad_ver": "trad_ver",
        "statut": "status",
        "type": "type",
        "type_de_traduction": "type_de_traduction",
        "lien_trad": "lien_trad",
        "traducteur": "traducteur",
        "traducteur_url": "traducteur_url",
        "image": "image",
        "tags": "tags",
        "synopsis_en": "synopsis",
        "synopsis_fr": "synopsis_fr",
    }
    fields_to_sync = body.get("fields") or list(f95_to_scraped.keys())

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

        coll_res = sb.table("user_collection").select("id, f95_thread_id, title, f95_url, scraped_data").eq("owner_id", owner_id).execute()
        entries = [r for r in (coll_res.data or []) if r.get("f95_thread_id")]
        if not entries:
            await send({"log": "ℹ️ Aucune entrée à enrichir.", "status": "completed", "updated": 0, "skipped": 0, "scraped": 0})
            await response.write_eof()
            return response

        total = len(entries)
        await send({"log": f"📊 {total} entrée(s) — récupération des données f95_jeux…", "progress": {"current": 0, "total": total}})

        thread_ids = [e["f95_thread_id"] for e in entries]
        f95_map: dict = {}
        batch_size = 500
        for i in range(0, len(thread_ids), batch_size):
            batch = thread_ids[i:i + batch_size]
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
        entries_with_f95 = [e for e in entries if f95_map.get(e["f95_thread_id"])]
        entries_without_f95 = [e for e in entries if not f95_map.get(e["f95_thread_id"])]

        async with aiohttp.ClientSession() as session_translate:
            for idx, entry in enumerate(entries_with_f95, 1):
                if client_disconnected[0]:
                    break
                if not await send({"progress": {"current": idx, "total": total}}):
                    break

                tid = entry["f95_thread_id"]
                f95 = f95_map.get(tid)
                title = entry.get("title") or f"ID {tid}"
                existing_scraped = entry.get("scraped_data") or {}
                if isinstance(existing_scraped, str):
                    try:
                        existing_scraped = json.loads(existing_scraped)
                    except Exception:
                        existing_scraped = {}

                new_scraped = dict(existing_scraped)
                changed_fields = []
                for f95_field, scraped_field in f95_to_scraped.items():
                    if f95_field not in fields_to_sync:
                        continue
                    f95_val = f95.get(f95_field)
                    if f95_val is not None and new_scraped.get(scraped_field) != f95_val:
                        new_scraped[scraped_field] = f95_val
                        changed_fields.append(scraped_field)

                synopsis_en_available = new_scraped.get("synopsis") or new_scraped.get("synopsis_en")
                needs_translation = synopsis_en_available and not new_scraped.get("synopsis_fr") and not f95.get("synopsis_fr")
                if needs_translation:
                    if not await send({"log": f"🌐 [{idx}/{total}] {title} — Traduction EN→FR du synopsis…"}):
                        break
                    try:
                        synopsis_fr = await translate_text(session_translate, synopsis_en_available, "en", "fr")
                        if synopsis_fr:
                            new_scraped["synopsis_fr"] = synopsis_fr
                            changed_fields.append("synopsis_fr")
                    except Exception as te:
                        logger.warning("[api] enrich-entries phase1 translation %s: %s", title, te)

                new_title = f95.get("nom_du_jeu") or entry.get("title")
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
                    sb.table("user_collection").update(update_payload).eq("id", entry["id"]).eq("owner_id", owner_id).execute()
                    fields_str = ", ".join(changed_fields[:4]) + ("…" if len(changed_fields) > 4 else "")
                    if not await send({"log": f"✅ [{idx}/{total}] {new_title or title} — {fields_str or 'titre'}"}):
                        break
                    updated_count += 1
                except Exception as e:
                    logger.error("[api] enrich-entries update %s: %s", title, e)
                    if not await send({"log": f"❌ [{idx}/{total}] {title} — erreur: {e}"}):
                        break

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

                    tid = entry["f95_thread_id"]
                    title = entry.get("title") or f"ID {tid}"
                    f95_url = (entry.get("f95_url") or "").strip() or f"https://f95zone.to/threads/thread.{tid}/"
                    if "f95zone.to" not in f95_url.lower():
                        if not await send({"log": f"⏭️ [{global_idx}/{total}] {title} — URL non-F95 (ignoré)"}):
                            break
                        skipped_count += 1
                        continue

                    if not await send({"log": f"🕷️ [{global_idx}/{total}] {title} — scraping F95…"}):
                        break
                    try:
                        game_data = await scrape_f95_game_data(session, f95_url, cookies=f95_cookies or None)
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

                    existing_synopsis_fr = existing_scraped.get("synopsis_fr")
                    synopsis_en = game_data.get("synopsis")
                    synopsis_fr = existing_synopsis_fr
                    if synopsis_en and not synopsis_fr:
                        try:
                            synopsis_fr = await translate_text(session, synopsis_en, "en", "fr")
                        except Exception as e:
                            logger.warning("[api] enrich-entries translation failed: %s", e)

                    new_scraped = {
                        **existing_scraped,
                        "name": game_data.get("name") or game_data.get("title"),
                        "version": game_data.get("version"),
                        "status": game_data.get("status"),
                        "type": game_data.get("type"),
                        "image": game_data.get("image"),
                        "tags": game_data.get("tags"),
                        "synopsis": synopsis_en,
                        "synopsis_fr": synopsis_fr,
                        "source": "f95zone_scraped",
                    }
                    new_scraped = {k: v for k, v in new_scraped.items() if v is not None}
                    new_title = game_data.get("name") or game_data.get("title") or entry.get("title")
                    scraped_f95_id = game_data.get("id")
                    try:
                        update_payload = {"scraped_data": new_scraped, "updated_at": now}
                        if new_title:
                            update_payload["title"] = new_title
                        if scraped_f95_id:
                            update_payload["f95_url"] = f95_url
                        sb.table("user_collection").update(update_payload).eq("id", entry["id"]).eq("owner_id", owner_id).execute()
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

                    if s_idx < total_scrape and not client_disconnected[0]:
                        await asyncio.sleep(scrape_delay)

        if not client_disconnected[0]:
            parts = [f"{updated_count} mis à jour"]
            if scraped_count:
                parts.append(f"dont {scraped_count} scrappé(s) depuis F95")
            parts.append(f"{skipped_count} ignoré(s)")
            await send({
                "log": f"🎉 Enrichissement terminé : {', '.join(parts)}",
                "status": "completed",
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
