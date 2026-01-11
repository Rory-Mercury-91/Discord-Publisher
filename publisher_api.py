"""
API Publisher - Serveur 1 : Création de posts Discord
API REST pour créer des posts de forum Discord automatiquement
"""
import os
import json
import aiohttp
from aiohttp import web
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION PUBLISHER ---
DISCORD_PUBLISHER_TOKEN = os.getenv("DISCORD_PUBLISHER_TOKEN", "")
API_KEY = os.getenv("PUBLISHER_API_KEY", "")
FORUM_MY_ID = int(os.getenv("PUBLISHER_FORUM_MY_ID", "0"))
FORUM_PARTNER_ID = int(os.getenv("PUBLISHER_FORUM_PARTNER_ID", "0"))
ALLOWED_ORIGINS = os.getenv("PUBLISHER_ALLOWED_ORIGINS", "*")
PORT = int(os.getenv("PORT", "8080"))
DISCORD_API_BASE = "https://discord.com/api"

# Vérifications
if not DISCORD_PUBLISHER_TOKEN:
    raise ValueError("❌ DISCORD_PUBLISHER_TOKEN manquant")
if not API_KEY:
    raise ValueError("❌ PUBLISHER_API_KEY manquant")
if not FORUM_MY_ID:
    raise ValueError("❌ PUBLISHER_FORUM_MY_ID manquant")
if not FORUM_PARTNER_ID:
    raise ValueError("❌ PUBLISHER_FORUM_PARTNER_ID manquant")


def _auth_headers() -> dict:
    """Retourne les headers d'authentification Discord"""
    return {"Authorization": f"Bot {DISCORD_PUBLISHER_TOKEN}"}


def _cors_origin_ok(origin: str | None) -> str | None:
    """Vérifie si l'origine est autorisée pour CORS"""
    if not origin:
        return None
    if ALLOWED_ORIGINS.strip() == "*":
        return "*"
    allowed = [o.strip() for o in ALLOWED_ORIGINS.split(",") if o.strip()]
    return origin if origin in allowed else None


def _with_cors(request: web.Request, resp: web.StreamResponse) -> web.StreamResponse:
    """Ajoute les headers CORS à la réponse"""
    origin = request.headers.get("Origin")
    allowed_origin = _cors_origin_ok(origin)
    if allowed_origin:
        resp.headers["Access-Control-Allow-Origin"] = allowed_origin
        resp.headers["Vary"] = "Origin"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, X-API-KEY"
        resp.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS, GET"
    return resp


def _split_tags(tags_raw: str) -> list[str]:
    """Sépare les tags par virgule"""
    if not tags_raw:
        return []
    return [t.strip() for t in tags_raw.split(",") if t.strip()]


def _pick_forum_id(template_value: str) -> int:
    """Choisit le bon forum selon le template"""
    t = (template_value or "").strip().lower()
    if t in {"partner", "partenaire", "partenaires"}:
        return FORUM_PARTNER_ID
    return FORUM_MY_ID


async def _discord_get(session: aiohttp.ClientSession, path: str):
    """Effectue une requête GET vers l'API Discord"""
    async with session.get(f"{DISCORD_API_BASE}{path}", headers=_auth_headers()) as r:
        data = await r.json(content_type=None)
        return r.status, data


async def _discord_post_form(session: aiohttp.ClientSession, path: str, form: aiohttp.FormData):
    """Effectue une requête POST vers l'API Discord"""
    async with session.post(f"{DISCORD_API_BASE}{path}", headers=_auth_headers(), data=form) as r:
        data = await r.json(content_type=None)
        return r.status, data


async def _resolve_applied_tag_ids(session: aiohttp.ClientSession, forum_id: int, tags_raw: str) -> list[int]:
    """
    Résout les tags demandés en IDs Discord valides
    Accepte soit des IDs numériques, soit des noms de tags
    """
    wanted = _split_tags(tags_raw)
    if not wanted:
        return []

    status, ch = await _discord_get(session, f"/channels/{forum_id}")
    if status >= 300:
        return []

    available = ch.get("available_tags", []) or []
    applied: list[int] = []

    for w in wanted:
        # Si c'est déjà un ID numérique
        if w.isdigit():
            wid = int(w)
            if any(int(t.get("id", 0)) == wid for t in available):
                applied.append(wid)
            continue

        # Sinon, recherche par nom (insensible à la casse)
        wl = w.lower()
        for t in available:
            name = (t.get("name") or "").lower()
            if name == wl:
                try:
                    applied.append(int(t["id"]))
                except Exception:
                    pass
                break

    # Dédupliquer tout en préservant l'ordre
    seen = set()
    uniq = []
    for tid in applied:
        if tid not in seen:
            seen.add(tid)
            uniq.append(tid)
    return uniq


