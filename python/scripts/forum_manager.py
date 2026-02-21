"""
Logique metier creation / mise a jour / suppression de posts Discord.
Dependances : config, content_parser, supabase_client, discord_api
Logger       : [publisher]
"""

import re
import json
import time
import base64
import asyncio
import logging
import datetime
import random
from typing import Optional, Tuple, List, Dict
from zoneinfo import ZoneInfo

import aiohttp
import discord

from config import config
from content_parser import (
    _RE_GAME_VERSION_MD, _RE_GAME_VERSION_PLAIN,
    _RE_GAME_LINK_MD, _RE_GAME_LINK_PLAIN,
    _RE_GAME_LINK_JEU_ORIGINAL, _RE_VERSION_IN_THREAD_NAME,
    _normalize_version, _extract_version_from_thread_name,
    _build_thread_title_with_version, _decode_metadata_b64,
)
from supabase_client import (
    _get_supabase, _fetch_post_by_thread_id_sync,
    _parse_saved_inputs, _metadata_from_row,
)
from discord_api import (
    _discord_get, _discord_post_json, _discord_patch_json,
    _discord_delete_message, _discord_list_messages,
    _discord_suppress_embeds, _discord_post_thread_with_attachment,
    _discord_patch_message_with_attachment, _auth_headers,
)

logger = logging.getLogger("publisher")

# Type de message Discord : changement de nom du thread
CHANNEL_NAME_CHANGE_TYPE = 4


# ==================== METADATA EMBED ====================

def _build_metadata_embed(metadata_b64: str) -> dict:
    """
    Embed invisible transportant metadata_b64.
    Decoupage en chunks de 950 chars (limite Discord : 1024/field, 25 fields max).
    """
    CHUNK_SIZE = 950
    chunks = [metadata_b64[i:i + CHUNK_SIZE] for i in range(0, len(metadata_b64), CHUNK_SIZE)]
    if len(chunks) > 25:
        chunks = chunks[:25]
    return {
        "color":  2829617,  # #2b2d31 quasi invisible en dark mode
        "footer": {"text": f"metadata:v1:chunks={len(chunks)}"},
        "fields": [
            {"name": "\u200b", "value": c, "inline": False}
            for c in chunks
        ],
    }


def _embed_preserve_dict(embed: discord.Embed) -> dict:
    """
    Convertit un embed en dict en preservant image et thumbnail
    pour un round-trip sans perte.
    """
    d = embed.to_dict()
    if getattr(embed, "image", None) and getattr(embed.image, "url", None):
        d["image"] = {"url": str(embed.image.url)}
    if getattr(embed, "thumbnail", None) and getattr(embed.thumbnail, "url", None):
        d["thumbnail"] = {"url": str(embed.thumbnail.url)}
    return d


def _message_has_metadata_embed(msg_dict: dict) -> bool:
    """True si le message contient un embed de metadonnees."""
    for e in (msg_dict.get("embeds") or []):
        footer = (e.get("footer") or {}).get("text") or ""
        if footer.startswith("metadata:v1:") or footer.startswith("metadata:"):
            return True
    return False


# ==================== TAGS ====================

async def _resolve_applied_tag_ids(session, forum_id, tags_raw) -> list:
    """Resout les noms/IDs de tags en IDs Discord."""
    wanted = [
        t.strip()
        for t in (tags_raw or "").replace(";", ",").replace("|", ",").split(",")
        if t.strip()
    ]
    if not wanted:
        return []
    status, ch = await _discord_get(session, f"/channels/{forum_id}")
    if status >= 300:
        return []
    available = ch.get("available_tags", [])
    applied = []
    for w in wanted:
        if w.isdigit():
            applied.append(int(w))
        else:
            for t in available:
                if t.get("name", "").lower() == w.lower():
                    applied.append(int(t["id"]))
                    break
    return list(dict.fromkeys(applied))


# ==================== IMAGE ====================

