"""
API Publisher - Version Complète et Corrigée
Gère la publication et mise à jour des posts Discord via API
"""

import os
import sys
import json
import time
import asyncio
import logging
from datetime import datetime
from typing import Optional, Tuple, List, Dict
from pathlib import Path
import aiohttp
from aiohttp import web
from dotenv import load_dotenv

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

class Config:
    def __init__(self):
        self.DISCORD_PUBLISHER_TOKEN = os.getenv("DISCORD_PUBLISHER_TOKEN", "")
        self.PUBLISHER_API_KEY = os.getenv("PUBLISHER_API_KEY", "")
        self.FORUM_MY_ID = int(os.getenv("PUBLISHER_FORUM_MY_ID", "0")) if os.getenv("PUBLISHER_FORUM_MY_ID") else 0
        self.FORUM_PARTNER_ID = int(os.getenv("PUBLISHER_FORUM_PARTNER_ID", "0")) if os.getenv("PUBLISHER_FORUM_PARTNER_ID") else 0
        self.ALLOWED_ORIGINS = os.getenv("PUBLISHER_ALLOWED_ORIGINS", "*")
        self.PORT = int(os.getenv("PORT", "8080"))
        
        # On lit la variable d'env, sinon on utilise ton nouveau proxy par défaut
        self.DISCORD_API_BASE = os.getenv("DISCORD_API_BASE", "https://api-proxy-koyeb.a-fergani91.workers.dev")
        
        self.configured = bool(self.DISCORD_PUBLISHER_TOKEN and self.FORUM_MY_ID and self.FORUM_PARTNER_ID)
    
    def update_from_frontend(self, config_data: dict):
        if 'discordPublisherToken' in config_data and config_data['discordPublisherToken']:
            self.DISCORD_PUBLISHER_TOKEN = config_data['discordPublisherToken']
        if 'publisherForumMyId' in config_data and config_data['publisherForumMyId']:
            self.FORUM_MY_ID = int(config_data['publisherForumMyId'])
        if 'publisherForumPartnerId' in config_data and config_data['publisherForumPartnerId']:
            self.FORUM_PARTNER_ID = int(config_data['publisherForumPartnerId'])
        
        self.configured = bool(self.DISCORD_PUBLISHER_TOKEN and self.FORUM_MY_ID and self.FORUM_PARTNER_ID)
        logger.info(f"✅ Configuration mise à jour (configured: {self.configured})")

config = Config()

# Chemin pour stocker l'historique des publications
HISTORY_FILE = Path("publication_history.json")

class PublicationHistory:
    def __init__(self, history_file: Path = HISTORY_FILE):
        self.history_file = history_file
        self._ensure_file_exists()
    
    def _ensure_file_exists(self):
        if not self.history_file.exists():
            try:
                self.history_file.write_text(json.dumps([], ensure_ascii=False, indent=2), encoding='utf-8')
            except Exception as e:
                logger.warning(f"Impossible de créer le fichier d'historique: {e}")
    
    def add_post(self, post_data: Dict):
        try:
            if self.history_file.exists():
                content = self.history_file.read_text(encoding='utf-8')
                history = json.loads(content) if content.strip() else []
            else:
                history = []
            
            history.insert(0, post_data)
            if len(history) > 1000:
                history = history[:1000]
            
            self.history_file.write_text(
                json.dumps(history, ensure_ascii=False, indent=2),
                encoding='utf-8'
            )
            logger.info(f"✅ Post ajouté à l'historique: {post_data.get('title', 'N/A')}")
        except Exception as e:
            logger.error(f"Erreur lors de l'ajout à l'historique: {e}")
    
    def get_posts(self, limit: Optional[int] = None) -> List[Dict]:
        try:
            if not self.history_file.exists():
                return []
            content = self.history_file.read_text(encoding='utf-8')
            history = json.loads(content) if content.strip() else []
            return history[:limit] if limit else history
        except Exception as e:
            logger.error(f"Erreur lors de la lecture de l'historique: {e}")
            return []

history_manager = PublicationHistory()

