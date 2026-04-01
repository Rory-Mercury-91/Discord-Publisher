import http_handlers as legacy
from .handlers_enrichment import (
    get_enrich_synopsis_stats,
    reset_synopsis,
    scrape_thread_dates,
    translate_handler,
)
from .handlers_enrichment_stream import scrape_enrich, scrape_missing_dates


def get_enrichment_routes():
    return [
        ("POST", "/api/scrape/enrich", scrape_enrich),
        ("POST", "/api/translate", translate_handler),
        ("POST", "/api/enrich/reset-synopsis", reset_synopsis),
        ("GET", "/api/enrich/synopsis-stats", get_enrich_synopsis_stats),
        ("POST", "/api/scrape/thread-dates", scrape_thread_dates),
        ("POST", "/api/scrape/missing-dates", scrape_missing_dates),
    ]
