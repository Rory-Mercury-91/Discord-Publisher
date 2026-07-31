import logging
from aiohttp import web

from .middleware import logging_middleware
from .routes_admin import get_admin_routes
from .routes_collection import get_collection_routes
from .routes_common import get_common_routes
from .routes_enrichment import get_enrichment_routes
from .routes_forum import get_forum_routes

logger = logging.getLogger("api")


def _get_routes():
    common_routes = get_common_routes()
    catch_all = [r for r in common_routes if r[0] == "*"]
    head_common = [r for r in common_routes if r[0] != "*"]
    return [
        *head_common,
        *get_forum_routes(),
        *get_collection_routes(),
        *get_admin_routes(),
        *get_enrichment_routes(),
        *catch_all,
    ]


def make_app() -> web.Application:
    app = web.Application(middlewares=[logging_middleware])
    routes = _get_routes()
    for method, path, handler in routes:
        app.router.add_route(method, path, handler)
        logger.info("[api] Route enregistree : %-7s %s", method, path)
    logger.info("[api] %d route(s) enregistree(s)", len(routes))
    return app