class RateLimitTracker:
    def __init__(self):
        self.remaining: Optional[int] = None
        self.limit: Optional[int] = None
        self.reset_at: Optional[float] = None
    
    def update_from_headers(self, headers: dict):
        try:
            if 'X-RateLimit-Remaining' in headers:
                self.remaining = int(headers['X-RateLimit-Remaining'])
            if 'X-RateLimit-Limit' in headers:
                self.limit = int(headers['X-RateLimit-Limit'])
            if 'X-RateLimit-Reset' in headers:
                self.reset_at = float(headers['X-RateLimit-Reset'])
            if self.remaining is not None and self.remaining < 5:
                logger.warning(f"⚠️  Rate limit proche: {self.remaining} requêtes restantes")
        except Exception as e:
            logger.error(f"Erreur headers rate limit: {e}")
    
    def get_info(self) -> dict:
        info = {"remaining": self.remaining, "limit": self.limit, "reset_at": self.reset_at, "reset_in_seconds": None}
        if self.reset_at:
            info["reset_in_seconds"] = int(max(0, self.reset_at - time.time()))
        return info

rate_limiter = RateLimitTracker()

def _auth_headers():
    return {"Authorization": f"Bot {config.DISCORD_PUBLISHER_TOKEN}"}

async def _discord_request(session, method, path, headers=None, json_data=None, data=None):
    url = f"{config.DISCORD_API_BASE}{path}"
    try:
        async with session.request(method, url, headers=headers, json=json_data, data=data) as resp:
            rate_limiter.update_from_headers(resp.headers)
            try:
                data = await resp.json()
            except:
                data = await resp.text()
            return resp.status, data, resp.headers
    except Exception as e:
        logger.error(f"Erreur requête Discord: {e}")
        return 500, {"error": str(e)}, {}

async def _discord_get(session, path):
    status, data, _ = await _discord_request(session, "GET", path, headers=_auth_headers())
    return status, data

async def _discord_patch_json(session, path, payload):
    status, data, _ = await _discord_request(
        session, "PATCH", path,
        headers={**_auth_headers(), "Content-Type": "application/json"},
        json_data=payload
    )
    return status, data

async def _discord_patch_form(session, path, form):
    """Envoie une requête PATCH avec FormData et retourne les 3 valeurs attendues"""
    status, data, headers = await _discord_request(session, "PATCH", path, headers=_auth_headers(), data=form)
    return status, data, headers

async def _discord_post_form(session, path, form):
    return await _discord_request(session, "POST", path, headers=_auth_headers(), data=form)

def _pick_forum_id(template):
    return config.FORUM_PARTNER_ID if template == "partner" else config.FORUM_MY_ID

async def _resolve_applied_tag_ids(session, forum_id, tags_raw):
    wanted = [t.strip() for t in (tags_raw or "").replace(';', ',').replace('|', ',').split(',') if t.strip()]
    if not wanted: return []
    status, ch = await _discord_get(session, f"/channels/{forum_id}")
    if status >= 300: return []
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

async def _create_forum_post(session, forum_id, title, content, tags_raw, images):
    applied_tag_ids = await _resolve_applied_tag_ids(session, forum_id, tags_raw)
    payload = {"name": title, "message": {"content": content or " "}}
    if applied_tag_ids: payload["applied_tags"] = applied_tag_ids
    form = aiohttp.FormData()
    form.add_field("payload_json", json.dumps(payload), content_type="application/json")
    if images:
        for i, img in enumerate(images):
            form.add_field(f"files[{i}]", img["bytes"], filename=img["filename"], content_type=img["content_type"])
    status, data, _ = await _discord_post_form(session, f"/channels/{forum_id}/threads", form)
    if status >= 300: return False, {"status": status, "discord": data}
    return True, {"thread_id": data.get("id"), "message_id": data.get("id"), "guild_id": data.get("guild_id"), "thread_url": f"https://discord.com/channels/{data.get('guild_id')}/{data.get('id')}"}

def _with_cors(request, resp):
    origin = request.headers.get("Origin", "*")
    resp.headers.update({"Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Credentials": "true"})
    return resp

# --- HANDLERS HTTP ---

async def health(request):
    return _with_cors(request, web.json_response({"ok": True, "configured": config.configured, "rate_limit": rate_limiter.get_info()}))

async def options_handler(request):
    return _with_cors(request, web.Response(status=204))

async def configure(request):
    """Handler pour configurer l'API (Requis par main_bots.py)"""
    try:
        data = await request.json()
        config.update_from_frontend(data)
        resp = web.json_response({"ok": True, "message": "Configuration mise à jour", "configured": config.configured})
        return _with_cors(request, resp)
    except Exception as e:
        logger.error(f"Erreur configuration: {e}")
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=400))

