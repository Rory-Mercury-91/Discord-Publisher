"""
Configuration centrale — Config class + get_publisher_token()
Dependances : aucune (module racine)
"""

import os
import logging
from pathlib import Path
from dotenv import load_dotenv

# Charger .env : _ignored/ prioritaire, puis racine python/
_python_dir = Path(__file__).resolve().parent.parent
load_dotenv(_python_dir / "_ignored" / ".env")
load_dotenv(_python_dir / ".env")

logger = logging.getLogger("publisher")


class Config:
    def __init__(self):
        # API REST
        self.PUBLISHER_DISCORD_TOKEN = os.getenv("PUBLISHER_DISCORD_TOKEN", "")
        self.PUBLISHER_API_KEY       = os.getenv("PUBLISHER_API_KEY", "")
        self.ALLOWED_ORIGINS         = os.getenv("PUBLISHER_ALLOWED_ORIGINS", "*")
        self.PORT                    = int(os.getenv("PORT", "8080"))

        # API Discord officielle
        self.DISCORD_API_BASE = os.getenv("DISCORD_API_BASE", "https://discord.com/api/v10")

        # Salon forum principal (publication + controle versions)
        self.FORUM_MY_ID = (
            int(os.getenv("PUBLISHER_FORUM_TRAD_ID"))
            if os.getenv("PUBLISHER_FORUM_TRAD_ID") else 0
        )
        if not self.FORUM_MY_ID and os.getenv("FORUM_CHANNEL_ID"):
            self.FORUM_MY_ID = int(os.getenv("FORUM_CHANNEL_ID", "0"))

        # Salons de notification et d'annonce
        self.PUBLISHER_MAJ_NOTIFICATION_CHANNEL_ID = (
            int(os.getenv("PUBLISHER_MAJ_NOTIFICATION_CHANNEL_ID"))
            if os.getenv("PUBLISHER_MAJ_NOTIFICATION_CHANNEL_ID") else 0
        )
        self.PUBLISHER_ANNOUNCE_CHANNEL_ID = (
            int(os.getenv("PUBLISHER_ANNOUNCE_CHANNEL_ID"))
            if os.getenv("PUBLISHER_ANNOUNCE_CHANNEL_ID") else 0
        )

        # Planification
        self.VERSION_CHECK_HOUR              = int(os.getenv("VERSION_CHECK_HOUR", "6"))
        self.VERSION_CHECK_MINUTE            = int(os.getenv("VERSION_CHECK_MINUTE", "0"))
        self.CLEANUP_EMPTY_MESSAGES_HOUR     = int(os.getenv("CLEANUP_EMPTY_MESSAGES_HOUR", "4"))
        self.CLEANUP_EMPTY_MESSAGES_MINUTE   = int(os.getenv("CLEANUP_EMPTY_MESSAGES_MINUTE", "0"))

        self.configured = bool(
            self.PUBLISHER_DISCORD_TOKEN
            and self.FORUM_MY_ID
            and self.PUBLISHER_MAJ_NOTIFICATION_CHANNEL_ID
        )

    def update_from_frontend(self, config_data: dict):
        if config_data.get("discordPublisherToken"):
            self.PUBLISHER_DISCORD_TOKEN = config_data["discordPublisherToken"]
        if config_data.get("publisherForumMyId"):
            self.FORUM_MY_ID = int(config_data["publisherForumMyId"])
        self.configured = bool(
            self.PUBLISHER_DISCORD_TOKEN
            and self.FORUM_MY_ID
            and self.PUBLISHER_MAJ_NOTIFICATION_CHANNEL_ID
        )
        logger.info("[config] Configuration mise a jour (configured: %s)", self.configured)


# Instance unique partagee par tous les modules
config = Config()


def get_publisher_token() -> str:
    """Retourne le token Publisher : env > config en memoire."""
    return (os.getenv("PUBLISHER_DISCORD_TOKEN") or config.PUBLISHER_DISCORD_TOKEN or "").strip()
