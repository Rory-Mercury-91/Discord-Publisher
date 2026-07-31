from .handlers_nautiljon import nautiljon_fetch


def get_nautiljon_routes():
    return [
        ("GET", "/api/nautiljon/fetch", nautiljon_fetch),
    ]
