import asyncio
import datetime
import json
import logging
from typing import Optional
from zoneinfo import ZoneInfo

import aiohttp
from aiohttp import web

from announcements import _send_announcement
from api_key_auth import LEGACY_KEY_WARNING, _auth_request
from config import config
from discord_api import (
    _discord_list_messages,
    _discord_patch_json,
    _discord_patch_message_with_attachment,
    _discord_post_json,
    _discord_suppress_embeds,
)
from forum_manager import (
    _build_metadata_embed,
    _create_forum_post,
    _delete_old_metadata_messages,
    _ensure_thread_unarchived,
    _fetch_image_from_url,
    _get_thread_parent_id,
    _reroute_post,
    _resolve_applied_tag_ids,
    _strip_image_url_from_content,
)
from supabase_client import (
    _delete_from_supabase_sync,
    _fetch_post_by_thread_id_sync,
    _get_supabase,
    _normalize_history_row,
)

from .middleware import with_cors

logger = logging.getLogger("api")


def _save_post_to_supabase(result: dict, title: str, content: str, tags: str, forum_id: int, history_payload_raw: Optional[str]):
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

        payload["thread_id"] = result.get("thread_id") or ""
        payload["message_id"] = result.get("message_id") or ""
        payload["discord_url"] = result.get("thread_url") or ""
        payload["forum_id"] = forum_id
        payload.setdefault("title", title)
        payload.setdefault("content", content)
        payload.setdefault("tags", tags)
        payload.setdefault("created_at", now)
        payload["updated_at"] = now
        supabase_payload = {k: v for k, v in payload.items() if k not in ("timestamp", "template")}
        sb.table("published_posts").upsert(supabase_payload, on_conflict="id").execute()
    except Exception as e:
        logger.warning("[api] Echec sauvegarde Supabase : %s", e)


async def forum_post(request):
    is_valid, _, _, is_legacy = await _auth_request(request, "/api/forum-post")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    if not config.FORUM_MY_ID:
        return with_cors(request, web.json_response({"ok": False, "error": "PUBLISHER_FORUM_TRAD_ID non configure"}, status=500))

    title = content = tags = metadata_b64 = ""
    translator_label = state_label = game_version = ""
    received_forum_id = translate_version = announce_image_url = ""
    history_payload_raw = None

    reader = await request.multipart()
    async for part in reader:
        n = part.name
        if n == "title":
            title = (await part.text()).strip()
        elif n == "content":
            content = (await part.text()).strip()
        elif n == "tags":
            tags = (await part.text()).strip()
        elif n == "metadata":
            metadata_b64 = (await part.text()).strip()
        elif n == "translator_label":
            translator_label = (await part.text()).strip()
        elif n == "state_label":
            state_label = (await part.text()).strip()
        elif n == "game_version":
            game_version = (await part.text()).strip()
        elif n == "translate_version":
            translate_version = (await part.text()).strip()
        elif n == "announce_image_url":
            announce_image_url = (await part.text()).strip()
        elif n == "forum_channel_id":
            received_forum_id = (await part.text()).strip()
        elif n == "history_payload":
            history_payload_raw = (await part.text()).strip()

    forum_id = int(received_forum_id) if received_forum_id else config.FORUM_MY_ID
    async with aiohttp.ClientSession() as session:
        ok, result = await _create_forum_post(session, forum_id, title, content, tags, [], metadata_b64)
        if ok and config.PUBLISHER_ANNOUNCE_CHANNEL_ID:
            await _send_announcement(
                session,
                is_update=False,
                title=title,
                thread_url=result.get("thread_url", ""),
                translator_label=translator_label,
                state_label=state_label,
                game_version=game_version,
                translate_version=translate_version,
                image_url=announce_image_url or None,
                forum_id=forum_id,
            )
    if not ok:
        return with_cors(request, web.json_response({"ok": False, "details": result}, status=500))

    _save_post_to_supabase(result, title, content, tags, forum_id, history_payload_raw)
    resp_data = {"ok": True, **result}
    if is_legacy:
        resp_data["legacy_key_warning"] = LEGACY_KEY_WARNING
    return with_cors(request, web.json_response(resp_data))