async def _fetch_image_from_url(
    session, url: str
) -> Optional[Tuple[bytes, str, str]]:
    """
    Telecharge une image depuis une URL.
    Retourne (bytes, filename, content_type) ou None.
    """
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            if resp.status >= 400:
                logger.warning("[publisher] Echec telechargement image (status %d) : %s", resp.status, url[:60])
                return None
            data = await resp.read()
            if not data:
                return None
            disp = resp.headers.get("Content-Disposition")
            filename = "image.png"
            if disp and "filename=" in disp:
                part = disp.split("filename=")[-1].strip().strip("\"'")
                if part:
                    filename = part
            else:
                path = url.split("?")[0].strip("/")
                if "/" in path:
                    name = path.split("/")[-1]
                    if "." in name and len(name) < 200:
                        filename = name
            if not any(filename.lower().endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".gif", ".webp")):
                filename = filename + ".png" if "." not in filename else "image.png"
            ctype = resp.headers.get("Content-Type") or "image/png"
            if ";" in ctype:
                ctype = ctype.split(";")[0].strip()
            return (data, filename, ctype)
    except Exception as e:
        logger.warning("[publisher] Exception telechargement image : %s", e)
        return None


def _strip_image_url_from_content(content: str, image_url: str) -> str:
    """Retire l'URL d'image du contenu texte."""
    final = content or " "
    final = re.sub(r"\n\s*" + re.escape(image_url) + r"\s*\n?", "\n", final)
    final = re.sub(r"\n\s*" + re.escape(image_url) + r"\s*$",   "",  final)
    final = re.sub(re.escape(image_url), "", final)
    final = re.sub(r"\n\n\n+", "\n\n", final)
    return final.strip()


# ==================== METADATA MESSAGES ====================

async def _delete_old_metadata_messages(
    session, thread_id: str, keep_message_id: str = None
) -> int:
    """
    Supprime tous les anciens messages de metadonnees dans un thread.
    Garde uniquement keep_message_id si fourni.
    Retourne le nombre de messages supprimes.
    """
    try:
        messages = await _discord_list_messages(session, thread_id, limit=50)
        to_delete = []
        for m in messages:
            msg_id = m.get("id")
            if not msg_id or msg_id == keep_message_id:
                continue
            for e in (m.get("embeds") or []):
                footer = (e.get("footer") or {}).get("text") or ""
                if footer.startswith("metadata:v1:") or footer.startswith("metadata:"):
                    to_delete.append(msg_id)
                    break
        deleted = 0
        for msg_id in to_delete:
            if await _discord_delete_message(session, thread_id, msg_id):
                deleted += 1
                logger.info("[publisher] Message metadata supprime : %s", msg_id)
            else:
                logger.warning("[publisher] Echec suppression metadata : %s", msg_id)
        if deleted:
            logger.info("[publisher] %d ancien(s) message(s) metadata supprime(s)", deleted)
        return deleted
    except Exception as e:
        logger.warning("[publisher] Exception suppression metadata messages : %s", e)
        return 0


# ==================== THREADS ====================

async def _get_thread_parent_id(session, thread_id: str) -> Optional[str]:
    """Recupere le parent_id (salon forum) d'un thread via l'API Discord."""
    status, data = await _discord_get(session, f"/channels/{thread_id}")
    if status >= 300 or not isinstance(data, dict):
        logger.warning("[publisher] Impossible de recuperer le thread %s (status=%d)", thread_id, status)
        return None
    return str(data.get("parent_id") or "")


async def _collect_all_forum_threads(forum: discord.ForumChannel) -> List[discord.Thread]:
    """
    Retourne TOUS les threads d'un forum :
    actifs (forum.threads) + archives publics (forum.archived_threads).
    """
    all_threads: Dict[int, discord.Thread] = {}

    for t in list(getattr(forum, "threads", []) or []):
        all_threads[t.id] = t

    if hasattr(forum, "archived_threads"):
        before = None
        while True:
            batch = []
            try:
                async for t in forum.archived_threads(limit=100, before=before):
                    batch.append(t)
            except TypeError:
                async for t in forum.archived_threads(limit=100):
                    batch.append(t)
            if not batch:
                break
            for t in batch:
                all_threads[t.id] = t
            before = batch[-1].archive_timestamp or batch[-1].created_at
            await asyncio.sleep(0.8)
            if before is None:
                break

    return list(all_threads.values())


