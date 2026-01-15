"""
API Publisher - Serveur 1 : Création de posts Discord
API REST pour créer des posts de forum Discord automatiquement
"""

import os
import sys
import json
import time
import asyncio
import logging
from datetime import datetime
from typing import Optional, Tuple
import aiohttp
from aiohttp import web
from dotenv import load_dotenv

# Fix encoding pour Windows
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

load_dotenv()

# --- LOGGING CONFIGURATION ---
LOG_FILE = "errors.log"
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# --- CONFIGURATION PUBLISHER ---
class Config:
    """Configuration dynamique qui peut être modifiée via API"""
    def __init__(self):
        self.DISCORD_PUBLISHER_TOKEN = os.getenv("DISCORD_PUBLISHER_TOKEN", "")
        self.PUBLISHER_API_KEY = os.getenv("PUBLISHER_API_KEY", "")
        self.FORUM_MY_ID = int(os.getenv("PUBLISHER_FORUM_MY_ID", "0")) if os.getenv("PUBLISHER_FORUM_MY_ID") else 0
        self.FORUM_PARTNER_ID = int(os.getenv("PUBLISHER_FORUM_PARTNER_ID", "0")) if os.getenv("PUBLISHER_FORUM_PARTNER_ID") else 0
        self.ALLOWED_ORIGINS = os.getenv("PUBLISHER_ALLOWED_ORIGINS", "*")
        self.PORT = int(os.getenv("PORT", "8080"))
        self.DISCORD_API_BASE = "https://discord.com/api"
        self.configured = bool(self.DISCORD_PUBLISHER_TOKEN and self.FORUM_MY_ID and self.FORUM_PARTNER_ID)
    
    def update_from_frontend(self, config_data: dict):
        """Met à jour la configuration depuis les données du frontend"""
        if 'discordPublisherToken' in config_data and config_data['discordPublisherToken']:
            self.DISCORD_PUBLISHER_TOKEN = config_data['discordPublisherToken']
        if 'publisherForumMyId' in config_data and config_data['publisherForumMyId']:
            self.FORUM_MY_ID = int(config_data['publisherForumMyId'])
        if 'publisherForumPartnerId' in config_data and config_data['publisherForumPartnerId']:
            self.FORUM_PARTNER_ID = int(config_data['publisherForumPartnerId'])
        
        self.configured = bool(self.DISCORD_PUBLISHER_TOKEN and self.FORUM_MY_ID and self.FORUM_PARTNER_ID)
        logger.info(f"✅ Configuration mise à jour via frontend (configured: {self.configured})")

config = Config()


# --- SUPPRESSION DU SERVEUR FLASK ET DES THREADS ---
# Ce module est maintenant destiné à être intégré dans main_bots.py via aiohttp

# --- RATE LIMITING TRACKING ---
class RateLimitTracker:
    """Suit les limites de taux de l'API Discord"""
    def __init__(self):
        self.remaining: Optional[int] = None
        self.limit: Optional[int] = None
        self.reset_at: Optional[float] = None
        self.last_updated: Optional[float] = None
    
    def update_from_headers(self, headers: dict):
        """Met à jour les informations de rate limit depuis les headers de réponse Discord"""
        try:
            if 'X-RateLimit-Remaining' in headers:
                self.remaining = int(headers['X-RateLimit-Remaining'])
            if 'X-RateLimit-Limit' in headers:
                self.limit = int(headers['X-RateLimit-Limit'])
            if 'X-RateLimit-Reset' in headers:
                self.reset_at = float(headers['X-RateLimit-Reset'])
            self.last_updated = time.time()
            if self.remaining is not None and self.remaining < 5:
                logger.warning(f"⚠️  Rate limit proche: {self.remaining} requêtes restantes")
        except (ValueError, KeyError) as e:
            logger.error(f"Erreur lors de la lecture des headers de rate limit: {e}")
    
    def get_info(self) -> dict:
        info = {
            "remaining": self.remaining,
            "limit": self.limit,
            "reset_at": self.reset_at,
            "reset_in_seconds": None
        }
        if self.reset_at:
            reset_in = max(0, self.reset_at - time.time())
            info["reset_in_seconds"] = int(reset_in)
        return info
    
    def should_wait(self) -> Tuple[bool, float]:
        if self.remaining is not None and self.remaining == 0 and self.reset_at:
            wait_time = max(0, self.reset_at - time.time())
            if wait_time > 0:
                return True, wait_time
        return False, 0.0

rate_limiter = RateLimitTracker()