async def forum_post_update(request):
    is_valid, _, _, is_legacy = await _auth_request(request, "/api/forum-post/update")
    if not is_valid:
        return with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    if not config.FORUM_MY_ID:
        return with_cors(request, web.json_response({"ok": False, "error": "PUBLISHER_FORUM_TRAD_ID non configure"}, status=500))

    title = content = tags = thread_id = message_id = metadata_b64 = ""
    translator_label = state_label = game_version = received_forum_id = ""
    translate_version = announce_image_url = thread_url = ""
    history_payload_raw = None
    silent_update = False

    reader = await request.multipart()
    async for part in reader:
        n = part.name
        if n == "silent_update":
            silent_update = (await part.text()).strip().lower() in ("true", "1", "yes")
        elif n == "title":
            title = (await part.text()).strip()
        elif n == "content":
            content = (await part.text()).strip()
        elif n == "tags":
            tags = (await part.text()).strip()
        elif n == "threadId":
            thread_id = (await part.text()).strip()
        elif n == "messageId":
            message_id = (await part.text()).strip()
        elif n == "metadata":
            metadata_b64 = (await part.text()).strip()
        elif n == "translator_label":
            translator_label = (await part.text()).strip()
        elif n == "state_label":
            state_label = (await part.text()).strip()
        elif n == "game_version":
            game_version = (await part.text()).strip()
        elif n == "translate_version":
            translate_version = (await part.text()).strip()
        elif n == "announce_image_url":
            announce_image_url = (await part.text()).strip()
        elif n == "forum_channel_id":
            received_forum_id = (await part.text()).strip()
        elif n == "thread_url":
            thread_url = (await part.text()).strip()
        elif n == "history_payload":
            history_payload_raw = (await part.text()).strip()

    if not thread_id or not message_id:
        return with_cors(request, web.json_response({"ok": False, "error": "threadId and messageId required"}, status=400))

    target_forum_id = int(received_forum_id) if received_forum_id else config.FORUM_MY_ID
    reroute_info = None

    async with aiohttp.ClientSession() as session:
        current_parent_id = await _get_thread_parent_id(session, thread_id)
        needs_reroute = current_parent_id and received_forum_id and current_parent_id != received_forum_id
        if needs_reroute:
            reroute_info = await _reroute_post(
                session,
                old_thread_id=thread_id,
                old_message_id=message_id,
                target_forum_id=received_forum_id,
                title=title,
                content=content,
                tags_raw=tags,
                metadata_b64=metadata_b64,
            )
            if reroute_info:
                old_thread_id = thread_id
                thread_id = reroute_info["thread_id"]
                message_id = reroute_info["message_id"]
                thread_url = reroute_info["thread_url"]
                await asyncio.get_event_loop().run_in_executor(None, _delete_from_supabase_sync, old_thread_id, None)
            else:
                needs_reroute = False

        if not needs_reroute:
            thread_accessible = await _ensure_thread_unarchived(session, thread_id)
            if not thread_accessible:
                return with_cors(request, web.json_response({"ok": False, "error": "Thread inaccessible ou impossible à désarchiver"}, status=500))

            import re
            image_exts = r"(?:jpg|jpeg|png|gif|webp|avif|bmp|svg|ico|tiff|tif)"
            image_url_pattern = re.compile(rf"https?://[^\s<>\"']+\.{image_exts}(?:\?[^\s<>\"']*)?", re.IGNORECASE)
            image_urls_full = [m.group(0) for m in image_url_pattern.finditer(content or "")]
            final_content = content or " "
            use_attachment = False
            file_bytes, filename, content_type = None, "image.png", "image/png"
            if image_urls_full:
                fetched = await _fetch_image_from_url(session, image_urls_full[0])
                if fetched:
                    file_bytes, filename, content_type = fetched
                    final_content = _strip_image_url_from_content(content or " ", image_urls_full[0])
                    use_attachment = True
                else:
                    final_content = _strip_image_url_from_content(content or " ", image_urls_full[0])

            message_path = f"/channels/{thread_id}/messages/{message_id}"
            if use_attachment and file_bytes:
                status, data = await _discord_patch_message_with_attachment(session, str(thread_id), str(message_id), final_content or " ", file_bytes, filename, content_type)
            else:
                status, data = await _discord_patch_json(session, message_path, {"content": final_content or " ", "embeds": []})
            if status >= 300:
                return with_cors(request, web.json_response({"ok": False, "details": data}, status=500))

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
                        s3, _ = await _discord_patch_json(session, f"/channels/{thread_id}/messages/{metadata_msg_id}", meta_payload)
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

            applied_tag_ids = await _resolve_applied_tag_ids(session, target_forum_id, tags)
            status, data = await _discord_patch_json(session, f"/channels/{thread_id}", {"name": title, "applied_tags": applied_tag_ids})
            if status >= 300:
                return with_cors(request, web.json_response({"ok": False, "details": data}, status=500))

        if config.PUBLISHER_ANNOUNCE_CHANNEL_ID and thread_url and not silent_update:
            await _send_announcement(
                session,
                is_update=True,
                title=title,
                thread_url=thread_url,
                translator_label=translator_label,
                state_label=state_label,
                game_version=game_version,
                translate_version=translate_version,
                image_url=announce_image_url or None,
                forum_id=target_forum_id,
            )

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
            "thread_id": thread_id,
            "message_id": message_id,
            "discord_url": (thread_url or "").strip() or final_payload.get("discord_url", ""),
            "title": title,
            "content": content,
            "tags": tags,
            "updated_at": now,
        })
        final_payload.setdefault("created_at", now)
        final_payload = _normalize_history_row(final_payload)
        sb = _get_supabase()
        if sb:
            try:
                supabase_payload = {k: v for k, v in final_payload.items() if k not in ("timestamp", "template")}
                sb.table("published_posts").upsert(supabase_payload, on_conflict="id").execute()
            except Exception as e:
                logger.warning("[api] Echec sauvegarde Supabase : %s", e)

    resp_data = {
        "ok": True,
        "updated": True,
        "rerouted": bool(reroute_info),
        "thread_id": thread_id,
        "message_id": message_id,
        "thread_url": thread_url,
        "discord_url": thread_url,
        "forum_id": target_forum_id or 0,
        "threadId": thread_id,
        "messageId": message_id,
        "threadUrl": thread_url,
        "discordUrl": thread_url,
        "forumId": target_forum_id or 0,
    }
    if is_legacy:
        resp_data["legacy_key_warning"] = LEGACY_KEY_WARNING
    return with_cors(request, web.json_response(resp_data))
