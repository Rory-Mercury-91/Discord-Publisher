import asyncio
import datetime
import json
import logging
from zoneinfo import ZoneInfo

import aiohttp
from aiohttp import web

from api_key_auth import _auth_request
from scraper import _PLACEHOLDER_DATE, scrape_f95_synopsis, scrape_thread_updated_date
from supabase_client import _get_supabase, _norm_nom_url
from translator import translate_text

from .middleware import with_cors

logger = logging.getLogger("api")


async def scrape_enrich(request):
    is_valid, discord_user_id, discord_name, _ = await _auth_request(request, "/api/scrape/enrich")
    if not is_valid:
        return web.json_response({"ok": False, "error": "Invalid API key"}, status=401)

    body_params = {}
    try:
        body = await request.read()
        if body:
            body_params = json.loads(body.decode("utf-8")) or {}
    except Exception:
        body_params = {}

    force = bool(body_params.get("force", False))
    f95_cookies = (body_params.get("f95_cookies") or "").strip() or None
    target_ids_raw = body_params.get("target_ids")
    target_set: set[int] = set()
    if isinstance(target_ids_raw, list):
        for raw_id in target_ids_raw:
            try:
                target_set.add(int(raw_id))
            except (TypeError, ValueError):
                continue

    logger.info(
        "[api] /scrape/enrich lancé par %s (id=%s) force=%s target_ids=%s cookies=%s",
        discord_name or "unknown",
        discord_user_id or "N/A",
        force,
        len(target_set) if target_set else "tous",
        "oui" if f95_cookies else "non",
    )

    sb = _get_supabase()
    if not sb:
        return web.json_response({"ok": False, "error": "Supabase non configuré"}, status=500)

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

    async def send_json(data: dict) -> bool:
        try:
            await response.write((json.dumps(data, ensure_ascii=False) + "\n").encode("utf-8"))
            await response.drain()
            return True
        except Exception as e:
            if any(k in str(e).lower() for k in ("closing transport", "connection reset", "broken pipe")):
                client_disconnected[0] = True
            else:
                logger.warning("[api] Erreur envoi stream enrich : %s", e)
            return False

    try:
        await send_json({"log": "📥 Récupération des jeux depuis f95_jeux..."})
        all_jeux = []
        offset = 0
        page_size = 1000
        while True:
            res = sb.table("f95_jeux").select("id, nom_du_jeu, nom_url, site_id, synopsis_fr").order("id").range(offset, offset + page_size - 1).execute()
            batch = res.data or []
            all_jeux.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size

        if not all_jeux:
            await send_json({"log": "⚠️ Aucun jeu trouvé dans f95_jeux", "status": "completed"})
            await response.write_eof()
            return response

        await send_json({"log": f"📊 {len(all_jeux)} ligne(s) chargée(s) depuis f95_jeux"})

        groups: dict[str, list[dict]] = {}
        for jeu in all_jeux:
            url = (jeu.get("nom_url") or "").strip()
            if not url or "f95zone.to" not in url.lower():
                continue
            norm_url = _norm_nom_url(url)
            if not norm_url:
                continue
            groups.setdefault(norm_url, []).append(jeu)

        to_enrich: list[tuple[str, list[dict]]] = []
        for norm_url, rows in groups.items():
            if target_set and not any(int(r.get("id") or 0) in target_set for r in rows):
                continue
            has_fr = any((r.get("synopsis_fr") or "").strip() for r in rows)
            if not force and not target_set and has_fr:
                continue
            to_enrich.append((norm_url, rows))

        total = len(to_enrich)
        if total == 0:
            await send_json({"log": "ℹ️ Aucun jeu à enrichir.", "status": "completed", "failed_entries": []})
            await response.write_eof()
            return response

        await send_json({
            "log": f"🎮 {total} groupe(s) à enrichir — 1 scraping + 1 traduction par groupe",
            "progress": {"current": 0, "total": total},
        })

        enriched = 0
        failed: list[dict] = []
        now_iso = datetime.datetime.now(ZoneInfo("UTC")).isoformat()

        async with aiohttp.ClientSession() as session:
            for idx, (norm_url, rows) in enumerate(to_enrich, 1):
                if client_disconnected[0]:
                    break
                if not await send_json({"progress": {"current": idx, "total": total}}):
                    break

                source_url = (rows[0].get("nom_url") or "").strip()
                try:
                    synopsis_en = await scrape_f95_synopsis(session, source_url, cookies=f95_cookies)
                    if not synopsis_en:
                        failed.append({"nom_url": source_url, "reason": "synopsis_introuvable"})
                        await send_json({"log": f"⏭️ [{idx}/{total}] {source_url} — synopsis introuvable"})
                        continue

                    synopsis_fr = await translate_text(session, synopsis_en, "en", "fr")
                    if not synopsis_fr:
                        failed.append({"nom_url": source_url, "reason": "traduction_echouee"})
                        await send_json({"log": f"❌ [{idx}/{total}] {source_url} — traduction échouée"})
                        continue

                    for row in rows:
                        row_id = row.get("id")
                        if row_id is None:
                            continue
                        sb.table("f95_jeux").update({
                            "synopsis_en": synopsis_en,
                            "synopsis_fr": synopsis_fr,
                            "updated_at": now_iso,
                        }).eq("id", row_id).execute()

                    enriched += 1
                    await send_json({"log": f"✅ [{idx}/{total}] {source_url} — synopsis EN/FR mis à jour ({len(rows)} ligne(s))"})
                except Exception as e:
                    logger.warning("[api] scrape_enrich group=%s : %s", norm_url, e)
                    failed.append({"nom_url": source_url, "reason": str(e)})
                    await send_json({"log": f"❌ [{idx}/{total}] {source_url} — erreur: {e}"})

        if not client_disconnected[0]:
            await send_json({
                "log": f"🎉 Enrichissement terminé : {enriched}/{total} groupe(s) réussi(s)",
                "status": "completed",
                "enriched": enriched,
                "failed_entries": failed,
            })
    except Exception as e:
        logger.error("[api] Erreur enrichissement : %s", e, exc_info=True)
        await send_json({"error": str(e), "status": "error"})
    finally:
        await response.write_eof()
    return response


