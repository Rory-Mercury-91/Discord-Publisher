import os
import sys
import asyncio
import logging
import random
from aiohttp import web
from dotenv import load_dotenv

import discord
from discord.http import Route

# Import direct des instances de bots
from bot_server1 import bot as bot1
from bot_server2 import bot as bot2

# Import des handlers + bot du publisher
from publisher_api import (
    bot as publisher_bot,
    config as publisher_config,
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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("orchestrator")

PORT = int(os.getenv("PORT", "8080"))

# -------------------------
# WEB APP (health + API)
# -------------------------
async def health(request):
    status = {
        "status": "ok",
        "bots": {
            "server1": bot1.is_ready(),
            "server2": bot2.is_ready(),
            "publisher": publisher_bot.is_ready(),
        },
        "publisher_configured": bool(getattr(publisher_config, "configured", False)),
        "timestamp": int(asyncio.get_event_loop().time()),
    }
    return web.json_response(status)


def make_app():
    app = web.Application()

    # OPTIONS global (CORS) : couvre toutes les routes (status/health/history inclus)
    app.router.add_route("OPTIONS", "/{tail:.*}", options_handler)

    # Health / Status
    app.router.add_get("/", health)
    app.router.add_get("/api/status", health)

    # Configure
    app.router.add_post("/api/configure", configure)

    # Forum post
    app.router.add_post("/api/forum-post", forum_post)

    # Forum post update
    app.router.add_post("/api/forum-post/update", forum_post_update)

    # Publisher endpoints
    app.router.add_get("/api/publisher/health", publisher_health)
    app.router.add_get("/api/history", get_history)

    return app

# -------------------------
# BOT START (anti 429)
# -------------------------
async def start_bot_with_backoff(bot: discord.Client, token: str, name: str):
    """
    Démarre un bot Discord avec retry/backoff.
    IMPORTANT: sur échec, on ferme le bot pour éviter les "Unclosed client session".
    """
    delay = 30  # base plus safe que 15s
    while True:
        try:
            logger.info(f"🔌 {name}: tentative de login...")
            await bot.start(token)
            logger.info(f"✅ {name}: start() terminé (arrêt normal).")
            return
        except discord.errors.HTTPException as e:
            if getattr(e, "status", None) == 429:
                logger.warning(f"⛔ {name}: 429 Too Many Requests. Retry dans {delay:.0f}s...")
            else:
                logger.error(f"❌ {name}: HTTPException status={getattr(e,'status',None)}: {e}")
                raise
        except Exception as e:
            logger.error(f"❌ {name}: erreur au démarrage: {e}. Retry dans {delay:.0f}s...", exc_info=e)

        # ✅ évite les fuites de sessions aiohttp lors des retry
        try:
            await bot.close()
        except Exception:
            pass

        jitter = random.random() * 5
        await asyncio.sleep(delay + jitter)
        delay = min(delay * 2, 300)  # max 5 minutes

async def wait_ready(bot: discord.Client, name: str, timeout: int = 180):
    """
    Attend que le bot soit ready (Gateway OK).
    Si timeout, on considère que Discord bloque encore, mais on ne lance pas l'autre bot.
    """
    start_t = asyncio.get_event_loop().time()
    while not bot.is_ready():
        if asyncio.get_event_loop().time() - start_t > timeout:
            raise TimeoutError(f"{name} n'est pas ready après {timeout}s")
        await asyncio.sleep(2)

# -------------------------
# ORCHESTRATOR
# -------------------------
async def start():
    TOKEN1 = os.getenv("DISCORD_TOKEN")
    TOKEN2 = os.getenv("DISCORD_TOKEN_F95")

    if not TOKEN1:
        logger.error("❌ DISCORD_TOKEN manquant dans .env")
        return
    if not TOKEN2:
        logger.error("❌ DISCORD_TOKEN_F95 manquant dans .env")
        return

    # 1) Serveur Web (API + healthchecks)
    app = make_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    logger.info(f"🚀 Serveur API et HealthCheck lancé sur le port {PORT}")


    # 2) Démarrage séquentiel :
    #    Bot1 -> READY -> Bot2 -> READY -> PublisherBot -> READY
    logger.info("🤖 Lancement Bot1 (séquentiel, avec backoff)...")
    bot1_task = asyncio.create_task(start_bot_with_backoff(bot1, TOKEN1, "Bot1"))

    try:
        await wait_ready(bot1, "Bot1", timeout=180)
        logger.info("✅ Bot1 ready. Lancement Bot2...")
    except Exception as e:
        logger.error(f"⛔ Bot1 n'est pas ready, Bot2 ne sera pas lancé: {e}")
        await bot1_task
        return

    bot2_task = asyncio.create_task(start_bot_with_backoff(bot2, TOKEN2, "Bot2"))

    try:
        await wait_ready(bot2, "Bot2", timeout=180)
        logger.info("✅ Bot2 ready. Lancement Publisher Bot...")
    except Exception as e:
        logger.error(f"⛔ Bot2 n'est pas ready, Publisher Bot ne sera pas lancé: {e}")
        await asyncio.gather(bot1_task, bot2_task)
        return

    # Token publisher : soit dans .env, soit injecté ensuite via /api/configure
    TOKEN_PUB = os.getenv("DISCORD_PUBLISHER_TOKEN") or getattr(publisher_config, "DISCORD_PUBLISHER_TOKEN", "")

    # Si tu comptes configurer via /api/configure après le boot, on attend un peu que le token arrive
    waited = 0
    while not TOKEN_PUB and waited < 180:
        await asyncio.sleep(2)
        waited += 2
        TOKEN_PUB = os.getenv("DISCORD_PUBLISHER_TOKEN") or getattr(publisher_config, "DISCORD_PUBLISHER_TOKEN", "")

    if not TOKEN_PUB:
        logger.error("⛔ DISCORD_PUBLISHER_TOKEN manquant (env ou /api/configure). Publisher Bot non lancé.")
        # On laisse bot1 + bot2 tourner
        await asyncio.gather(bot1_task, bot2_task)
        return

    pub_task = asyncio.create_task(start_bot_with_backoff(publisher_bot, TOKEN_PUB, "PublisherBot"))

    try:
        await wait_ready(publisher_bot, "PublisherBot", timeout=180)
        logger.info("✅ PublisherBot ready. ✅ Séquence terminée (Bot1 -> Bot2 -> PublisherBot).")
    except Exception as e:
        logger.error(f"⛔ PublisherBot n'est pas ready: {e}")
        await asyncio.gather(bot1_task, bot2_task, pub_task)
        return

    # Garde le process vivant tant que les bots tournent
    await asyncio.gather(bot1_task, bot2_task, pub_task)

if __name__ == "__main__":
    try:
        # Force l'API officielle pour les bots (ne touche pas ton Publisher API)
        Route.BASE = "https://discord.com/api/v10"
        logger.info("🛡️  Configuration : Bots en direct, Publisher via Proxy (inchangé).")

        asyncio.run(start())
    except KeyboardInterrupt:
        logger.info("🛑 Arrêt de l'orchestrateur (KeyboardInterrupt)")
