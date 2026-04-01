from .handlers_core import handle_404, health, options_handler


def get_common_routes():
    return [
        ("OPTIONS", "/{tail:.*}", options_handler),
        ("GET", "/", health),
        ("GET", "/api/status", health),
        ("GET", "/api/publisher/health", health),
        ("*", "/{tail:.*}", handle_404),
    ]
