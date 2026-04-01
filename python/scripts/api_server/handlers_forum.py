import logging

import aiohttp
from aiohttp import web

from api_key_auth import LEGACY_KEY_WARNING, _auth_request
from config import config
from forum_manager import get_forum_available_tags, sync_forum_fixed_tags
from supabase_client import _delete_from_supabase_sync, _get_supabase, _normalize_history_row

from .middleware import with_cors

logger = logging.getLogger("api")


async def configure(request):
    is_valid, _, _, _ = await _auth_request(request, "/api/configure")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    try:
        data = await request.json()
        config.update_from_frontend(data)
        return with_cors(request, web.json_response({
            "ok": True,
            "message": "Configuration mise a jour",
            "configured": config.configured,
        }))
    except Exception as e:
        logger.error("[api] Erreur configuration : %s", e)
        return with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=400))


async def forum_post_delete(request):
    is_valid, _, _, _ = await _auth_request(request, "/api/forum-post/delete")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    try:
        body = await request.json()
    except Exception:
        body = {}

    thread_id = (body.get("threadId") or body.get("thread_id") or "").strip()
    post_id = (body.get("postId") or body.get("post_id") or body.get("id") or "").strip()
    if not thread_id:
        if post_id:
            await __import__("asyncio").get_event_loop().run_in_executor(None, _delete_from_supabase_sync, None, post_id)
        return with_cors(request, web.json_response({"ok": True, "skipped_discord": True}))

    from discord_api import _discord_delete_channel
    from announcements import _send_deletion_announcement
    async with aiohttp.ClientSession() as session:
        deleted, status = await _discord_delete_channel(session, thread_id)
        if not deleted:
            if status == 404:
                await __import__("asyncio").get_event_loop().run_in_executor(None, _delete_from_supabase_sync, thread_id, post_id)
                return with_cors(request, web.json_response(
                    {"ok": False, "error": "Thread introuvable (deja supprime ?)", "not_found": True},
                    status=404,
                ))
            return with_cors(request, web.json_response({"ok": False, "error": "Echec suppression du thread sur Discord"}, status=500))

        await __import__("asyncio").get_event_loop().run_in_executor(None, _delete_from_supabase_sync, thread_id, post_id)
        post_title = (body.get("postTitle") or body.get("title") or "").strip()
        reason = (body.get("reason") or "").strip()
        if post_title:
            discord_url = body.get("discordUrl") or body.get("discord_url") or body.get("thread_url") or ""
            await _send_deletion_announcement(session, post_title, reason, thread_url=discord_url)
    return with_cors(request, web.json_response({"ok": True, "thread_id": thread_id}))


async def get_history(request):
    is_valid, _, _, is_legacy = await _auth_request(request, "/api/history")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    sb = _get_supabase()
    if not sb:
        return with_cors(request, web.json_response({"ok": False, "error": "Supabase non configure"}, status=500))
    res = sb.table("published_posts").select("*").order("updated_at", desc=True).limit(1000).execute()
    posts = [_normalize_history_row(r) for r in (res.data or [])]
    resp_data = {"ok": True, "posts": posts, "count": len(posts)}
    if is_legacy:
        resp_data["legacy_key_warning"] = LEGACY_KEY_WARNING
    return with_cors(request, web.json_response(resp_data))


async def get_instructions(request):
    is_valid, discord_user_id, _, is_legacy = await _auth_request(request, "/api/instructions")
    if not is_valid or is_legacy or not discord_user_id:
        return with_cors(request, web.json_response({"ok": False, "error": "Accès refusé"}, status=403))
    sb = _get_supabase()
    if not sb:
        return with_cors(request, web.json_response({"ok": False, "error": "Supabase non configure"}, status=500))
    try:
        res = sb.table("profiles").select("is_master_admin").eq("discord_id", discord_user_id).limit(1).execute()
        if not res.data or not res.data[0].get("is_master_admin"):
            return with_cors(request, web.json_response({"ok": False, "error": "Droits insuffisants"}, status=403))
        rows_res = sb.table("owner_data").select("owner_type, owner_id, value").eq("data_key", "instructions").execute()
        rows = [{"owner_type": r["owner_type"], "owner_id": r["owner_id"], "value": r["value"]} for r in (rows_res.data or [])]
        return with_cors(request, web.json_response({"ok": True, "instructions": rows, "count": len(rows)}))
    except Exception as e:
        logger.error("[api] Erreur lecture owner_data (instructions): %s", e)
        return with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=500))


async def get_forum_tags(request):
    is_valid, _, _, _ = await _auth_request(request, "/api/forum-tags")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    forum_id = (request.query.get("forum_id") or "").strip()
    if not forum_id:
        return with_cors(request, web.json_response({"ok": False, "error": "forum_id requis"}, status=400))
    async with aiohttp.ClientSession() as session:
        status, tags = await get_forum_available_tags(session, forum_id)
    if status >= 400:
        return with_cors(request, web.json_response({"ok": False, "error": "Salon introuvable ou inaccessible", "status": status}, status=502 if status >= 500 else 400))
    return with_cors(request, web.json_response({"ok": True, "tags": tags, "count": len(tags)}))


async def sync_forum_tags(request):
    is_valid, _, _, _ = await _auth_request(request, "/api/forum-tags/sync")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    try:
        body = await request.json()
    except Exception:
        return with_cors(request, web.json_response({"ok": False, "error": "Body JSON invalide"}, status=400))
    forum_id = (body.get("forum_id") or "").strip()
    if not forum_id:
        return with_cors(request, web.json_response({"ok": False, "error": "forum_id requis"}, status=400))
    async with aiohttp.ClientSession() as session:
        status, err_msg, tags = await sync_forum_fixed_tags(session, forum_id)
    if status >= 400:
        return with_cors(request, web.json_response({"ok": False, "error": err_msg or "Erreur Discord", "status": status}, status=502 if status >= 500 else 400))
    return with_cors(request, web.json_response({"ok": True, "tags": tags, "count": len(tags)}))