async def scrape_missing_dates(request):
    import xml.etree.ElementTree as ET
    import re as _re
    from email.utils import parsedate_to_datetime

    is_valid, _, _, _ = await _auth_request(request, "/api/scrape/missing-dates")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    try:
        body = await request.json() or {}
    except Exception:
        body = {}

    f95_cookies = (body.get("f95_cookies") or "").strip() or None
    try:
        scrape_delay = max(1.0, float(body.get("scrape_delay") or 2.0))
        limit = min(int(body.get("limit") or 5000), 10000)
    except (TypeError, ValueError):
        scrape_delay, limit = 2.0, 5000

    sb = _get_supabase()
    if not sb:
        return with_cors(request, web.json_response({"ok": False, "error": "Supabase non configuré"}, status=500))

    all_f95_rows = []
    offset, page = 0, 1000
    while True:
        res = sb.table("f95_jeux").select("id, site_id, nom_url").is_("f95_date_maj", "null").not_.is_("nom_url", "null").not_.is_("site_id", "null").range(offset, offset + page - 1).execute()
        batch = res.data or []
        all_f95_rows.extend(batch)
        if len(batch) < page:
            break
        offset += page

    groups_f95: dict[str, dict] = {}
    for row in all_f95_rows:
        url = (row.get("nom_url") or "").strip()
        if not url or "f95zone.to" not in url.lower():
            continue
        sid = row.get("site_id")
        if sid is None:
            continue
        if url not in groups_f95:
            groups_f95[url] = {"nom_url": url, "site_ids": [], "source": "f95_jeux"}
        groups_f95[url]["site_ids"].append(int(sid))
    f95_groups = list(groups_f95.values())[:limit]

    res_known = sb.table("f95_jeux").select("site_id").not_.is_("site_id", "null").execute()
    known_f95_ids = {int(r["site_id"]) for r in (res_known.data or []) if r.get("site_id") is not None}

    all_coll_rows = []
    offset_coll = 0
    while True:
        res_c = sb.table("user_collection").select("id, f95_thread_id, f95_url, scraped_data").not_.is_("f95_thread_id", "null").range(offset_coll, offset_coll + page - 1).execute()
        batch_c = res_c.data or []
        all_coll_rows.extend(batch_c)
        if len(batch_c) < page:
            break
        offset_coll += page

    seen_coll_ids: set[int] = set()
    coll_entries = []
    for row in all_coll_rows:
        tid = row.get("f95_thread_id")
        if not tid:
            continue
        tid = int(tid)
        if tid in known_f95_ids or tid in seen_coll_ids:
            continue
        sd = row.get("scraped_data") or {}
        if sd.get("f95_date_maj"):
            continue
        url = (row.get("f95_url") or "").strip() or f"https://f95zone.to/threads/{tid}/"
        if "f95zone.to" not in url.lower():
            continue
        seen_coll_ids.add(tid)
        coll_entries.append({
            "nom_url": url,
            "site_ids": [tid],
            "collection_id": row["id"],
            "scraped_data": sd,
            "source": "user_collection",
        })

    all_entries = f95_groups + coll_entries
    total = len(all_entries)

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
        placeholder_count = 0
        login_blocked = 0
        rss_hits = 0
        now_iso = datetime.datetime.now(ZoneInfo("UTC")).isoformat()

        await send({
            "log": (
                f"🔍 {len(f95_groups)} groupe(s) f95_jeux (dédupliqués depuis {len(all_f95_rows)} lignes) + "
                f"{len(coll_entries)} entrée(s) collection → total {total} à scraper"
            ),
            "progress": {"current": 0, "total": total},
        })

        async with aiohttp.ClientSession() as session:
            await send({"log": "📡 Chargement du flux RSS F95Zone…"})
            rss_date_map: dict[int, str] = {}
            try:
                rss_url = "https://f95zone.to/sam/latest_alpha/latest_data.php?cmd=rss&cat=games&rows=90"
                async with session.get(rss_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=aiohttp.ClientTimeout(total=15)) as rss_resp:
                    if rss_resp.status == 200:
                        xml_text = await rss_resp.text(encoding="utf-8", errors="replace")
                        root = ET.fromstring(xml_text)
                        for item in root.iter("item"):
                            link = ""
                            raw_item = ET.tostring(item, encoding="unicode")
                            m_link = _re.search(r"<link>([^<]+)</link>", raw_item)
                            if m_link:
                                link = m_link.group(1).strip()
                            if not link:
                                continue
                            m_id = _re.search(r"/threads/(?:[^/]*\.)?(\d+)", link)
                            if not m_id:
                                continue
                            tid = int(m_id.group(1))
                            pub_raw = (item.findtext("pubDate") or "").strip()
                            try:
                                pub_date = parsedate_to_datetime(pub_raw).strftime("%Y-%m-%d") if pub_raw else ""
                            except Exception:
                                pub_date = ""
                            if pub_date:
                                rss_date_map[tid] = pub_date
                await send({"log": f"📡 RSS chargé : {len(rss_date_map)} date(s) disponibles"})
            except Exception as e:
                await send({"log": f"⚠️ RSS indisponible ({e}), scraping direct pour tous les jeux"})

            for idx, entry in enumerate(all_entries, 1):
                if client_disconnected[0]:
                    break
                source = entry["source"]
                nom_url = entry["nom_url"]
                site_ids = entry["site_ids"]
                if not await send({"progress": {"current": idx, "total": total}}):
                    break
                src_label = f"f95_jeux×{len(site_ids)}" if source == "f95_jeux" else "collection"
                primary_sid = site_ids[0] if site_ids else None
                rss_date = rss_date_map.get(primary_sid) if primary_sid else None

                if rss_date:
                    date = rss_date
                    rss_hits += 1
                    if not await send({"log": f"📡 [{idx}/{total}] {nom_url.split('/')[-1] or nom_url} ({src_label}) → {date} (RSS)"}):
                        break
                else:
                    date = await scrape_thread_updated_date(session, nom_url, cookies=f95_cookies)
                    if date is None and not f95_cookies:
                        login_blocked += 1
                        if not await send({"log": f"🔐 [{idx}/{total}] {nom_url.split('/')[-1] or nom_url} ({src_label}) → login requis (relancer avec cookies)"}):
                            break
                        if idx < total and not client_disconnected[0]:
                            await asyncio.sleep(scrape_delay)
                        continue
                    icon = "✅" if date else "⬜"
                    if not await send({"log": f"{icon} [{idx}/{total}] {nom_url.split('/')[-1] or nom_url} ({src_label}) → " + (date if date else f"aucune date → placeholder {_PLACEHOLDER_DATE}")}):
                        break

                stored_date = date or _PLACEHOLDER_DATE
                if source == "f95_jeux":
                    try:
                        for sid in site_ids:
                            sb.table("f95_jeux").update({"f95_date_maj": stored_date, "updated_at": now_iso}).eq("site_id", sid).execute()
                        if date:
                            updated_count += 1
                        else:
                            placeholder_count += 1
                    except Exception as e:
                        logger.warning("[api] scrape_missing_dates f95_jeux site_ids=%s : %s", site_ids, e)
                else:
                    try:
                        sd_new = dict(entry.get("scraped_data") or {})
                        sd_new["f95_date_maj"] = stored_date
                        sb.table("user_collection").update({"scraped_data": sd_new, "updated_at": now_iso}).eq("id", entry["collection_id"]).execute()
                        if date:
                            updated_count += 1
                        else:
                            placeholder_count += 1
                    except Exception as e:
                        logger.warning("[api] scrape_missing_dates user_collection id=%s : %s", entry.get("collection_id"), e)
                if not rss_date and idx < total and not client_disconnected[0]:
                    await asyncio.sleep(scrape_delay)

        if not client_disconnected[0]:
            parts = [f"✅ {updated_count} date(s) (dont 📡 {rss_hits} depuis RSS)"]
            if placeholder_count:
                parts.append(f"⬜ {placeholder_count} placeholder(s)")
            if login_blocked:
                parts.append(f"🔐 {login_blocked} bloqué(s) par login")
            await send({
                "log": f"🎉 Terminé sur {total} groupe(s) — {' | '.join(parts)}",
                "status": "completed",
                "updated": updated_count,
                "skipped": placeholder_count,
                "login_blocked": login_blocked,
                "rss_hits": rss_hits,
                "total": total,
            })
    except Exception as e:
        logger.error("[api] scrape_missing_dates erreur : %s", e, exc_info=True)
        await send({"error": str(e), "status": "error"})
    finally:
        await response.write_eof()
    return response
