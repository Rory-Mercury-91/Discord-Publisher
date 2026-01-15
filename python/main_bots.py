import os
import sys
import asyncio
import logging
from aiohttp import web
from dotenv import load_dotenv

# Import direct des instances de bots
from bot_server1 import bot as bot1
from bot_server2 import bot as bot2

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

# Route /api/status pour Tauri
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
    app.router.add_get("/health", health)
    app.router.add_route("OPTIONS", "/api/status", lambda r: web.Response(status=204))
    app.router.add_get("/api/status", health)
    # Ajoute ici les autres routes de ton API Publisher si besoin
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
    app = make_app()
    await asyncio.gather(
        web._run_app(app, port=PORT),
        bot1.start(TOKEN1),
        bot2.start(TOKEN2)
    )

if __name__ == "__main__":
    asyncio.run(start())