"""
Point d'entree principal — orchestre le demarrage de tous les bots et du serveur web.
Logique de retry/backoff dans bot_lifecycle.py
Dependances : bot_lifecycle, publisher_bot, bot_frelon, http_handlers, supabase_client
Logger       : [orchestrator]
"""

import os
import sys
import asyncio
import logging
import time
from pathlib import Path
from logging.handlers import RotatingFileHandler
from dotenv import load_dotenv

# Charger .env : _ignored/ prioritaire, puis racine python/
_SCRIPTS_DIR = Path(__file__).resolve().parent
_PYTHON_DIR  = _SCRIPTS_DIR.parent
sys.path.insert(0, str(_SCRIPTS_DIR))

load_dotenv(_PYTHON_DIR / "_ignored" / ".env")
load_dotenv(_PYTHON_DIR / ".env")

from aiohttp import web
from discord.http import Route

# ==================== LOGGING ====================

LOG_DIR  = _PYTHON_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "bot.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

file_handler = RotatingFileHandler(
    LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
)
file_handler.setFormatter(
    logging.Formatter("%(asctime)s [%(levelname)s] [%(name)s] %(message)s")
)
logging.getLogger().addHandler(file_handler)

# Reduire le bruit aiohttp
logging.getLogger("aiohttp.access").setLevel(logging.WARNING)

logger = logging.getLogger("orchestrator")

# ==================== IMPORTS MODULES ====================

from bot_lifecycle import start_bot_with_backoff, wait_ready
from bot_frelon import bot as bot_frelon
from publisher_bot import bot as publisher_bot
from http_handlers import make_app
from supabase_client import _init_supabase, _get_supabase
from config import config

PORT = int(os.getenv("PORT", "8080"))


# ==================== RESUME ROUTING SUPABASE ====================

async def _fetch_routing_summary() -> dict:
    """Resume du routing : salons par defaut + mappings traducteurs."""
    sb = _get_supabase()
    summary = {"mappings": 0, "externals": 0, "forum_ids": set()}
    if not sb:
        return summary
    try:
        r1 = sb.table("translator_forum_mappings").select("forum_channel_id").execute()
        for row in (r1.data or []):
            if row.get("forum_channel_id"):
                summary["forum_ids"].add(row["forum_channel_id"])
        summary["mappings"] = len(r1.data or [])

        r2 = sb.table("external_translators").select("forum_channel_id").execute()
        for row in (r2.data or []):
            if row.get("forum_channel_id", "").strip():
                summary["forum_ids"].add(row["forum_channel_id"])
        summary["externals"] = len(r2.data or [])
    except Exception as e:
        logger.warning("[orchestrator] Impossible de charger le resume routing : %s", e)
    return summary


# ==================== DEMARRAGE PRINCIPAL ====================

