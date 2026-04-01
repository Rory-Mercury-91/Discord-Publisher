from .handlers_admin import (
    account_delete,
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
        ("GET", "/api/logs", get_logs),
        ("GET", "/api/logs/journal", get_journal_logs),
    ]