# ==================== EXTRACTION DONNEES POST ====================

async def _extract_post_data(thread: discord.Thread) -> Tuple[Optional[str], Optional[str]]:
    """
    Extrait (game_link, game_version) depuis un thread Discord.
    Priorite : Supabase > metadonnees embed > parsing texte.
    """
    loop = asyncio.get_event_loop()
    row = await loop.run_in_executor(None, _fetch_post_by_thread_id_sync, thread.id)
    if row:
        saved = _parse_saved_inputs(row)
        game_version = (saved.get("Game_version") or "").strip()
        version_from_name = _extract_version_from_thread_name(getattr(thread, "name", "") or "")
        if version_from_name:
            game_version = _normalize_version(version_from_name)
            logger.info("[publisher] Version pour %s : %s (depuis nom thread)", thread.name, game_version)
        elif game_version:
            game_version = _normalize_version(game_version)
            logger.info("[publisher] Version pour %s : %s", thread.name, game_version)
        content = (row.get("content") or "")
        game_link = None
        m = _RE_GAME_LINK_MD.search(content) or _RE_GAME_LINK_PLAIN.search(content)
        if m:
            game_link = m.group("url").strip()
        if not game_link:
            m2 = _RE_GAME_LINK_JEU_ORIGINAL.search(content)
            if m2:
                game_link = m2.group("url").strip()
        if game_link or game_version:
            logger.info("[publisher] Donnees post depuis Supabase (thread_id=%s)", thread.id)
            return game_link, game_version

    # Fallback : message Discord
    msg = thread.starter_message
    if not msg:
        try:
            await asyncio.sleep(0.8)
            msg = thread.starter_message or await thread.fetch_message(thread.id)
        except Exception as e:
            logger.warning("[publisher] Impossible de recuperer le message de depart pour %s : %s", thread.name, e)
            return None, None
    if not msg:
        return None, None

    game_link    = None
    game_version = None

    # Metadonnees embed
    if msg.embeds:
        for embed in msg.embeds:
            footer_text = embed.footer.text if embed.footer else ""
            if footer_text and footer_text.startswith("metadata:v1:"):
                chunks = [f.value for f in embed.fields if f.name == "\u200b"]
                if chunks:
                    try:
                        metadata = _decode_metadata_b64("".join(chunks))
                        if metadata:
                            game_version = metadata.get("game_version", "")
                            logger.info("[publisher] Version depuis metadonnees embed : %s", game_version)
                    except Exception as e:
                        logger.warning("[publisher] Erreur decodage metadonnees pour %s : %s", thread.name, e)

    # Parsing texte
    content = (msg.content if msg else "") or ""
    m = _RE_GAME_LINK_MD.search(content) or _RE_GAME_LINK_PLAIN.search(content)
    if m:
        game_link = m.group("url").strip()
    if not game_link:
        m2 = _RE_GAME_LINK_JEU_ORIGINAL.search(content)
        if m2:
            game_link = m2.group("url").strip()
    if not game_version:
        m3 = _RE_GAME_VERSION_MD.search(content) or _RE_GAME_VERSION_PLAIN.search(content)
        if m3:
            game_version = m3.group("ver").strip()
    if game_version:
        game_version = _normalize_version(game_version)

    if game_link:
        logger.info("[publisher] Lien extrait pour %s : %s", thread.name, game_link)
    if game_version:
        logger.info("[publisher] Version pour %s : %s", thread.name, game_version)

    return game_link, game_version


# ==================== CREATION POST ====================

