import http_handlers as legacy
from .handlers_collection import (
    collection_f95_preview,
    collection_f95_traducteurs,
    collection_resolve,
    nexus_parse_db,
)
from .handlers_collection_bulk import (
    collection_enrich_entries,
    collection_f95_import,
    collection_import_batch,
)


def get_collection_routes():
    return [
        ("GET", "/api/jeux", legacy.get_jeux),
        ("POST", "/api/jeux/sync-force", legacy.jeux_sync_force),
        ("PATCH", "/api/f95-jeux/{id}/synopsis", legacy.update_f95_jeu_synopsis),
        ("POST", "/api/collection/resolve", collection_resolve),
        ("POST", "/api/collection/nexus-parse-db", nexus_parse_db),
        ("POST", "/api/collection/import-batch", collection_import_batch),
        ("GET", "/api/collection/f95-traducteurs", collection_f95_traducteurs),
        ("POST", "/api/collection/f95-preview", collection_f95_preview),
        ("POST", "/api/collection/f95-import", collection_f95_import),
        ("POST", "/api/collection/enrich-entries", collection_enrich_entries),
        ("GET", "/api/rss/f95-updates", legacy.get_f95_rss_updates),
    ]