async def _create_forum_post(
    session: aiohttp.ClientSession,
    forum_id: int,
    title: str,
    content: str,
    tags_raw: str,
    image_bytes: bytes | None,
    image_filename: str | None,
    image_content_type: str | None,
):
    """
    Crée un nouveau post de forum sur Discord
    Retourne : (success, result_dict)
    """
    applied_tag_ids = await _resolve_applied_tag_ids(session, forum_id, tags_raw)

    payload = {"name": title, "message": {"content": content if content else " "}}
    if applied_tag_ids:
        payload["applied_tags"] = applied_tag_ids

    form = aiohttp.FormData()
    form.add_field("payload_json", json.dumps(payload), content_type="application/json")

    if image_bytes and image_filename:
        form.add_field(
            "files[0]",
            image_bytes,
            filename=image_filename,
            content_type=image_content_type or "application/octet-stream",
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


# --- HANDLERS HTTP ---

async def health(request: web.Request):
    """Endpoint de santé"""
    resp = web.json_response({"ok": True, "service": "discord-publisher-api"})
    return _with_cors(request, resp)


async def options_handler(request: web.Request):
    """Handler pour les requêtes OPTIONS (CORS preflight)"""
    resp = web.Response(status=204)
    return _with_cors(request, resp)


async def forum_post(request: web.Request):
    """
    Endpoint principal : POST /api/forum-post
    Crée un post de forum Discord avec titre, contenu, tags et image optionnelle
    """
    # Vérification API KEY
    if API_KEY:
        got = request.headers.get("X-API-KEY", "")
        if got != API_KEY:
            resp = web.json_response({"ok": False, "error": "unauthorized"}, status=401)
            return _with_cors(request, resp)

    # Vérification configuration
    if not DISCORD_PUBLISHER_TOKEN:
        resp = web.json_response({"ok": False, "error": "missing_DISCORD_PUBLISHER_TOKEN"}, status=500)
        return _with_cors(request, resp)

    if not FORUM_MY_ID or not FORUM_PARTNER_ID:
        resp = web.json_response({"ok": False, "error": "missing_PUBLISHER_FORUM_IDS"}, status=500)
        return _with_cors(request, resp)

    # Variables
    title = ""
    content = ""
    tags = ""
    template = "my"
    image_bytes = None
    image_filename = None
    image_content_type = None

    ctype = request.headers.get("Content-Type", "")

    # Parsing multipart/form-data
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
            elif part.name == "image":
                if part.filename:
                    image_filename = part.filename
                    image_content_type = part.headers.get("Content-Type")
                    image_bytes = await part.read(decode=False)

    except Exception as e:
        resp = web.json_response({"ok": False, "error": "bad_request", "details": str(e)}, status=400)
        return _with_cors(request, resp)

    # Validation
    if not title:
        resp = web.json_response({"ok": False, "error": "missing_title"}, status=400)
        return _with_cors(request, resp)

    # Choix du forum
    forum_id = _pick_forum_id(template)

    # Création du post
    async with aiohttp.ClientSession() as session:
        ok, result = await _create_forum_post(
            session=session,
            forum_id=forum_id,
            title=title,
            content=content,
            tags_raw=tags,
            image_bytes=image_bytes,
            image_filename=image_filename,
            image_content_type=image_content_type,
        )

    if not ok:
        resp = web.json_response({"ok": False, "error": "discord_error", "details": result}, status=500)
        return _with_cors(request, resp)

    # Succès
    resp = web.json_response({
        "ok": True,
        "template": template,
        "forum_id": forum_id,
        **result
    })
    return _with_cors(request, resp)


def make_app() -> web.Application:
    """Crée l'application web aiohttp"""
    app = web.Application()
    app.router.add_get("/health", health)
    app.router.add_route("OPTIONS", "/api/forum-post", options_handler)
    app.router.add_post("/api/forum-post", forum_post)
    return app


if __name__ == "__main__":
    print(f"🚀 Démarrage Publisher API sur le port {PORT}")
    print(f"📊 Forum 'Mes traductions' : {FORUM_MY_ID}")
    print(f"📊 Forum 'Partenaire' : {FORUM_PARTNER_ID}")
    print(f"🔒 CORS autorisé : {ALLOWED_ORIGINS}")
    
    app = make_app()
    web.run_app(app, host="0.0.0.0", port=PORT)