async def _create_forum_post(
    session, forum_id, title, content, tags_raw, images, metadata_b64=None
):
    applied_tag_ids = await _resolve_applied_tag_ids(session, forum_id, tags_raw)

    image_exts = r"(?:jpg|jpeg|png|gif|webp|avif|bmp|svg|ico|tiff|tif)"
    image_url_pattern = re.compile(
        rf"https?://[^\s<>\"']+\.{image_exts}(?:\?[^\s<>\"']*)?", re.IGNORECASE
    )
    image_urls_full = [m.group(0) for m in image_url_pattern.finditer(content or "")]

    final_content = content or " "
    use_attachment = False
    file_bytes, filename, content_type = None, "image.png", "image/png"

    if image_urls_full:
        image_url = image_urls_full[0]
        fetched = await _fetch_image_from_url(session, image_url)
        if fetched:
            file_bytes, filename, content_type = fetched
            final_content = _strip_image_url_from_content(content or " ", image_url)
            use_attachment = True
            logger.info("[publisher] Image en piece jointe : %s", image_url[:60])
        else:
            final_content = _strip_image_url_from_content(content or " ", image_url)
            logger.info("[publisher] Telechargement image echoue, fallback embed : %s", image_url[:60])

    if use_attachment and file_bytes:
        status, data, _ = await _discord_post_thread_with_attachment(
            session, forum_id, title, final_content or " ",
            applied_tag_ids, file_bytes, filename, content_type,
        )
    else:
        message_embeds = []
        if image_urls_full and not use_attachment:
            message_embeds.append({"image": {"url": image_urls_full[0]}})
        payload = {
            "name":    title,
            "message": {"content": final_content or " ", "embeds": message_embeds},
        }
        if applied_tag_ids:
            payload["applied_tags"] = applied_tag_ids
        status, data, _ = await _discord_post_json(session, f"/channels/{forum_id}/threads", payload)

    if status >= 300:
        logger.error("[publisher] Echec creation post (status=%d) : titre=%s forum_id=%s",
                     status, title, forum_id)
        return False, {"status": status, "discord": data}

    thread_id  = data.get("id")
    message_id = (data.get("message") or {}).get("id") or data.get("last_message_id")
    if not message_id and thread_id:
        try:
            messages = await _discord_list_messages(session, str(thread_id), limit=5)
            if messages:
                message_id = (messages[-1] or {}).get("id")
        except Exception as e:
            logger.warning("[publisher] Impossible de recuperer le message de depart (thread %s) : %s", thread_id, e)

    thread_id  = str(thread_id)  if thread_id  is not None else None
    message_id = str(message_id) if message_id is not None else None

    if metadata_b64 and thread_id:
        try:
            if len(metadata_b64) > 25000:
                logger.warning("[publisher] metadata_b64 trop long, message metadata ignore")
            else:
                await _delete_old_metadata_messages(session, str(thread_id))
                meta_payload = {"content": " ", "embeds": [_build_metadata_embed(metadata_b64)]}
                s2, d2, _ = await _discord_post_json(session, f"/channels/{thread_id}/messages", meta_payload)
                if s2 < 300 and isinstance(d2, dict) and d2.get("id"):
                    await _discord_suppress_embeds(session, str(thread_id), str(d2["id"]))
                else:
                    logger.warning("[publisher] Echec creation message metadata (status=%d) : %s", s2, d2)
        except Exception as e:
            logger.warning("[publisher] Exception creation metadata message : %s", e)

    logger.info("[publisher] Post cree avec succes : thread_id=%s titre='%s' forum_id=%s",
                thread_id, title, forum_id)

    return True, {
        "thread_id":  thread_id,
        "message_id": message_id,
        "guild_id":   data.get("guild_id"),
        "thread_url": f"https://discord.com/channels/{data.get('guild_id')}/{thread_id}",
    }


# ==================== MISE A JOUR VERSION ====================