# --- UTILS ---
def _auth_headers():
    """Retourne les headers d'authentification Discord"""
    return {"Authorization": f"Bot {config.DISCORD_PUBLISHER_TOKEN}"}

async def _discord_request_with_retry(session, method, path, headers=None, json_data=None, data=None):
    """Effectue une requête Discord avec retry"""
    url = f"{config.DISCORD_API_BASE}{path}"
    try:
        async with session.request(method, url, headers=headers, json=json_data, data=data) as resp:
            rate_limiter.update_from_headers(resp.headers)
            try:
                data = await resp.json()
            except Exception:
                data = await resp.text()
            return resp.status, data, resp.headers
    except Exception as e:
        logger.error(f"Erreur requête Discord: {e}")
        return 500, {"error": str(e)}, {}

async def _discord_get(session: aiohttp.ClientSession, path: str):
    """GET sur l'API Discord"""
    status, data, _ = await _discord_request_with_retry(session, "GET", path, headers=_auth_headers())
    return status, data

async def _discord_patch_json(session: aiohttp.ClientSession, path: str, payload: dict):
    """PATCH JSON sur l'API Discord"""
    status, data, _ = await _discord_request_with_retry(
        session, "PATCH", path,
        headers={**_auth_headers(), "Content-Type": "application/json"},
        json_data=payload
    )
    return status, data

async def _discord_patch_form(session: aiohttp.ClientSession, path: str, form: aiohttp.FormData):
    """PATCH FormData sur l'API Discord"""
    status, data, _ = await _discord_request_with_retry(
        session, "PATCH", path, headers=_auth_headers(), data=form
    )
    return status, data

async def _discord_post_form(session, path, form):
    """POST FormData sur l'API Discord"""
    return await _discord_request_with_retry(session, "POST", path, headers=_auth_headers(), data=form)

def _split_tags(tags_raw):
    """Découpe une chaîne de tags séparés par virgule ou espace"""
    if not tags_raw:
        return []
    return [t.strip() for t in tags_raw.replace(';', ',').replace('|', ',').split(',') if t.strip()]

def _with_cors(request, resp):
    """Ajoute les headers CORS à la réponse aiohttp"""
    origin = request.headers.get("Origin", "*")
    resp.headers["Access-Control-Allow-Origin"] = config.ALLOWED_ORIGINS if config.ALLOWED_ORIGINS != '*' else origin
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,PATCH,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "*"
    resp.headers["Access-Control-Allow-Credentials"] = "true"
    return resp

def _pick_forum_id(template):
    """Choisit l'ID du forum selon le template ('my' ou 'partner')"""
    if template == "partner":
        return config.FORUM_PARTNER_ID
    return config.FORUM_MY_ID

async def _resolve_applied_tag_ids(session: aiohttp.ClientSession, forum_id: int, tags_raw: str) -> list:
    """Résout les tags demandés en IDs Discord valides"""
    wanted = _split_tags(tags_raw)
    if not wanted:
        return []

    status, ch = await _discord_get(session, f"/channels/{forum_id}")
    if status >= 300:
        return []

    available = ch.get("available_tags", []) or []
    applied = []

    for w in wanted:
        if w.isdigit():
            wid = int(w)
            if any(int(t.get("id", 0)) == wid for t in available):
                applied.append(wid)
            continue

        wl = w.lower()
        for t in available:
            name = (t.get("name") or "").lower()
            if name == wl:
                try:
                    applied.append(int(t["id"]))
                except Exception:
                    pass
                break

    seen = set()
    uniq = []
    for tid in applied:
        if tid not in seen:
            seen.add(tid)
            uniq.append(tid)
    return uniq

async def _create_forum_post(session, forum_id, title, content, tags_raw, images):
    """Crée un nouveau post de forum sur Discord"""
    applied_tag_ids = await _resolve_applied_tag_ids(session, forum_id, tags_raw)

    payload = {"name": title, "message": {"content": content if content else " "}}
    if applied_tag_ids:
        payload["applied_tags"] = applied_tag_ids

    form = aiohttp.FormData()
    form.add_field("payload_json", json.dumps(payload), content_type="application/json")

    if images:
        for i, img in enumerate(images):
            if img.get("bytes") and img.get("filename"):
                form.add_field(
                    f"files[{i}]",
                    img["bytes"],
                    filename=img["filename"],
                    content_type=img.get("content_type") or "application/octet-stream",
                )

    status, data = await _discord_post_form(session, f"/channels/{forum_id}/threads", form)

    if status >= 300:
        return False, {"status": status, "discord": data}

    thread_id = data.get("id")
    guild_id = data.get("guild_id")
    return True, {
        "thread_id": thread_id,
        "guild_id": guild_id,
        "thread_url": f"https://discord.com/channels/{guild_id}/{thread_id}" if guild_id and thread_id else None,
    }

