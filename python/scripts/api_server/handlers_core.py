from aiohttp import web

from .middleware import with_cors


async def health(request):
    return with_cors(request, web.json_response({"ok": True, "service": "publisher-api"}))


async def options_handler(request):
    return with_cors(request, web.Response(status=200))


async def handle_404(request):
    return with_cors(request, web.json_response(
        {"ok": False, "error": f"Route not found: {request.method} {request.path}"},
        status=404,
    ))
