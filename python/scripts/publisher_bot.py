"""
Instanciation du bot Publisher + on_ready (demarre les taches planifiees).
Dependances : config, scheduled_tasks, slash_commands
Logger       : [publisher]

Note importante sur l'ordre d'import :
  Ce module cree l'instance `bot` qui est importee par scheduled_tasks,
  slash_commands et version_checker. Il doit donc etre importe EN PREMIER
  par main_bots.py, avant tous les autres modules publisher.
"""

import logging

import discord
from discord.ext import commands

from config import config

logger = logging.getLogger("publisher")

# ==================== INSTANCE BOT ====================

intents = discord.Intents.default()
intents.message_content = True
intents.guilds          = True

# Instance unique importee par tous les autres modules
bot = commands.Bot(command_prefix="!", intents=intents)


# ==================== EVENEMENTS ====================

@bot.event
async def on_ready():
    logger.info("[publisher] Bot Publisher pret : %s (id=%s)", bot.user, bot.user.id)

    # Synchronisation des commandes slash
    try:
        synced = await bot.tree.sync()
        logger.info(
            "[publisher] %d commande(s) slash synchronisee(s) : %s",
            len(synced), [c.name for c in synced],
        )
    except Exception as e:
        logger.error("[publisher] Sync commandes slash echouee : %s", e)

    # Demarrage des taches planifiees
    from scheduled_tasks import start_all_tasks
    start_all_tasks()


# ==================== ENREGISTREMENT COMMANDES ====================

# Import et enregistrement des commandes slash sur cette instance bot.
# Fait apres la definition de `bot` pour eviter les imports circulaires.
from slash_commands import register_commands
register_commands(bot)