async def _update_forum_post(session, thread_id, message_id, forum_id, title, content, tags_raw, images):
    """Met à jour un post de forum existant sur Discord"""
    if title is not None or tags_raw is not None:
        payload = {}
        if title:
            payload["name"] = title
        if tags_raw is not None:
            applied_tag_ids = await _resolve_applied_tag_ids(session, forum_id, tags_raw)
            payload["applied_tags"] = applied_tag_ids
        
        if payload:
            status, data = await _discord_patch_json(session, f"/channels/{thread_id}", payload)
            if status >= 300:
                return False, {"status": status, "discord": data, "step": "update_thread"}
    
    if content is not None or images:
        if images:
            payload = {}
            if content is not None:
                payload["content"] = content if content else " "
            
            form = aiohttp.FormData()
            form.add_field("payload_json", json.dumps(payload), content_type="application/json")
            
            for i, img in enumerate(images):
                if img.get("bytes") and img.get("filename"):
                    form.add_field(
                        f"files[{i}]",
                        img["bytes"],
                        filename=img["filename"],
                        content_type=img.get("content_type") or "application/octet-stream",
                    )
            
            status, data = await _discord_patch_form(session, f"/channels/{thread_id}/messages/{message_id}", form)
        else:
            payload = {"content": content if content else " "}
            status, data = await _discord_patch_json(session, f"/channels/{thread_id}/messages/{message_id}", payload)
        
        if status >= 300:
            return False, {"status": status, "discord": data, "step": "update_message"}
    
    status, thread_data = await _discord_get(session, f"/channels/{thread_id}")
    guild_id = thread_data.get("guild_id") if status < 300 else None
    
    return True, {
        "thread_id": thread_id,
        "message_id": message_id,
        "guild_id": guild_id,
        "thread_url": f"https://discord.com/channels/{guild_id}/{thread_id}" if guild_id and thread_id else None,
    }

# --- HANDLERS HTTP ---
async def health(request: web.Request):
    """Endpoint de santé avec informations de rate limit"""
    resp = web.json_response({
        "ok": True,
        "service": "discord-publisher-api",
        "rate_limit": rate_limiter.get_info()
    })
    return _with_cors(request, resp)

async def options_handler(request: web.Request):
    """Handler pour les requêtes OPTIONS (CORS preflight)"""
    resp = web.Response(status=204)
    return _with_cors(request, resp)

async def configure(request: web.Request):
    """Endpoint POST /api/configure"""
    try:
        data = await request.json()
        config.update_from_frontend(data)
        
        resp = web.json_response({
            "ok": True,
            "message": "Configuration mise à jour",
            "configured": config.configured
        })
        return _with_cors(request, resp)
    except Exception as e:
        logger.error(f"Erreur lors de la configuration: {e}")
        resp = web.json_response({
            "ok": False,
            "error": "configuration_failed",
            "details": str(e)
        }, status=400)
        return _with_cors(request, resp)