async def start():
    TOKEN_FRELON = os.getenv("FRELON_DISCORD_TOKEN")
    TOKEN_PUB    = os.getenv("PUBLISHER_DISCORD_TOKEN")

    logger.info("=" * 60)
    logger.info("[orchestrator] Demarrage de l'orchestrateur")
    logger.info("[orchestrator]   Bot Frelon       : %s", "OK token present" if TOKEN_FRELON else "MANQUANT")
    logger.info("[orchestrator]   Publisher Bot    : %s", "OK token present" if TOKEN_PUB    else "absent (attente config)")
    logger.info("[orchestrator]   Scripts dir      : %s", _SCRIPTS_DIR)
    logger.info("[orchestrator]   Log file         : %s", LOG_FILE)
    logger.info("[orchestrator]   Port             : %d", PORT)
    logger.info("=" * 60)

    if not TOKEN_FRELON:
        logger.critical("[orchestrator] FRELON_DISCORD_TOKEN manquant — arret.")
        return

    # ── 1. Serveur Web ────────────────────────────────────────────────────────
    logger.info("[orchestrator] Lancement du serveur Web...")
    app    = make_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    logger.info("[orchestrator] Serveur Web demarre sur http://0.0.0.0:%d", PORT)

    # ── 2. Supabase ───────────────────────────────────────────────────────────
    logger.info("[orchestrator] Initialisation Supabase...")
    await asyncio.get_event_loop().run_in_executor(None, _init_supabase)
    logger.info("[orchestrator] Client Supabase initialise")

    # ── 3. Resume routing ─────────────────────────────────────────────────────
    routing = await _fetch_routing_summary()
    logger.info("=" * 60)
    logger.info("[orchestrator] Routing traducteurs (depuis Supabase) :")
    logger.info("[orchestrator]   Traducteurs inscrits : %d", routing["mappings"])
    logger.info("[orchestrator]   Traducteurs externes : %d", routing["externals"])
    if routing["forum_ids"]:
        logger.info("[orchestrator]   Salons forum actifs (%d) :", len(routing["forum_ids"]))
        for fid in sorted(routing["forum_ids"]):
            is_default = str(fid) == str(config.FORUM_MY_ID)
            logger.info("[orchestrator]     • %s%s", fid, " <- defaut" if is_default else "")
    else:
        logger.info("[orchestrator]   Aucun mapping configure — fallback salon par defaut")
    logger.info("=" * 60)

    # ── 4. Bot Frelon ─────────────────────────────────────────────────────────
    logger.info("[orchestrator] ETAPE 1/2 : Lancement Bot Frelon...")
    frelon_task = asyncio.create_task(
        start_bot_with_backoff(bot_frelon, TOKEN_FRELON, "Bot Frelon"),
        name="task_bot_frelon",
    )

    try:
        await wait_ready(bot_frelon, "Bot Frelon", timeout=180)
        logger.info("[orchestrator] Bot Frelon operationnel -> %s (id=%s)",
                    bot_frelon.user, bot_frelon.user.id)
    except Exception as e:
        logger.error("[orchestrator] Bot Frelon n'a pas pu demarrer : %s", e)
        logger.critical("[orchestrator] Arret de la sequence de demarrage")
        frelon_task.cancel()
        try:
            await frelon_task
        except asyncio.CancelledError:
            logger.info("[orchestrator] Task Bot Frelon annulee proprement")
        return

    # ── 5. Publisher Bot ──────────────────────────────────────────────────────
    if not TOKEN_PUB:
        logger.warning("[orchestrator] PUBLISHER_DISCORD_TOKEN absent — attente via /api/configure (max 180s)...")
        waited = 0
        while not TOKEN_PUB and waited < 180:
            await asyncio.sleep(2)
            waited   += 2
            TOKEN_PUB = (
                os.getenv("PUBLISHER_DISCORD_TOKEN")
                or getattr(config, "PUBLISHER_DISCORD_TOKEN", "")
            )
            if TOKEN_PUB:
                logger.info("[orchestrator] Token Publisher recu apres %ds", waited)
            elif waited % 30 == 0:
                logger.info("[orchestrator] Toujours en attente du token Publisher (%ds/180s)...", waited)

    if not TOKEN_PUB:
        logger.error("[orchestrator] PUBLISHER_DISCORD_TOKEN toujours absent apres 180s — Publisher non lance")
        logger.warning("[orchestrator] Bot Frelon continue seul")
        await asyncio.gather(frelon_task, return_exceptions=True)
        return

    logger.info("[orchestrator] ETAPE 2/2 : Lancement Publisher Bot...")
    pub_task = asyncio.create_task(
        start_bot_with_backoff(publisher_bot, TOKEN_PUB, "PublisherBot"),
        name="task_publisher_bot",
    )

    try:
        await wait_ready(publisher_bot, "PublisherBot", timeout=180)
        logger.info("[orchestrator] PublisherBot operationnel -> %s (id=%s)",
                    publisher_bot.user, publisher_bot.user.id)
    except Exception as e:
        logger.error("[orchestrator] PublisherBot n'a pas pu demarrer : %s", e)
        logger.warning("[orchestrator] Bot Frelon continue seul")
        await asyncio.gather(frelon_task, pub_task, return_exceptions=True)
        return

    # ── 6. Tous les bots sont prets ───────────────────────────────────────────
    logger.info("=" * 60)
    logger.info("[orchestrator] TOUS LES BOTS SONT OPERATIONNELS")
    logger.info("[orchestrator]   Bot Frelon   : %s (id=%s)", bot_frelon.user,   bot_frelon.user.id)
    logger.info("[orchestrator]   PublisherBot : %s (id=%s)", publisher_bot.user, publisher_bot.user.id)
    logger.info("[orchestrator]   API REST     : http://0.0.0.0:%d", PORT)
    logger.info("[orchestrator]   Routing      : %d inscrit(s), %d externe(s), %d salon(s)",
                routing["mappings"], routing["externals"], len(routing["forum_ids"]))
    logger.info("=" * 60)

    # ── 7. Surveillance des tasks ─────────────────────────────────────────────
    done, pending = await asyncio.wait(
        [frelon_task, pub_task],
        return_when=asyncio.FIRST_COMPLETED,
    )

    for task in done:
        name = task.get_name()
        exc  = task.exception() if not task.cancelled() else None
        if exc:
            logger.critical("[orchestrator] Task '%s' terminee avec une exception : %s", name, exc, exc_info=exc)
        elif task.cancelled():
            logger.warning("[orchestrator] Task '%s' annulee", name)
        else:
            logger.info("[orchestrator] Task '%s' terminee normalement", name)

    if pending:
        logger.info("[orchestrator] Attente des %d task(s) restante(s)...", len(pending))
        await asyncio.gather(*pending, return_exceptions=True)

    logger.info("[orchestrator] Orchestrateur arrete")


# ==================== POINT D'ENTREE ====================

if __name__ == "__main__":
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")

    try:
        Route.BASE = "https://discord.com/api/v10"
        logger.info("[orchestrator] API Discord : https://discord.com/api/v10")
        asyncio.run(start())
    except KeyboardInterrupt:
        logger.info("[orchestrator] Arret manuel (KeyboardInterrupt)")
    except Exception as e:
        logger.critical("[orchestrator] Erreur fatale : %s", e, exc_info=True)
        sys.exit(1)
