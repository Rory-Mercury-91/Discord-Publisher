"""
Gestion du cycle de vie des bots Discord (retry/backoff, cleanup session).
Extrait de main_bots.py pour etre reutilisable independamment.
Dependances : discord uniquement
Logger       : [orchestrator]
"""

import asyncio
import logging
import random
import time

import discord

logger = logging.getLogger("orchestrator")


# ==================== DEMARRAGE AVEC BACKOFF ====================

async def start_bot_with_backoff(bot: discord.Client, token: str, name: str):
    """
    Demarre un bot Discord avec retry/backoff exponentiel.
    Reinitialise la session HTTP avant chaque tentative.
    """
    delay     = 30
    max_delay = 300
    attempt   = 0

    while True:
        attempt += 1
        logger.info(
            "[orchestrator] [%s] Tentative de connexion #%d (delai suivant si echec : %ds)...",
            name, attempt, delay,
        )

        try:
            # Verifier l'etat de la session HTTP
            if hasattr(bot, "http") and bot.http._HTTPClient__session:
                if bot.http._HTTPClient__session.closed:
                    logger.warning(
                        "[orchestrator] [%s] Session HTTP fermee detectee avant connexion, reinitialisation...",
                        name,
                    )
                    bot.http._HTTPClient__session = None

            await bot.start(token)
            logger.info("[orchestrator] [%s] start() termine (arret normal)", name)
            return

        except discord.errors.HTTPException as e:
            status_code = getattr(e, "status", None)

            if status_code == 429:
                retry_after = getattr(e, "retry_after", delay)
                logger.warning(
                    "[orchestrator] [%s] 429 Too Many Requests (tentative #%d). Retry dans %ds...",
                    name, attempt, retry_after,
                )
                await _cleanup_bot_session(bot, name)
                await asyncio.sleep(retry_after + random.random() * 2)

            elif status_code in (502, 503, 504):
                logger.warning(
                    "[orchestrator] [%s] Erreur serveur Discord %d (tentative #%d). Retry dans %ds...",
                    name, status_code, attempt, delay,
                )
                await _cleanup_bot_session(bot, name)
                await asyncio.sleep(delay + random.random() * 5)
                delay = min(delay * 1.5, max_delay)

            else:
                logger.error(
                    "[orchestrator] [%s] HTTPException status=%s (tentative #%d) : %s",
                    name, status_code, attempt, e, exc_info=True,
                )
                await _cleanup_bot_session(bot, name)
                if attempt < 5:
                    wait = delay + random.random() * 5
                    logger.info("[orchestrator] [%s] Retry dans %.0fs...", name, wait)
                    await asyncio.sleep(wait)
                    delay = min(delay * 2, max_delay)
                else:
                    logger.critical(
                        "[orchestrator] [%s] %d echecs consecutifs, abandon definitif.",
                        name, attempt,
                    )
                    raise

        except RuntimeError as e:
            if "Session is closed" in str(e):
                logger.error(
                    "[orchestrator] [%s] Session HTTP fermee (tentative #%d). Retry dans %ds...",
                    name, attempt, delay,
                )
                await _cleanup_bot_session(bot, name)
                await asyncio.sleep(delay + random.random() * 5)
                delay = min(delay * 2, max_delay)
            else:
                logger.error(
                    "[orchestrator] [%s] RuntimeError (tentative #%d) : %s",
                    name, attempt, e, exc_info=True,
                )
                await _cleanup_bot_session(bot, name)
                if attempt < 5:
                    wait = delay + random.random() * 5
                    logger.info("[orchestrator] [%s] Retry dans %.0fs...", name, wait)
                    await asyncio.sleep(wait)
                    delay = min(delay * 2, max_delay)
                else:
                    logger.critical(
                        "[orchestrator] [%s] %d echecs consecutifs, abandon definitif.",
                        name, attempt,
                    )
                    raise

        except Exception as e:
            logger.error(
                "[orchestrator] [%s] Erreur inattendue (tentative #%d) : %s : %s",
                name, attempt, type(e).__name__, e, exc_info=True,
            )
            await _cleanup_bot_session(bot, name)
            if attempt < 5:
                wait = delay + random.random() * 5
                logger.info("[orchestrator] [%s] Retry dans %.0fs...", name, wait)
                await asyncio.sleep(wait)
                delay = min(delay * 2, max_delay)
            else:
                logger.critical(
                    "[orchestrator] [%s] %d echecs consecutifs, abandon definitif.",
                    name, attempt,
                )
                raise


# ==================== NETTOYAGE SESSION ====================

async def _cleanup_bot_session(bot: discord.Client, name: str):
    """Nettoie proprement la session HTTP d'un bot Discord avant un retry."""
    logger.info("[orchestrator] [%s] Debut nettoyage session...", name)
    try:
        if not bot.is_closed():
            logger.info("[orchestrator] [%s] Fermeture du bot...", name)
            await bot.close()
        await asyncio.sleep(1.0)

        if hasattr(bot, "http") and hasattr(bot.http, "_HTTPClient__session"):
            session = bot.http._HTTPClient__session
            if session and not session.closed:
                logger.info("[orchestrator] [%s] Fermeture session HTTP aiohttp...", name)
                await session.close()
            bot.http._HTTPClient__session = None

        logger.info("[orchestrator] [%s] Nettoyage termine", name)
    except Exception as e:
        logger.warning(
            "[orchestrator] [%s] Erreur lors du nettoyage : %s : %s",
            name, type(e).__name__, e,
        )


# ==================== ATTENTE READY ====================

async def wait_ready(bot: discord.Client, name: str, timeout: int = 180):
    """
    Attend que le bot soit pret (Gateway OK).
    Log periodique toutes les 15 secondes.
    Leve TimeoutError si le bot n'est pas pret dans les delais.
    """
    start_t        = time.monotonic()
    check_interval = 2.0
    last_log       = -1

    logger.info("[orchestrator] [%s] Attente etat 'ready' (timeout : %ds)...", name, timeout)

    while not bot.is_ready():
        elapsed = time.monotonic() - start_t

        if elapsed > timeout:
            logger.error(
                "[orchestrator] [%s] Timeout apres %ds — bot non pret (is_closed=%s)",
                name, timeout, bot.is_closed(),
            )
            raise TimeoutError(f"{name} n'est pas ready apres {timeout}s")

        elapsed_int = int(elapsed)
        if elapsed_int % 15 == 0 and elapsed_int != last_log and elapsed_int > 0:
            last_log = elapsed_int
            logger.info(
                "[orchestrator] [%s] En attente... (%ds/%ds, is_closed=%s)",
                name, elapsed_int, timeout, bot.is_closed(),
            )

        await asyncio.sleep(check_interval)

    elapsed_total = time.monotonic() - start_t
    logger.info("[orchestrator] [%s] Pret en %.1fs", name, elapsed_total)