async def forum_post(request: web.Request):
    """Endpoint principal : POST /api/forum-post"""

    # --- Vérification de la clé API ---
    api_key = request.headers.get("X-API-KEY") or request.query.get("api_key")
    if not api_key or api_key != config.PUBLISHER_API_KEY:
        resp = web.json_response({
            "ok": False,
            "error": "unauthorized",
            "message": "Clé API invalide ou manquante."
        }, status=401)
        return _with_cors(request, resp)

    if not config.configured:
        resp = web.json_response({
            "ok": False, 
            "error": "not_configured",
            "message": "API non configurée."
        }, status=503)
        return _with_cors(request, resp)

    title = ""
    content = ""
    tags = ""
    template = "my"
    images = []
    main_image_index = 0

    ctype = request.headers.get("Content-Type", "")

    try:
        if "multipart/form-data" not in ctype:
            resp = web.json_response({"ok": False, "error": "expected_multipart_form_data"}, status=400)
            return _with_cors(request, resp)

        reader = await request.multipart()
        async for part in reader:
            if part.name == "title":
                title = (await part.text()).strip()
            elif part.name == "content":
                content = (await part.text()).strip()
            elif part.name == "tags":
                tags = (await part.text()).strip()
            elif part.name == "template":
                template = (await part.text()).strip()
            elif part.name == "main_image_index":
                try:
                    main_image_index = int(await part.text())
                except:
                    pass
            elif part.name and part.name.startswith("image_"):
                if part.filename:
                    images.append({
                        "bytes": await part.read(decode=False),
                        "filename": part.filename,
                        "content_type": part.headers.get("Content-Type"),
                    })
            elif part.name == "image":
                if part.filename:
                    images.append({
                        "bytes": await part.read(decode=False),
                        "filename": part.filename,
                        "content_type": part.headers.get("Content-Type"),
                    })

    except Exception as e:
        resp = web.json_response({"ok": False, "error": "bad_request", "details": str(e)}, status=400)
        return _with_cors(request, resp)

    if images and 0 <= main_image_index < len(images):
        main_img = images.pop(main_image_index)
        images.insert(0, main_img)

    if not title:
        resp = web.json_response({"ok": False, "error": "missing_title"}, status=400)
        return _with_cors(request, resp)

    forum_id = _pick_forum_id(template)

    async with aiohttp.ClientSession() as session:
        ok, result = await _create_forum_post(
            session=session,
            forum_id=forum_id,
            title=title,
            content=content,
            tags_raw=tags,
            images=images if images else None,
        )

    if not ok:
        resp = web.json_response({"ok": False, "error": "discord_error", "details": result}, status=500)
        return _with_cors(request, resp)

    resp = web.json_response({
        "ok": True,
        "template": template,
        "forum_id": forum_id,
        "rate_limit": rate_limiter.get_info(),
        **result
    })
    return _with_cors(request, resp)

async def forum_post_update(request: web.Request):
    """Endpoint PATCH /api/forum-post/{thread_id}/{message_id}"""
    thread_id = request.match_info.get("thread_id", "")
    message_id = request.match_info.get("message_id", "")
    
    if not thread_id or not message_id:
        resp = web.json_response({"ok": False, "error": "missing_thread_or_message_id"}, status=400)
        return _with_cors(request, resp)

    title = None
    content = None
    tags = None
    template = "my"
    images = []
    main_image_index = 0

    ctype = request.headers.get("Content-Type", "")

    try:
        if "multipart/form-data" not in ctype:
            resp = web.json_response({"ok": False, "error": "expected_multipart_form_data"}, status=400)
            return _with_cors(request, resp)

        reader = await request.multipart()
        async for part in reader:
            if part.name == "title":
                title = (await part.text()).strip()
            elif part.name == "content":
                content = (await part.text()).strip()
            elif part.name == "tags":
                tags = (await part.text()).strip()
            elif part.name == "template":
                template = (await part.text()).strip()
            elif part.name == "main_image_index":
                try:
                    main_image_index = int(await part.text())
                except:
                    pass
            elif part.name and part.name.startswith("image_"):
                if part.filename:
                    images.append({
                        "bytes": await part.read(decode=False),
                        "filename": part.filename,
                        "content_type": part.headers.get("Content-Type"),
                    })
            elif part.name == "image":
                if part.filename:
                    images.append({
                        "bytes": await part.read(decode=False),
                        "filename": part.filename,
                        "content_type": part.headers.get("Content-Type"),
                    })

    except Exception as e:
        resp = web.json_response({"ok": False, "error": "bad_request", "details": str(e)}, status=400)
        return _with_cors(request, resp)

    if images and 0 <= main_image_index < len(images):
        main_img = images.pop(main_image_index)
        images.insert(0, main_img)

    forum_id = _pick_forum_id(template)

    async with aiohttp.ClientSession() as session:
        ok, result = await _update_forum_post(
            session=session,
            thread_id=thread_id,
            message_id=message_id,
            forum_id=forum_id,
            title=title,
            content=content,
            tags_raw=tags,
            images=images if images else None,
        )

    if not ok:
        resp = web.json_response({"ok": False, "error": "discord_error", "details": result}, status=500)
        return _with_cors(request, resp)

    resp = web.json_response({
        "ok": True,
        "template": template,
        "forum_id": forum_id,
        "rate_limit": rate_limiter.get_info(),
        **result
    })
    return _with_cors(request, resp)


# --- EXPORT DES HANDLERS POUR INTEGRATION ---
# Utilise ces fonctions dans main_bots.py pour ajouter les routes à ton app aiohttp
# Exemple : app.router.add_post("/api/forum-post", forum_post)


# --- SUPPRESSION DU BLOC __main__ ---
# Ce module n'est plus exécutable seul, il doit être intégré dans main_bots.py