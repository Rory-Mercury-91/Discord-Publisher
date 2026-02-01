import os
import sys
import asyncio
import logging
import random
from aiohttp import web
from dotenv import load_dotenv

import discord
from discord.http import Route

# Import direct de l'instance du Bot Serveur Frelon
from bot_frelon import bot as bot_frelon

# Import des handlers + bot du publisher
from publisher_api import (
    bot as publisher_bot,
    config as publisher_config,
    health as publisher_health,
    options_handler,
    configure,
    forum_post,
    forum_post_update,
    forum_post_delete,
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
            "bot_frelon": bot_frelon.is_ready(),
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

    # Forum post delete (thread Discord + historique/Supabase côté frontend)
    app.router.add_post("/api/forum-post/delete", forum_post_delete)

    # Publisher endpoints
    app.router.add_get("/api/publisher/health", publisher_health)
    app.router.add_get("/api/history", get_history)

    return app

# -------------------------
# BOT START (anti 429 + correction session)
# -------------------------
async def start_bot_with_backoff(bot: discord.Client, token: str, name: str):
    """
    Démarre un bot Discord avec retry/backoff.
    CORRECTION: Réinitialise la session HTTP avant chaque tentative
    """
    delay = 30  # base plus safe que 15s
    max_delay = 300  # max 5 minutes
    attempt = 0
    
    while True:
        attempt += 1
        try:
            logger.info(f"🔌 {name}: tentative de login #{attempt}...")
            
            # ✅ CORRECTION CRITIQUE: Vérifier l'état de la session HTTP
            if hasattr(bot, 'http') and bot.http._HTTPClient__session:
                if bot.http._HTTPClient__session.closed:
                    logger.warning(f"⚠️ {name}: Session HTTP fermée détectée, réinitialisation...")
                    # Forcer la recréation de la session
                    bot.http._HTTPClient__session = None
            
            # Tentative de connexion
            await bot.start(token)
            logger.info(f"✅ {name}: start() terminé (arrêt normal).")
            return
            
        except discord.errors.HTTPException as e:
            status_code = getattr(e, "status", None)
            
            if status_code == 429:
                # Rate limit Discord
                retry_after = getattr(e, "retry_after", delay)
                logger.warning(
                    f"⛔ {name}: 429 Too Many Requests (tentative #{attempt}). "
                    f"Retry dans {retry_after:.0f}s..."
                )
                await _cleanup_bot_session(bot, name)
                await asyncio.sleep(retry_after + random.random() * 2)
                
            elif status_code in [502, 503, 504]:
                # Erreurs serveur Discord temporaires
                logger.warning(
                    f"⚠️ {name}: Erreur serveur Discord {status_code} (tentative #{attempt}). "
                    f"Retry dans {delay:.0f}s..."
                )
                await _cleanup_bot_session(bot, name)
                jitter = random.random() * 5
                await asyncio.sleep(delay + jitter)
                delay = min(delay * 1.5, max_delay)
                
            else:
                # Autres erreurs HTTP
                logger.error(
                    f"❌ {name}: HTTPException status={status_code} (tentative #{attempt}): {e}",
                    exc_info=True
                )
                await _cleanup_bot_session(bot, name)
                
                # Pour les erreurs non-temporaires, attendre plus longtemps
                if attempt < 5:
                    await asyncio.sleep(delay + random.random() * 5)
                    delay = min(delay * 2, max_delay)
                else:
                    logger.critical(f"🛑 {name}: Trop d'échecs consécutifs, abandon.")
                    raise
                    
        except RuntimeError as e:
            error_msg = str(e)
            
            if "Session is closed" in error_msg:
                # ✅ CORRECTION: Gérer spécifiquement l'erreur "Session is closed"
                logger.error(
                    f"❌ {name}: Session HTTP fermée (tentative #{attempt}). "
                    f"Nettoyage et retry dans {delay:.0f}s..."
                )
                await _cleanup_bot_session(bot, name)
                jitter = random.random() * 5
                await asyncio.sleep(delay + jitter)
                delay = min(delay * 2, max_delay)
                
            else:
                # Autres RuntimeError
                logger.error(
                    f"❌ {name}: RuntimeError (tentative #{attempt}): {e}",
                    exc_info=True
                )
                await _cleanup_bot_session(bot, name)
                
                if attempt < 5:
                    await asyncio.sleep(delay + random.random() * 5)
                    delay = min(delay * 2, max_delay)
                else:
                    logger.critical(f"🛑 {name}: Trop d'échecs consécutifs, abandon.")
                    raise
                    
        except Exception as e:
            # Toutes les autres exceptions
            logger.error(
                f"❌ {name}: Erreur inattendue (tentative #{attempt}): {type(e).__name__}: {e}",
                exc_info=True
            )
            await _cleanup_bot_session(bot, name)
            
            if attempt < 5:
                jitter = random.random() * 5
                await asyncio.sleep(delay + jitter)
                delay = min(delay * 2, max_delay)
            else:
                logger.critical(f"🛑 {name}: Trop d'échecs consécutifs, abandon.")
                raise


async def _cleanup_bot_session(bot: discord.Client, name: str):
    """
    Nettoie proprement la session HTTP d'un bot Discord
    """
    try:
        # Fermer le bot proprement
        if not bot.is_closed():
            logger.info(f"🧹 {name}: Fermeture du bot...")
            await bot.close()
            
        # Attendre que la fermeture soit complète
        await asyncio.sleep(1.0)
        
        # Réinitialiser la session HTTP si elle existe
        if hasattr(bot, 'http') and hasattr(bot.http, '_HTTPClient__session'):
            if bot.http._HTTPClient__session and not bot.http._HTTPClient__session.closed:
                logger.info(f"🧹 {name}: Fermeture de la session HTTP...")
                await bot.http._HTTPClient__session.close()
            bot.http._HTTPClient__session = None
            
        logger.info(f"✅ {name}: Nettoyage terminé")
        
    except Exception as e:
        logger.warning(f"⚠️ {name}: Erreur lors du nettoyage: {e}")


async def wait_ready(bot: discord.Client, name: str, timeout: int = 180):
    """
    Attend que le bot soit ready (Gateway OK).
    Si timeout, on considère que Discord bloque encore.
    """
    start_t = asyncio.get_event_loop().time()
    check_interval = 2.0
    
    logger.info(f"⏳ {name}: Attente de l'état 'ready' (timeout: {timeout}s)...")
    
    while not bot.is_ready():
        elapsed = asyncio.get_event_loop().time() - start_t
        
        if elapsed > timeout:
            logger.error(
                f"❌ {name}: Timeout après {timeout}s - le bot n'est pas ready. "
                f"État actuel: is_closed={bot.is_closed()}"
            )
            raise TimeoutError(f"{name} n'est pas ready après {timeout}s")
            
        # Log périodique pour suivre la progression
        if int(elapsed) % 30 == 0 and elapsed > 0:
            logger.info(
                f"⏳ {name}: Toujours en attente... "
                f"({int(elapsed)}s/{timeout}s, is_closed={bot.is_closed()})"
            )
            
        await asyncio.sleep(check_interval)
    
    logger.info(f"✅ {name}: Bot ready !")

# -------------------------
# ORCHESTRATOR
# -------------------------
async def start():
    TOKEN2 = os.getenv("FRELON_DISCORD_TOKEN")
    TOKEN_PUB = os.getenv("PUBLISHER_DISCORD_TOKEN")

    if not TOKEN2:
        logger.error("❌ FRELON_DISCORD_TOKEN manquant dans .env")
        return

    logger.info("🚀 Démarrage de l'orchestrateur...")
    logger.info(f"📋 Configuration:")
    logger.info(f"   - Bot Frelon / F95 Checker (FRELON_DISCORD_TOKEN): {'✓' if TOKEN2 else '✗'}")
    logger.info(f"   - Publisher (DISCORD_TOKEN_PUBLISHER): {'✓' if TOKEN_PUB else '✗'}")

    # 1) Serveur Web (API + healthchecks)
    logger.info("🌐 Lancement du serveur Web...")
    app = make_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    logger.info(f"✅ Serveur API et HealthCheck lancé sur le port {PORT}")
    
    # 2) Initialiser Supabase AVANT de lancer les bots Discord (évite le blocage de l'event loop)
    logger.info("🗄️ Initialisation du client Supabase...")
    from publisher_api import _init_supabase
    await asyncio.get_event_loop().run_in_executor(None, _init_supabase)
    logger.info("✅ Client Supabase prêt")

    # 3) Démarrage séquentiel : Bot2 -> PublisherBot
    # Chaque bot doit être ready avant de lancer le suivant

    # --- BOT 2 ---
    logger.info("=" * 60)
    logger.info("🐝 ÉTAPE 1/2: Lancement Bot Serveur Frelon (F95 Checker)...")
    logger.info("=" * 60)

    frelon_task = asyncio.create_task(start_bot_with_backoff(bot_frelon, TOKEN2, "Bot Frelon"))

    try:
        await wait_ready(bot_frelon, "Bot Frelon", timeout=180)
        logger.info("✅🐝 Bot Frelon prêt et opérationnel")
    except Exception as e:
        logger.error(f"⛔🐝 Bot Frelon n'a pas pu démarrer: {e}")
        logger.error("🛑 Arrêt de la séquence de démarrage")
        frelon_task.cancel()
        try:
            await frelon_task
        except asyncio.CancelledError:
            pass
        return

    # --- PUBLISHER BOT ---
    # Attendre le token si nécessaire (config via API)
    if not TOKEN_PUB:
        logger.warning("⚠️ PUBLISHER_DISCORD_TOKEN non défini, attente de configuration via /api/configure...")
        waited = 0
        while not TOKEN_PUB and waited < 180:
            await asyncio.sleep(2)
            waited += 2
            TOKEN_PUB = os.getenv("PUBLISHER_DISCORD_TOKEN") or getattr(publisher_config, "PUBLISHER_DISCORD_TOKEN", "")
            if TOKEN_PUB:
                logger.info(f"✅ Token Publisher reçu après {waited}s")

    if not TOKEN_PUB:
        logger.error("⛔ PUBLISHER_DISCORD_TOKEN toujours manquant après 180s")
        logger.warning("⚠️ Publisher Bot non lancé, Bot Frelon continue de fonctionner")
        await asyncio.gather(frelon_task, return_exceptions=True)
        return

    logger.info("=" * 60)
    logger.info("🤖 ÉTAPE 2/2: Lancement Publisher Bot...")
    logger.info("=" * 60)
    
    pub_task = asyncio.create_task(start_bot_with_backoff(publisher_bot, TOKEN_PUB, "PublisherBot"))

    try:
        await wait_ready(publisher_bot, "PublisherBot", timeout=180)
        logger.info("✅ PublisherBot prêt et opérationnel")
    except Exception as e:
        logger.error(f"⛔ PublisherBot n'a pas pu démarrer: {e}")
        logger.warning("⚠️ Bot Frelon continue de fonctionner")
        await asyncio.gather(frelon_task, pub_task, return_exceptions=True)
        return

    # --- TOUS LES BOTS SONT PRÊTS ---
    logger.info("=" * 60)
    logger.info("🎉 TOUS LES BOTS SONT OPÉRATIONNELS")
    logger.info("=" * 60)
    logger.info("✅🐝 Bot Serveur Frelon: Ready")
    logger.info("✅ PublisherBot: Ready")
    logger.info(f"🌐 API REST: http://0.0.0.0:{PORT}")
    logger.info("=" * 60)

    # Garde le process vivant tant que les bots tournent
    await asyncio.gather(frelon_task, pub_task, return_exceptions=True)


if __name__ == "__main__":
    try:
        # Force l'API officielle pour les bots (ne touche pas ton Publisher API)
        Route.BASE = "https://discord.com/api/v10"
        logger.info("🛡️  Configuration : Bots en direct, Publisher via Proxy (inchangé).")

        asyncio.run(start())
    except KeyboardInterrupt:
        logger.info("🛑 Arrêt de l'orchestrateur (KeyboardInterrupt)")
    except Exception as e:
        logger.critical(f"💥 Erreur fatale dans l'orchestrateur: {e}", exc_info=True)
        sys.exit(1)