async def _update_post_version(thread: discord.Thread, new_version: str) -> bool:
    """
    Met a jour la version du jeu dans le post Discord (contenu + metadonnees + titre).
    Retourne True si succes.
    """
    try:
        msg = thread.starter_message
        if not msg:
            msg = await thread.fetch_message(thread.id)
        if not msg:
            logger.error("[publisher] Message introuvable pour %s", thread.name)
            return False

        content     = msg.content or ""
        new_content = _RE_GAME_VERSION_MD.sub(f"* **Version du jeu :** `{new_version}`", content)
        if new_content == content:
            new_content = _RE_GAME_VERSION_PLAIN.sub(f"Version du jeu : `{new_version}`", content)

        # Metadonnees : priorite Supabase, sinon embed Discord
        metadata_b64_new = None
        loop = asyncio.get_event_loop()
        row  = await loop.run_in_executor(None, _fetch_post_by_thread_id_sync, thread.id)
        if row:
            metadata_b64_new = _metadata_from_row(row, new_game_version=new_version)
            if metadata_b64_new:
                logger.info("[publisher] Metadonnees construites depuis Supabase pour %s", thread.name)

        if not metadata_b64_new and msg.embeds:
            for embed in msg.embeds:
                footer_text = embed.footer.text if embed.footer else ""
                if footer_text and footer_text.startswith("metadata:v1:"):
                    chunks = [f.value for f in embed.fields if f.name == "\u200b"]
                    if chunks:
                        metadata = _decode_metadata_b64("".join(chunks))
                        if metadata:
                            metadata["game_version"] = new_version
                            metadata["timestamp"]    = int(time.time() * 1000)
                            metadata_json = json.dumps(metadata, ensure_ascii=False)
                            metadata_b64_new = base64.b64encode(metadata_json.encode()).decode()
                    break

        # Embeds non-metadata a conserver sur le message principal
        new_embeds = [
            _embed_preserve_dict(e) for e in msg.embeds
            if not ((e.footer.text if e.footer else "").startswith("metadata:v1:"))
        ]

        try:
            await msg.edit(
                content=new_content,
                embeds=[discord.Embed.from_dict(e) for e in new_embeds],
            )

            # Mettre a jour ou creer le message metadata separe
            if metadata_b64_new and len(metadata_b64_new) <= 25000:
                async with aiohttp.ClientSession() as session:
                    metadata_message = None
                    async for m in thread.history(limit=30):
                        if m.id == msg.id:
                            continue
                        for e in m.embeds:
                            ft = e.footer.text if e.footer else ""
                            if ft and ft.startswith("metadata:v1:"):
                                metadata_message = m
                                break
                        if metadata_message:
                            break

                    meta_embed = [discord.Embed.from_dict(_build_metadata_embed(metadata_b64_new))]
                    if metadata_message:
                        await metadata_message.edit(content=" ", embeds=meta_embed)
                        try:
                            await metadata_message.edit(suppress=True)
                        except Exception as e:
                            logger.warning("[publisher] Impossible de masquer embed metadata : %s", e)
                        logger.info("[publisher] Message metadata mis a jour pour %s", thread.name)
                    else:
                        sent = await thread.send(content=" ", embeds=meta_embed)
                        try:
                            await sent.edit(suppress=True)
                        except Exception as e:
                            logger.warning("[publisher] Impossible de masquer nouvel embed metadata : %s", e)
                        logger.info("[publisher] Message metadata cree pour %s", thread.name)

            # Mise a jour titre du thread
            new_title = _build_thread_title_with_version(thread.name, new_version)
            if new_title != thread.name:
                try:
                    await thread.edit(name=new_title)
                    logger.info("[publisher] Titre mis a jour : %s -> %s", thread.name, new_title)
                except Exception as e:
                    logger.warning("[publisher] Impossible de renommer le thread %s : %s", thread.name, e)

            # Mise a jour Supabase
            if row:
                sb = _get_supabase()
                if sb:
                    try:
                        saved = _parse_saved_inputs(row)
                        saved["Game_version"] = new_version
                        sb.table("published_posts").update({
                            "title":      new_title,
                            "saved_inputs": saved,
                            "updated_at": datetime.datetime.now(ZoneInfo("UTC")).isoformat(),
                        }).eq("id", row["id"]).execute()
                        logger.info("[publisher] published_posts mis a jour sur Supabase pour %s", thread.name)
                    except Exception as e:
                        logger.warning("[publisher] Echec MAJ Supabase published_posts : %s", e)

            logger.info("[publisher] Post mis a jour : %s -> %s", thread.name, new_version)
            return True

        except Exception as e:
            logger.error("[publisher] Erreur modification message pour %s : %s", thread.name, e)
            return False

    except Exception as e:
        logger.error("[publisher] Erreur update_post_version %s : %s", thread.name, e)
        return False


