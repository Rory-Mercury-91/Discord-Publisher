import logging

from aiohttp import web

from config import config

logger = logging.getLogger("api")

_ip_user_cache: dict = {}


def get_client_ip(request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return request.remote or "unknown"


def get_user_id(request) -> str:
    uid = request.headers.get("X-User-ID", "").strip()
    return uid if uid else "NULL"


def with_cors(request, resp):
    origin = request.headers.get("Origin", "")
    allowed_raw = config.ALLOWED_ORIGINS or "tauri://localhost"
    allowed_origins = [o.strip() for o in allowed_raw.split(",") if o.strip()]
    if (
        origin in allowed_origins
        or origin.startswith("http://localhost")
        or origin.startswith("http://127.0.0.1")
        or origin.startswith("tauri://")
    ):
        resp.headers.update({
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Credentials": "true",
        })
    else:
        resp.headers.update({
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
            "Access-Control-Allow-Headers": "*",
        })
    return resp


@web.middleware
async def logging_middleware(request, handler):
    client_ip = get_client_ip(request)
    user_id = get_user_id(request)
    method = request.method
    path = request.path
    raw_key = (request.headers.get("X-API-KEY") or "").strip()
    key_hint = raw_key[:8] + "..." if len(raw_key) > 8 else ("NOKEY" if not raw_key else raw_key)

    if not user_id or user_id == "NULL":
        if client_ip in _ip_user_cache:
            user_id = _ip_user_cache[client_ip]
    else:
        _ip_user_cache[client_ip] = user_id

    if method != "OPTIONS":
        logger.info("[REQUEST] %s | %s | %s | %s %s", client_ip, user_id, key_hint, method, path)

    response = await handler(request)
    if response.status >= 400:
        logger.warning(
            "[HTTP_ERROR] %s | %s | %s | %s %s | STATUS=%d",
            client_ip, user_id, key_hint, method, path, response.status,
        )
    return response
