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

from config import config
from api_key_auth import _auth_request, LEGACY_KEY_WARNING
from supabase_client import (
    _get_supabase, _fetch_post_by_thread_id_sync,
    _delete_from_supabase_sync, _normalize_history_row,
    _fetch_all_jeux_sync, _sync_jeux_to_supabase,
    _delete_account_data_sync,
)
from discord_api import rate_limiter
from forum_manager import (
    _create_forum_post, _reroute_post,
    _get_thread_parent_id, _build_metadata_embed,
    _resolve_applied_tag_ids, _delete_old_metadata_messages,
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

    logger.info("[REQUEST] %s | %s | %s | %s %s", client_ip, user_id, key_hint, method, path)

    response = await handler(request)

    if response.status >= 400:
        logger.warning(
            "[HTTP_ERROR] %s | %s | %s | %s %s | STATUS=%d",
            client_ip, user_id, key_hint, method, path, response.status,
        )
    return response


# ==================== HANDLERS ====================

async def get_logs(request):
    """Retourne le fichier de logs complet (protégé par clé API)."""
    # ✅ Utilise le nouveau système d'auth
    is_valid, _, _, _ = await _auth_request(request, "/api/logs")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    logger.info("[get_logs] Lecture du fichier de logs demandée")

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

            logger.info(f"[get_logs] ✅ {line_count} lignes lues")
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

    reader = await request.multipart()
    async for part in reader:
        n = part.name
        if   n == "title":              title               = (await part.text()).strip()
        elif n == "content":            content             = (await part.text()).strip()
        elif n == "tags":               tags                = (await part.text()).strip()
        elif n == "metadata":           metadata_b64        = (await part.text()).strip()
        elif n == "translator_label":   translator_label    = (await part.text()).strip()
        elif n == "state_label":        state_label         = (await part.text()).strip()
        elif n == "game_version":       game_version        = (await part.text()).strip()
        elif n == "translate_version":  translate_version   = (await part.text()).strip()
        elif n == "announce_image_url": announce_image_url  = (await part.text()).strip()
        elif n == "forum_channel_id":   received_forum_id   = (await part.text()).strip()
        elif n == "history_payload":    history_payload_raw = (await part.text()).strip()

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

    reader = await request.multipart()
    async for part in reader:
        n = part.name
        if   n == "silent_update":       silent_update       = (await part.text()).strip().lower() in ("true", "1", "yes")
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
                logger.info("[api] %d jeux depuis Supabase (cache)", len(data))
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

        logger.info("[api] %d jeux depuis API externe (fallback)", len(data) if isinstance(data, list) else "?")
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


# ==================== APP ====================

def make_app() -> web.Application:
    """Cree et configure l'application aiohttp avec toutes les routes."""
    app = web.Application(middlewares=[logging_middleware])

    routes = [
        ("OPTIONS", "/{tail:.*}",            options_handler),
        ("GET",     "/",                      health),
        ("GET",     "/api/status",            health),
        ("POST",    "/api/configure",         configure),
        ("POST",    "/api/forum-post",        forum_post),
        ("POST",    "/api/forum-post/update", forum_post_update),
        ("POST",    "/api/forum-post/delete", forum_post_delete),
        ("GET",     "/api/publisher/health",  health),
        ("GET",     "/api/history",           get_history),
        ("GET",     "/api/jeux",              get_jeux),
        ("POST",    "/api/account/delete",    account_delete),
        ("GET",     "/api/logs",              get_logs),
        # Catch-all en dernier
        ("*",       "/{tail:.*}",             handle_404),
    ]

    for method, path, handler in routes:
        app.router.add_route(method, path, handler)
        logger.info("[api] Route enregistree : %-7s %s", method, path)

    logger.info("[api] %d route(s) enregistree(s)", len(routes))
    return app
