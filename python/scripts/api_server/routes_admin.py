from .handlers_admin import (
    account_delete,
    admin_forum_channels_list,
    admin_forum_post_grants_add,
    admin_forum_post_grants_delete,
    admin_forum_post_grants_list,
    admin_profile_transfer,
    get_journal_logs,
    get_logs,
    server_action,
)


def get_admin_routes():
    return [
        ("POST", "/api/account/delete", account_delete),
        ("POST", "/api/server/action", server_action),
        ("POST", "/api/admin/profile-transfer", admin_profile_transfer),
        ("GET", "/api/admin/forum-post-grants", admin_forum_post_grants_list),
        ("POST", "/api/admin/forum-post-grants", admin_forum_post_grants_add),
        ("DELETE", "/api/admin/forum-post-grants", admin_forum_post_grants_delete),
        ("GET", "/api/admin/forum-channels", admin_forum_channels_list),
        ("GET", "/api/logs", get_logs),
        ("GET", "/api/logs/journal", get_journal_logs),
    ]
