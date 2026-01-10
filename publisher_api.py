import os
import json
import aiohttp
from aiohttp import web

# =========================
# ENV / CONFIG
# =========================
DISCORD_TOKEN = os.getenv("DISCORD_TOKEN", "")
API_KEY = os.getenv("PUBLISHER_API_KEY", "")  # optionnel mais fortement recommandé
FORUM_ID = int(os.getenv("PUBLISH_FORUM_CHANNEL_ID") or os.getenv("FORUM_CHANNEL_ID") or "0")

# CORS: soit "*", soit une liste séparée par virgules (ex: "http://localhost:5500,https://mon-site.com")
ALLOWED_ORIGINS = os.getenv("PUBLISHER_ALLOWED_ORIGINS", "*")

PORT = int(os.getenv("PORT", "8080"))
DISCORD_API_BASE = "https://discord.com/api/v10"

# =========================
# HELPERS
# =========================
def _auth_headers() -> dict:
    if not DISCORD_TOKEN:
        return {}
    return {"Authorization": f"Bot {DISCORD_TOKEN}"}

def _cors_origin_ok(origin: str | None) -> str | None:
    if not origin:
        return None
    if ALLOWED_ORIGINS.strip() == "*":
        return "*"
    allowed = [o.strip() for o in ALLOWED_ORIGINS.split(",") if o.strip()]
    return origin if origin in allowed else None

def _with_cors(request: web.Request, resp: web.StreamResponse) -> web.StreamResponse:
    origin = request.headers.get("Origin")
    allowed_origin = _cors_origin_ok(origin)
    if allowed_origin:
        resp.headers["Access-Control-Allow-Origin"] = allowed_origin
        resp.headers["Vary"] = "Origin"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, X-API-KEY"
        resp.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS, GET"
    return resp

def _split_tags(tags_raw: str) -> list[str]:
    if not tags_raw:
        return []
    return [t.strip() for t in tags_raw.split(",") if t.strip()]

async def _discord_get(session: aiohttp.ClientSession, path: str):
    async with session.get(f"{DISCORD_API_BASE}{path}", headers=_auth_headers()) as r:
        data = await r.json(content_type=None)
        return r.status, data

async def _discord_post_form(session: aiohttp.ClientSession, path: str, form: aiohttp.FormData):
    async with session.post(f"{DISCORD_API_BASE}{path}", headers=_auth_headers(), data=form) as r:
        data = await r.json(content_type=None)
        return r.status, data

async def _resolve_applied_tag_ids(session: aiohttp.ClientSession, forum_id: int, tags_raw: str) -> list[int]:
    wanted = _split_tags(tags_raw)
    if not wanted:
        return []

    status, ch = await _discord_get(session, f"/channels/{forum_id}")
    if status >= 300:
        # impossible de récupérer les tags
        return []

    available = ch.get("available_tags", []) or []
    applied: list[int] = []

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

    # dédoublonnage en gardant l'ordre
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
    applied_tag_ids = await _resolve_applied_tag_ids(session, forum_id, tags_raw)

    payload = {
        "name": title,
        "message": {
            "content": content if content else " "
        }
    }
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

    # Discord renvoie un objet Thread (Channel). On récupère id + guild_id.
    thread_id = data.get("id")
    guild_id = data.get("guild_id")
    return True, {
        "thread_id": thread_id,
        "guild_id": guild_id,
        "thread_url": f"https://discord.com/channels/{guild_id}/{thread_id}" if guild_id and thread_id else None,
    }

# =========================
# HTTP HANDLERS
# =========================
async def health(request: web.Request):
    resp = web.json_response({"ok": True})
    return _with_cors(request, resp)

async def options_handler(request: web.Request):
    resp = web.Response(status=204)
    return _with_cors(request, resp)

async def forum_post(request: web.Request):
    # --- API KEY ---
    if API_KEY:
        got = request.headers.get("X-API-KEY", "")
        if got != API_KEY:
            resp = web.json_response({"ok": False, "error": "unauthorized"}, status=401)
            return _with_cors(request, resp)

    if not DISCORD_TOKEN:
        resp = web.json_response({"ok": False, "error": "missing_DISCORD_TOKEN"}, status=500)
        return _with_cors(request, resp)

    if not FORUM_ID:
        resp = web.json_response({"ok": False, "error": "missing_FORUM_ID"}, status=500)
        return _with_cors(request, resp)

    title = ""
    content = ""
    tags = ""
    image_bytes = None
    image_filename = None
    image_content_type = None

    ctype = request.headers.get("Content-Type", "")

    try:
        if "multipart/form-data" in ctype:
            reader = await request.multipart()
            async for part in reader:
                if part.name == "title":
                    title = (await part.text()).strip()
                elif part.name == "content":
                    content = (await part.text()).strip()
                elif part.name == "tags":
                    tags = (await part.text()).strip()
                elif part.name == "image":
                    if part.filename:
                        image_filename = part.filename
                        image_content_type = part.headers.get("Content-Type")
                        image_bytes = await part.read(decode=False)
        else:
            data = await request.json()
            title = str(data.get("title", "")).strip()
            content = str(data.get("content", "")).strip()
            tags = str(data.get("tags", "")).strip()
            # image non supportée en JSON (utilise multipart)
    except Exception as e:
        resp = web.json_response({"ok": False, "error": "bad_request", "details": str(e)}, status=400)
        return _with_cors(request, resp)

    if not title:
        resp = web.json_response({"ok": False, "error": "missing_title"}, status=400)
        return _with_cors(request, resp)

    async with aiohttp.ClientSession() as session:
        ok, result = await _create_forum_post(
            session=session,
            forum_id=FORUM_ID,   # allowlist: on force cet ID
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

    resp = web.json_response({"ok": True, **result})
    return _with_cors(request, resp)

# =========================
# APP
# =========================
def make_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/health", health)
    app.router.add_route("OPTIONS", "/api/forum-post", options_handler)
    app.router.add_post("/api/forum-post", forum_post)
    return app

if __name__ == "__main__":
    app = make_app()
    web.run_app(app, host="0.0.0.0", port=PORT)
