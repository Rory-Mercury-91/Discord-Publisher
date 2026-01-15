import os
import sys
import asyncio
import logging
from aiohttp import web
from dotenv import load_dotenv

# Import direct des instances de bots
from bot_server1 import bot as bot1
from bot_server2 import bot as bot2

# Import des handlers du publisher
from publisher_api import (
    health as publisher_health,
    options_handler,
    configure,
    forum_post,
    forum_post_update,
    get_history
)

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("orchestrator")

PORT = int(os.getenv("PORT", 8080))

# Route /api/status pour les bots
async def health(request):
    status = {
        "status": "ok",
        "bots": {
            "server1": bot1.is_ready(),
            "server2": bot2.is_ready()
        }
    }
    return web.json_response(status)

def make_app():
    app = web.Application()
    
    # Routes de santé des bots
    app.router.add_get("/health", health)
    app.router.add_get("/api/status", health)
    
    # Routes Publisher API - AJOUT CRITIQUE
    app.router.add_options("/api/configure", options_handler)
    app.router.add_post("/api/configure", configure)
    
    app.router.add_options("/api/forum-post", options_handler)
    app.router.add_post("/api/forum-post", forum_post)
    app.router.add_patch("/api/forum-post/{thread_id}/{message_id}", forum_post_update)
    
    # Route de santé du publisher
    app.router.add_get("/api/publisher/health", publisher_health)
    
    # Route historique des publications
    app.router.add_get("/api/history", get_history)
    
    return app

@bot1.event
async def on_ready():
    logger.info(f"🤖 Bot Serveur 1 prêt : {bot1.user}")

@bot2.event
async def on_ready():
    logger.info(f"🤖 Bot Serveur 2 prêt : {bot2.user}")

# Orchestrateur principal
async def start():
    TOKEN1 = os.getenv("DISCORD_TOKEN")
    TOKEN2 = os.getenv("DISCORD_TOKEN_F95")
    
    if not TOKEN1:
        logger.error("❌ DISCORD_TOKEN manquant dans .env")
        return
    if not TOKEN2:
        logger.error("❌ DISCORD_TOKEN_F95 manquant dans .env")
        return
    
    app = make_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', PORT)
    
    logger.info(f"🚀 Démarrage serveur sur le port {PORT}")
    
    await asyncio.gather(
        site.start(),
        bot1.start(TOKEN1),
        bot2.start(TOKEN2)
    )

if __name__ == "__main__":
    asyncio.run(start())
