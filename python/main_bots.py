import os
import sys
import asyncio
import logging
import random
from aiohttp import web
from dotenv import load_dotenv

import discord
from discord.http import Route

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
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

load_dotenv()

# Configuration du Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("orchestrator")

PORT = int(os.getenv("PORT", "8080"))

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

def _task_log_exceptions(task: asyncio.Task, name: str):
    """Évite 'Task exception was never retrieved' et log proprement."""
    try:
        exc = task.exception()
        if exc:
            logger.error(f"❌ {name} a crash: {exc}", exc_info=exc)
    except asyncio.CancelledError:
        logger.info(f"🛑 {name} task cancelled")
    except Exception as e:
        logger.error(f"❌ Erreur lors de la récupération d'exception task {name}: {e}")

async def start_bot_with_backoff(bot: discord.Client, token: str, name: str):
    """
    Démarre un bot Discord avec retry/backoff si Discord renvoie un 429 au login
    ou si la connexion échoue et provoque des redémarrages trop rapides.
    """
    delay = 15  # secondes (base)
    while True:
        try:
            logger.info(f"🔌 {name}: tentative de login...")
            await bot.start(token)
            logger.info(f"✅ {name}: bot arrêté normalement (start() terminé).")
            return
        except discord.errors.HTTPException as e:
            status = getattr(e, "status", None)
            if status == 429:
                # Rate limit global / blocage temporaire
                jitter = random.random() * 5
                logger.warning(f"⛔ {name}: 429 Too Many Requests. Retry dans {delay:.0f}s...")
                await asyncio.sleep(delay + jitter)
                delay = min(delay * 2, 300)  # max 5 min
                continue
            # Autres erreurs HTTP : on remonte
            raise
        except Exception as e:
            # Sécurité: évite une boucle de crash ultra rapide
            jitter = random.random() * 3
            logger.error(f"❌ {name}: erreur au démarrage: {e}. Retry dans {delay:.0f}s...", exc_info=e)
            await asyncio.sleep(delay + jitter)
            delay = min(delay * 2, 300)

async def start():
    TOKEN1 = os.getenv("DISCORD_TOKEN")
    TOKEN2 = os.getenv("DISCORD_TOKEN_F95")

    if not TOKEN1:
        logger.error("❌ DISCORD_TOKEN manquant dans .env")
        return
    if not TOKEN2:
        logger.error("❌ DISCORD_TOKEN_F95 manquant dans .env")
        return

    # 1) Démarrage du serveur Web (Koyeb/healthcheck)
    app = make_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    logger.info(f"🚀 Serveur API et HealthCheck lancé sur le port {PORT}")

    # 2) Démarrage séquentiel (anti IDENTIFY simultané)
    logger.info("🤖 Lancement du Bot Serveur 1 (avec backoff)...")
    t1 = asyncio.create_task(start_bot_with_backoff(bot1, TOKEN1, "Bot1"))
    t1.add_done_callback(lambda task: _task_log_exceptions(task, "Bot1"))

    logger.info("⏳ Pause de 12 secondes pour stabiliser l'API...")
    await asyncio.sleep(12)

    logger.info("🤖 Lancement du Bot Serveur 2 (avec backoff)...")
    # Ici on await pour garder le process vivant même si Bot1 tourne en tâche de fond
    await start_bot_with_backoff(bot2, TOKEN2, "Bot2")

if __name__ == "__main__":
    try:
        # --- PROTECTION ANTI-BAN ---
        # Forcer l'URL officielle Discord côté librairie Discord.py (bots)
        # (Ton Publisher API utilise sa propre base URL, indépendante)
        Route.BASE = "https://discord.com/api/v10"
        logger.info("🛡️  Configuration : Bots en direct, Publisher via Proxy (inchangé).")

        asyncio.run(start())
    except KeyboardInterrupt:
        logger.info("🛑 Arrêt de l'orchestrateur (KeyboardInterrupt)")
