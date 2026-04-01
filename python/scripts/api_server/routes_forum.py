import http_handlers as legacy
from .handlers_forum import (
    configure,
    forum_post_delete,
    get_forum_tags,
    get_history,
    get_instructions,
    sync_forum_tags,
)
from .handlers_forum_publish import forum_post, forum_post_update


def get_forum_routes():
    return [
        ("POST", "/api/configure", configure),
        ("POST", "/api/forum-post", forum_post),
        ("POST", "/api/forum-post/update", forum_post_update),
        ("POST", "/api/forum-post/delete", forum_post_delete),
        ("GET", "/api/history", get_history),
        ("GET", "/api/instructions", get_instructions),
        ("GET", "/api/forum-tags", get_forum_tags),
        ("POST", "/api/forum-tags/sync", sync_forum_tags),
        ("POST", "/api/transfer-ownership", legacy.transfer_ownership),
    ]