async def forum_post(request):
    api_key = request.headers.get("X-API-KEY") or request.query.get("api_key")
    if api_key != config.PUBLISHER_API_KEY: 
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    
    title, content, tags, template, images = "", "", "", "my", []
    reader = await request.multipart()
    async for part in reader:
        if part.name == "title": title = (await part.text()).strip()
        elif part.name == "content": content = (await part.text()).strip()
        elif part.name == "tags": tags = (await part.text()).strip()
        elif part.name == "template": template = (await part.text()).strip()
        elif part.name and part.name.startswith("image_") and part.filename:
            images.append({"bytes": await part.read(decode=False), "filename": part.filename, "content_type": part.headers.get("Content-Type", "image/png")})

    forum_id = _pick_forum_id(template)
    async with aiohttp.ClientSession() as session:
        ok, result = await _create_forum_post(session, forum_id, title, content, tags, images)
    
    if not ok: return _with_cors(request, web.json_response({"ok": False, "details": result}, status=500))
    
    history_manager.add_post({"id": f"post_{int(time.time())}", "timestamp": int(time.time() * 1000), "title": title, "content": content, "tags": tags, "template": template, "thread_id": result["thread_id"], "message_id": result["message_id"], "discord_url": result["thread_url"], "forum_id": forum_id})
    return _with_cors(request, web.json_response({"ok": True, **result}))

async def forum_post_update(request):
    """Handler pour mettre à jour un post existant"""
    api_key = request.headers.get("X-API-KEY") or request.query.get("api_key")
    if api_key != config.PUBLISHER_API_KEY: 
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    title, content, tags, template, images, thread_id, message_id = "", "", "", "my", [], None, None
    reader = await request.multipart()
    async for part in reader:
        if part.name == "title": title = (await part.text()).strip()
        elif part.name == "content": content = (await part.text()).strip()
        elif part.name == "tags": tags = (await part.text()).strip()
        elif part.name == "template": template = (await part.text()).strip()
        elif part.name == "threadId": thread_id = (await part.text()).strip()
        elif part.name == "messageId": message_id = (await part.text()).strip()
        elif part.name and part.name.startswith("image_") and part.filename:
            images.append({"bytes": await part.read(decode=False), "filename": part.filename, "content_type": part.headers.get("Content-Type", "image/png")})

    if not thread_id or not message_id:
        return _with_cors(request, web.json_response({"ok": False, "error": "threadId and messageId required"}, status=400))

    logger.info(f"🔄 Mise à jour post: {title} (thread: {thread_id})")
    
    async with aiohttp.ClientSession() as session:
        message_path = f"/channels/{thread_id}/messages/{message_id}"
        
        # Mettre à jour le contenu du message
        if images:
            form = aiohttp.FormData()
            form.add_field("payload_json", json.dumps({"content": content or " "}))
            for i, img in enumerate(images):
                form.add_field(f"files[{i}]", img["bytes"], filename=img["filename"])
            status, data, _ = await _discord_patch_form(session, message_path, form)
        else:
            status, data = await _discord_patch_json(session, message_path, {"content": content or " "})

        if status >= 300: 
            return _with_cors(request, web.json_response({"ok": False, "details": data}, status=500))

        # Mettre à jour le titre et les tags du thread
        applied_tag_ids = await _resolve_applied_tag_ids(session, _pick_forum_id(template), tags)
        status, data = await _discord_patch_json(session, f"/channels/{thread_id}", {"name": title, "applied_tags": applied_tag_ids})
        
        if status >= 300:
            return _with_cors(request, web.json_response({"ok": False, "details": data}, status=500))

    history_manager.add_post({
        "id": f"post_{int(time.time())}", 
        "timestamp": int(time.time() * 1000), 
        "title": title, 
        "content": content, 
        "tags": tags, 
        "thread_id": thread_id, 
        "updated": True, 
        "message_id": message_id, 
        "template": template
    })
    
    return _with_cors(request, web.json_response({"ok": True, "updated": True, "thread_id": thread_id}))

async def get_history(request):
    api_key = request.headers.get("X-API-KEY") or request.query.get("api_key")
    if api_key != config.PUBLISHER_API_KEY: 
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    posts = history_manager.get_posts()
    return _with_cors(request, web.json_response({"ok": True, "posts": posts, "count": len(posts)}))

# Application web (utilisée si lancée directement)
app = web.Application()
app.add_routes([
    web.get('/api/publisher/health', health),
    web.post('/api/forum-post', forum_post),
    web.post('/api/forum-post/update', forum_post_update),
    web.get('/api/history', get_history),
    web.post('/api/configure', configure),
    web.options('/{tail:.*}', options_handler)
])

if __name__ == '__main__':
    web.run_app(app, port=config.PORT)
