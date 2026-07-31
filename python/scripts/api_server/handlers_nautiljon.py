"""
Pont Nautiljon pour Mangathèque — fetch HTML depuis l'IP Oracle.
Auth : même X-API-KEY que le reste de l'API Publisher.
"""

from __future__ import annotations

import logging
import re
from urllib.parse import urlparse

import aiohttp
from aiohttp import web

from api_key_auth import _auth_request

from .middleware import with_cors

logger = logging.getLogger("api")

_NAUTILJON_HOST_RE = re.compile(r"^(?:www\.)?nautiljon\.com$", re.IGNORECASE)

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)


def _is_allowed_nautiljon_url(raw: str) -> bool:
    try:
        parsed = urlparse((raw or "").strip())
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.netloc or "").split("@")[-1].split(":")[0]
    return bool(_NAUTILJON_HOST_RE.match(host))


async def nautiljon_fetch(request: web.Request) -> web.StreamResponse:
    """
    GET /api/nautiljon/fetch?url=https://www.nautiljon.com/...
    Header requis : X-API-KEY (clé perso tr_… ou clé legacy).
    Réponse : HTML brut (text/html).
    """
    is_valid, _, discord_name, _ = await _auth_request(request, "/api/nautiljon/fetch")
    if not is_valid:
        return with_cors(
            request,
            web.json_response({"ok": False, "error": "Invalid API key"}, status=401),
        )

    url = (request.query.get("url") or "").strip()
    if not url:
        return with_cors(
            request,
            web.json_response({"ok": False, "error": "Paramètre url manquant."}, status=400),
        )
    if not _is_allowed_nautiljon_url(url):
        return with_cors(
            request,
            web.json_response(
                {"ok": False, "error": "URL refusée (domaine nautiljon.com uniquement)."},
                status=400,
            ),
        )

    headers = {
        "User-Agent": _USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "Referer": "https://www.nautiljon.com/",
    }

    try:
        timeout = aiohttp.ClientTimeout(total=45)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers=headers, allow_redirects=True) as resp:
                raw = await resp.read()
                charset = resp.charset or "utf-8"
                try:
                    html = raw.decode(charset, errors="replace")
                except LookupError:
                    html = raw.decode("utf-8", errors="replace")
                final_url = str(resp.url)
                status = resp.status
    except Exception as exc:
        logger.warning(
            "[nautiljon] Échec fetch pour %s (user=%s) : %s",
            url,
            discord_name or "?",
            exc,
        )
        return with_cors(
            request,
            web.json_response(
                {"ok": False, "error": f"Échec téléchargement : {exc}"},
                status=502,
            ),
        )

    body = html.encode("utf-8", errors="replace")
    out = web.Response(
        body=body,
        status=200 if status < 500 else 502,
        content_type="text/html",
        charset="utf-8",
    )
    out.headers["Cache-Control"] = "no-store"
    out.headers["X-Bridge-Status"] = str(status)
    out.headers["X-Bridge-Final-Url"] = final_url
    logger.info(
        "[nautiljon] OK user=%s status=%s bytes=%d url=%s",
        discord_name or "?",
        status,
        len(body),
        url,
    )
    return with_cors(request, out)
