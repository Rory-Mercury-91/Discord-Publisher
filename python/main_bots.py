import os
import sys
import asyncio
import logging
from aiohttp import web
from dotenv import load_dotenv

# Import direct des instances de bots (On garde tes imports originaux)
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

# Configuration de l'encodage pour Windows si nécessaire
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

load_dotenv()

# Configuration du Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("orchestrator")

PORT = int(os.getenv("PORT", 8080))

# Route de santé pour vérifier l'état des deux bots
async def health(request):
    status = {
        "status": "ok",
        "bots": {
            "server1": bot1.is_ready(),
            "server2": bot2.is_ready()
        },
        "timestamp": int(asyncio.get_event_loop().time())
    }
    return web.json_response(status)

def make_app():
    app = web.Application()
    
    # Routes de santé et statut
    app.router.add_get("/", health)
    app.router.add_get("/api/status", health)
    
    # Routes API Publisher (Toute ta logique originale est ici)
    app.router.add_options("/api/configure", options_handler)
    app.router.add_post("/api/configure", configure)
    
    app.router.add_options("/api/forum-post", options_handler)
    app.router.add_post("/api/forum-post", forum_post)
    
    app.router.add_options("/api/forum-post/update", options_handler)
    app.router.add_post("/api/forum-post/update", forum_post_update)
    
    app.router.add_get("/api/publisher/health", publisher_health)
    app.router.add_get("/api/history", get_history)
    
    return app

# Orchestrateur principal avec gestion des délais (Anti-Ban)
async def start():
    TOKEN1 = os.getenv("DISCORD_TOKEN")
    TOKEN2 = os.getenv("DISCORD_TOKEN_F95")
    
    if not TOKEN1:
        logger.error("❌ DISCORD_TOKEN manquant dans .env")
        return
    if not TOKEN2:
        logger.error("❌ DISCORD_TOKEN_F95 manquant dans .env")
        return

    # 1. Démarrage du serveur Web (Koyeb en a besoin pour le health check)
    app = make_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', PORT)
    await site.start()
    logger.info(f"🚀 Serveur API et HealthCheck lancé sur le port {PORT}")
    
    # 2. Démarrage séquentiel des bots pour protéger l'IP
    # On lance le Bot 1
    logger.info("🤖 Lancement du Bot Serveur 1...")
    asyncio.create_task(bot1.start(TOKEN1))
    
    # On attend que le Bot 1 soit stabilisé avant de lancer le 2
    # Ça évite que les deux bots fassent leur requête "Gateway IDENTIFY" en même temps
    logger.info("⏳ Pause de 12 secondes pour stabiliser l'API...")
    await asyncio.sleep(12) 
    
    # On lance le Bot 2
    logger.info("🤖 Lancement du Bot Serveur 2...")
    await bot2.start(TOKEN2)

if __name__ == "__main__":
    try:
        # --- PROTECTION ANTI-BAN ---
        # On force l'URL officielle de Discord au niveau global de la librairie.
        # Cela ne change RIEN à ton Publisher qui utilise ses propres URLs codées en dur,
        # mais cela garantit que Bot1 et Bot2 n'utiliseront PAS ton Worker Cloudflare.
        from discord.http import Route
        Route.BASE = "https://discord.com/api/v10"
        
        logger.info("🛡️  Configuration : Bots en direct, Publisher via Proxy.")
        
        asyncio.run(start())
    except KeyboardInterrupt:
        logger.info("🛑 Arrêt de l'orchestrateur")