# ==================== RE-ROUTAGE ====================

async def _reroute_post(
    session,
    old_thread_id: str,
    old_message_id: str,
    target_forum_id: str,
    title: str,
    content: str,
    tags_raw: str,
    metadata_b64: Optional[str],
) -> Optional[dict]:
    """
    Re-route un post vers le bon salon forum :
    1. Cree un nouveau thread dans target_forum_id
    2. Supprime l'ancien thread
    Retourne les nouvelles infos ou None en cas d'echec.
    """
    logger.info("[publisher] Re-routage : thread %s -> forum %s", old_thread_id, target_forum_id)

    ok, result = await _create_forum_post(
        session, target_forum_id, title, content, tags_raw, [], metadata_b64
    )
    if not ok:
        logger.error("[publisher] Re-routage : echec creation dans forum %s : %s", target_forum_id, result)
        return None

    new_thread_id  = result.get("thread_id")
    new_message_id = result.get("message_id")
    new_thread_url = result.get("thread_url", "")
    logger.info("[publisher] Re-routage : nouveau thread -> %s", new_thread_id)

    from discord_api import _discord_delete_channel
    deleted, del_status = await _discord_delete_channel(session, old_thread_id)
    if not deleted:
        if del_status == 404:
            logger.info("[publisher] Re-routage : ancien thread deja supprime (%s)", old_thread_id)
        else:
            logger.warning("[publisher] Re-routage : echec suppression ancien thread %s (status=%d)",
                           old_thread_id, del_status)

    return {
        "thread_id":     new_thread_id,
        "message_id":    new_message_id,
        "thread_url":    new_thread_url,
        "rerouted":      True,
        "old_thread_id": old_thread_id,
    }


# ==================== NETTOYAGE MESSAGES VIDES ====================

def _is_message_empty_and_not_metadata(msg_dict: dict) -> bool:
    """True si le message est vide (pas de contenu, piece jointe ni embed utile)."""
    content = (msg_dict.get("content") or "").strip()
    if content:
        return False
    if msg_dict.get("attachments"):
        return False
    embeds = msg_dict.get("embeds") or []
    if not embeds:
        return True
    if _message_has_metadata_embed(msg_dict):
        return False
    return False


def _is_message_thread_name_change(msg_dict: dict) -> bool:
    """True si le message est une notification de changement de titre."""
    if msg_dict.get("type") == CHANNEL_NAME_CHANGE_TYPE:
        return True
    content = (msg_dict.get("content") or "").strip().lower()
    if not content:
        return False
    return (
        "a change le titre" in content
        or "changed the thread name" in content
        or "changed the channel name" in content
    )


async def _clean_empty_messages_in_thread(session, thread_id: str) -> int:
    """
    Supprime dans un thread :
    - les messages vides ;
    - les messages de changement de titre.
    Sauf le message de depart et les messages de metadonnees.
    Retourne le nombre de messages supprimes.
    """
    try:
        messages = await _discord_list_messages(session, thread_id, limit=50)
        if len(messages) <= 1:
            return 0
        starter_id = messages[-1].get("id") if messages else None
        to_delete  = []
        for m in messages[:-1]:
            msg_id = m.get("id")
            if not msg_id or msg_id == starter_id:
                continue
            if _is_message_empty_and_not_metadata(m) or _is_message_thread_name_change(m):
                to_delete.append(msg_id)
        deleted = 0
        for msg_id in to_delete:
            if deleted > 0:
                await asyncio.sleep(0.5 + random.random() * 0.5)
            if await _discord_delete_message(session, thread_id, msg_id):
                deleted += 1
                logger.info("[publisher] Message vide supprime : %s (thread %s)", msg_id, thread_id)
            else:
                logger.warning("[publisher] Echec suppression message : %s", msg_id)
        return deleted
    except Exception as e:
        logger.warning("[publisher] Exception nettoyage messages vides (thread %s) : %s", thread_id, e)
        return 0
