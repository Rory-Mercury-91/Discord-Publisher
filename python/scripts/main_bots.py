import os
import sys
import json
import time
from pathlib import Path

# Chemin pour imports (scripts/ dans le path)
_SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPTS_DIR))

_PYTHON_DIR = _SCRIPTS_DIR.parent  # python/

import asyncio
import logging
import random
from logging.handlers import RotatingFileHandler
from aiohttp import web
from dotenv import load_dotenv

import discord
from discord.http import Route

# Charger .env : _ignored/ prioritaire (fichiers sensibles), puis racine python/
load_dotenv(_PYTHON_DIR / "_ignored" / ".env")
load_dotenv(_PYTHON_DIR / ".env")

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
    get_history,
    account_delete,
    _with_cors,
    _auth_request,
    logging_middleware,
    handle_404,
)

# Configuration de l'encodage pour Windows si nécessaire
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# Dossier logs (python/logs/)
LOG_DIR = _PYTHON_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "bot.log"

# Configuration logging : fichier rotatif + console (publisher_api configure déjà la console)
file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8")
file_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] [%(name)s] %(message)s"))
logging.getLogger().addHandler(file_handler)
logger = logging.getLogger("orchestrator")

# Passer les logs aiohttp.access en WARNING (éviter pollution des logs INFO)
logging.getLogger("aiohttp.access").setLevel(logging.WARNING)

PORT = int(os.getenv("PORT", "8080"))

logger.info("=" * 60)
logger.info("🚀 Orchestrateur en cours d'initialisation")
logger.info(f"📁 Scripts dir : {_SCRIPTS_DIR}")
logger.info(f"📁 Python dir  : {_PYTHON_DIR}")
logger.info(f"📁 Log file    : {LOG_FILE}")
logger.info(f"🌐 Port        : {PORT}")
logger.info("=" * 60)


# -------------------------
# WEB APP (health + API)
# -------------------------
async def health(request):
    frelon_ready = bot_frelon.is_ready()
    publisher_ready = publisher_bot.is_ready()
    publisher_configured = bool(getattr(publisher_config, "configured", False))
    status = {
        "status": "ok",
        "bots": {
            "bot_frelon": frelon_ready,
            "publisher": publisher_ready,
        },
        "publisher_configured": publisher_configured,
        "timestamp": int(time.time()),
    }
    logger.info(
        f"[health] GET / → frelon={frelon_ready}, publisher={publisher_ready}, "
        f"publisher_configured={publisher_configured}"
    )
    return web.json_response(status)


async def get_logs(request):
    """Retourne le fichier de logs complet (protégé par clé API)."""
    # ✅ Utilise le nouveau système d'auth (nouvelle clé + fallback legacy)
    is_valid, _, _, _ = await _auth_request(request, "/api/logs")
    if not is_valid:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    logger.info("[get_logs] Lecture du fichier de logs demandée")

    content = ""
    unique_user_ids = set()
    line_count = 0

    if LOG_FILE.exists():
        try:
            with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
                all_lines = f.readlines()
                line_count = len(all_lines)
                content = "".join(all_lines)

                # Parser les lignes pour extraire les UUID (format: [REQUEST] IP | UUID | ...)
                for line in all_lines:
                    if "[REQUEST]" in line:
                        parts = line.split(" | ")
                        if len(parts) >= 2:
                            user_id = parts[1].strip()
                            if user_id != "NULL" and len(user_id) >= 32 and "-" in user_id:
                                unique_user_ids.add(user_id)

            logger.info(
                f"[get_logs] ✅ {line_count} lignes lues, "
                f"{len(unique_user_ids)} UUID unique(s) détecté(s)"
            )
        except Exception as e:
            logger.warning(f"[get_logs] ❌ Erreur lecture logs: {e}")
            content = f"[Erreur lecture: {e}]"
    else:
        logger.warning(f"[get_logs] ⚠️ Fichier log introuvable: {LOG_FILE}")

    return _with_cors(request, web.json_response({
        "ok": True,
        "logs": content,
        "unique_user_ids": list(unique_user_ids)
    }))


async def reset_password_page(request):
    """Page de réinitialisation du mot de passe (HTML)."""
    client_ip = request.headers.get("X-Forwarded-For", request.remote or "unknown").split(",")[0].strip()
    logger.info(f"[reset_password] Accès depuis {client_ip}")

    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")

    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        logger.error("[reset_password] ❌ SUPABASE_URL ou SUPABASE_ANON_KEY manquant dans .env")
        return web.Response(
            text="<h1>Configuration manquante</h1><p>Les variables Supabase ne sont pas configurées sur le serveur.</p>",
            content_type='text/html',
            status=500
        )

    logger.info(f"[reset_password] ✅ Page servie (SUPABASE_URL={SUPABASE_URL[:30]}...)")

    supabase_url_json = json.dumps(SUPABASE_URL)
    supabase_key_json = json.dumps(SUPABASE_ANON_KEY)

    html_content = f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Réinitialisation du mot de passe - Discord Publisher</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }}
    .container {{
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 440px;
      width: 100%;
      padding: 40px;
    }}
    h1 {{ font-size: 24px; color: #1f2937; margin-bottom: 8px; text-align: center; }}
    .subtitle {{ font-size: 14px; color: #6b7280; text-align: center; margin-bottom: 32px; }}
    .form-group {{ margin-bottom: 20px; }}
    label {{ display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 8px; }}
    input {{
      width: 100%; padding: 12px 14px;
      border: 2px solid #e5e7eb; border-radius: 8px;
      font-size: 14px; transition: all 0.2s;
    }}
    input:focus {{ outline: none; border-color: #667eea; }}
    .hint {{ font-size: 12px; color: #6b7280; margin-top: 4px; }}
    button {{
      width: 100%; padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white; border: none; border-radius: 8px;
      font-size: 16px; font-weight: 600; cursor: pointer; transition: transform 0.2s;
    }}
    button:hover:not(:disabled) {{ transform: translateY(-2px); }}
    button:disabled {{ opacity: 0.6; cursor: not-allowed; }}
    .message {{
      padding: 12px 16px; border-radius: 8px;
      font-size: 14px; margin-bottom: 20px; display: none;
    }}
    .message.success {{ background: #d1fae5; color: #065f46; border: 1px solid #10b981; display: block; }}
    .message.error {{ background: #fee2e2; color: #991b1b; border: 1px solid #ef4444; display: block; }}
    .footer {{ text-align: center; margin-top: 24px; font-size: 13px; color: #6b7280; }}
    .loading {{ text-align: center; padding: 20px; color: #6b7280; }}
    .spinner {{
      border: 3px solid #f3f4f6; border-top: 3px solid #667eea;
      border-radius: 50%; width: 40px; height: 40px;
      animation: spin 1s linear infinite; margin: 0 auto 16px;
    }}
    @keyframes spin {{ 0% {{ transform: rotate(0deg); }} 100% {{ transform: rotate(360deg); }} }}
  </style>
</head>
<body>
  <div class="container">
    <h1>🔒 Nouveau mot de passe</h1>
    <p class="subtitle">Choisissez un nouveau mot de passe sécurisé</p>
    <div id="message" class="message"></div>
    <div id="loading" class="loading">
      <div class="spinner"></div>
      <p>Vérification du lien de réinitialisation...</p>
    </div>
    <form id="resetForm" style="display: none;">
      <div class="form-group">
        <label for="password">Nouveau mot de passe</label>
        <input type="password" id="password" placeholder="••••••••" required minlength="6" autocomplete="new-password">
        <div class="hint">Minimum 6 caractères</div>
      </div>
      <div class="form-group">
        <label for="confirmPassword">Confirmer le mot de passe</label>
        <input type="password" id="confirmPassword" placeholder="••••••••" required minlength="6" autocomplete="new-password">
      </div>
      <button type="submit" id="submitBtn">Réinitialiser le mot de passe</button>
    </form>
    <div class="footer">Une fois modifié, retournez dans l'application pour vous connecter.</div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script>
    (function() {{
      const SUPABASE_URL = {supabase_url_json};
      const SUPABASE_ANON_KEY = {supabase_key_json};
      const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const form = document.getElementById('resetForm');
      const submitBtn = document.getElementById('submitBtn');
      const messageDiv = document.getElementById('message');
      const loadingDiv = document.getElementById('loading');
      function showMessage(text, type) {{
        messageDiv.textContent = text;
        messageDiv.className = `message ${{type}}`;
        messageDiv.style.display = 'block';
      }}
      function hideLoading() {{ loadingDiv.style.display = 'none'; }}
      function showForm() {{ form.style.display = 'block'; document.getElementById('password').focus(); }}
      function parseHashParams() {{
        const hash = window.location.hash.substring(1);
        const params = {{}};
        if (!hash) return params;
        hash.split('&').forEach(pair => {{
          const [key, value] = pair.split('=');
          if (key && value) params[decodeURIComponent(key)] = decodeURIComponent(value);
        }});
        return params;
      }}
      async function initPasswordReset() {{
        try {{
          const hashParams = parseHashParams();
          if (!hashParams.access_token) {{
            hideLoading();
            showMessage('Lien invalide : token manquant.', 'error');
            return;
          }}
          if (hashParams.type !== 'recovery') {{
            hideLoading();
            showMessage('Lien invalide : type incorrect.', 'error');
            return;
          }}
          const {{ data, error }} = await supabaseClient.auth.setSession({{
            access_token: hashParams.access_token,
            refresh_token: hashParams.refresh_token || ''
          }});
          if (error) {{
            hideLoading();
            showMessage(`Erreur : ${{error.message}}. Le lien est peut-être expiré (valide 1h).`, 'error');
            return;
          }}
          if (!data.session) {{
            hideLoading();
            showMessage('Impossible d\\'établir la session. Le lien est peut-être expiré.', 'error');
            return;
          }}
          hideLoading();
          showForm();
        }} catch (err) {{
          hideLoading();
          showMessage(`Erreur inattendue : ${{err.message}}`, 'error');
        }}
      }}
      initPasswordReset();
      form.addEventListener('submit', async (e) => {{
        e.preventDefault();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        if (password !== confirmPassword) {{ showMessage('Les mots de passe ne correspondent pas', 'error'); return; }}
        if (password.length < 6) {{ showMessage('Le mot de passe doit faire au moins 6 caractères', 'error'); return; }}
        submitBtn.disabled = true;
        submitBtn.textContent = 'Réinitialisation...';
        try {{
          const {{ data, error }} = await supabaseClient.auth.updateUser({{ password: password }});
          if (error) {{
            showMessage(`Erreur : ${{error.message}}`, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Réinitialiser le mot de passe';
            return;
          }}
          showMessage('✅ Mot de passe modifié avec succès ! Vous pouvez maintenant retourner dans l\\'application.', 'success');
          form.style.display = 'none';
          await supabaseClient.auth.signOut();
          setTimeout(() => {{ window.close(); }}, 3000);
        }} catch (err) {{
          showMessage(`Erreur inattendue : ${{err.message}}`, 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Réinitialiser le mot de passe';
        }}
      }});
    }})();
  </script>
</body>
</html>"""

    return web.Response(text=html_content, content_type='text/html')


def make_app():
    app = web.Application(middlewares=[logging_middleware])

    routes = [
        ("OPTIONS", "/{tail:.*}",            options_handler),
        ("GET",     "/",                      health),
        ("GET",     "/api/status",            health),
        ("GET",     "/reset-password",        reset_password_page),
        ("POST",    "/api/configure",         configure),
        ("POST",    "/api/forum-post",        forum_post),
        ("POST",    "/api/forum-post/update", forum_post_update),
        ("POST",    "/api/forum-post/delete", forum_post_delete),
        ("GET",     "/api/publisher/health",  publisher_health),
        ("GET",     "/api/history",           get_history),
        ("GET",     "/api/logs",              get_logs),
        ("POST",    "/api/account/delete",    account_delete),
        # ↓ CATCH-ALL en dernier
        ("*",       "/{tail:.*}",             handle_404),
    ]

    for method, path, handler in routes:
        app.router.add_route(method, path, handler)
        logger.info(f"  ✅ {method:7s} {path}")

    logger.info(f"🌐 [make_app] {len(routes)} route(s) enregistrée(s)")
    return app


# -------------------------
# BOT START (anti 429 + correction session)
# -------------------------
async def start_bot_with_backoff(bot: discord.Client, token: str, name: str):
    """
    Démarre un bot Discord avec retry/backoff exponentiel.
    Réinitialise la session HTTP avant chaque tentative.
    """
    delay = 30
    max_delay = 300
    attempt = 0

    while True:
        attempt += 1
        logger.info(f"🔌 [{name}] Tentative de connexion #{attempt} (délai suivant si échec: {delay:.0f}s)...")

        try:
            # Vérifier l'état de la session HTTP
            if hasattr(bot, 'http') and bot.http._HTTPClient__session:
                if bot.http._HTTPClient__session.closed:
                    logger.warning(f"⚠️ [{name}] Session HTTP fermée détectée avant connexion, réinitialisation...")
                    bot.http._HTTPClient__session = None

            await bot.start(token)
            logger.info(f"✅ [{name}] start() terminé (arrêt normal)")
            return

        except discord.errors.HTTPException as e:
            status_code = getattr(e, "status", None)

            if status_code == 429:
                retry_after = getattr(e, "retry_after", delay)
                logger.warning(
                    f"⛔ [{name}] 429 Too Many Requests (tentative #{attempt}). "
                    f"Retry dans {retry_after:.0f}s..."
                )
                await _cleanup_bot_session(bot, name)
                await asyncio.sleep(retry_after + random.random() * 2)

            elif status_code in [502, 503, 504]:
                logger.warning(
                    f"⚠️ [{name}] Erreur serveur Discord {status_code} (tentative #{attempt}). "
                    f"Retry dans {delay:.0f}s..."
                )
                await _cleanup_bot_session(bot, name)
                await asyncio.sleep(delay + random.random() * 5)
                delay = min(delay * 1.5, max_delay)

            else:
                logger.error(f"❌ [{name}] HTTPException status={status_code} (tentative #{attempt}): {e}", exc_info=True)
                await _cleanup_bot_session(bot, name)
                if attempt < 5:
                    wait = delay + random.random() * 5
                    logger.info(f"⏳ [{name}] Retry dans {wait:.0f}s...")
                    await asyncio.sleep(wait)
                    delay = min(delay * 2, max_delay)
                else:
                    logger.critical(f"🛑 [{name}] {attempt} échecs consécutifs, abandon définitif.")
                    raise

        except RuntimeError as e:
            error_msg = str(e)
            if "Session is closed" in error_msg:
                logger.error(
                    f"❌ [{name}] Session HTTP fermée (tentative #{attempt}). "
                    f"Nettoyage et retry dans {delay:.0f}s..."
                )
                await _cleanup_bot_session(bot, name)
                await asyncio.sleep(delay + random.random() * 5)
                delay = min(delay * 2, max_delay)
            else:
                logger.error(f"❌ [{name}] RuntimeError (tentative #{attempt}): {e}", exc_info=True)
                await _cleanup_bot_session(bot, name)
                if attempt < 5:
                    wait = delay + random.random() * 5
                    logger.info(f"⏳ [{name}] Retry dans {wait:.0f}s...")
                    await asyncio.sleep(wait)
                    delay = min(delay * 2, max_delay)
                else:
                    logger.critical(f"🛑 [{name}] {attempt} échecs consécutifs, abandon définitif.")
                    raise

        except Exception as e:
            logger.error(
                f"❌ [{name}] Erreur inattendue (tentative #{attempt}): {type(e).__name__}: {e}",
                exc_info=True
            )
            await _cleanup_bot_session(bot, name)
            if attempt < 5:
                wait = delay + random.random() * 5
                logger.info(f"⏳ [{name}] Retry dans {wait:.0f}s...")
                await asyncio.sleep(wait)
                delay = min(delay * 2, max_delay)
            else:
                logger.critical(f"🛑 [{name}] {attempt} échecs consécutifs, abandon définitif.")
                raise


async def _cleanup_bot_session(bot: discord.Client, name: str):
    """Nettoie proprement la session HTTP d'un bot Discord avant un retry."""
    logger.info(f"🧹 [{name}] Début du nettoyage de session...")
    try:
        if not bot.is_closed():
            logger.info(f"🧹 [{name}] Fermeture du bot...")
            await bot.close()
        await asyncio.sleep(1.0)

        if hasattr(bot, 'http') and hasattr(bot.http, '_HTTPClient__session'):
            session = bot.http._HTTPClient__session
            if session and not session.closed:
                logger.info(f"🧹 [{name}] Fermeture de la session HTTP aiohttp...")
                await session.close()
            bot.http._HTTPClient__session = None

        logger.info(f"✅ [{name}] Nettoyage terminé")
    except Exception as e:
        logger.warning(f"⚠️ [{name}] Erreur lors du nettoyage: {type(e).__name__}: {e}")


async def wait_ready(bot: discord.Client, name: str, timeout: int = 180):
    """
    Attend que le bot soit prêt (Gateway OK).
    Log périodique toutes les 15 secondes.
    Lève TimeoutError si le bot n'est pas prêt dans les délais.
    """
    start_t = time.monotonic()
    check_interval = 2.0
    last_log = -1

    logger.info(f"⏳ [{name}] Attente de l'état 'ready' (timeout: {timeout}s)...")

    while not bot.is_ready():
        elapsed = time.monotonic() - start_t

        if elapsed > timeout:
            logger.error(
                f"❌ [{name}] Timeout après {timeout}s — bot non prêt. "
                f"is_closed={bot.is_closed()}"
            )
            raise TimeoutError(f"{name} n'est pas ready après {timeout}s")

        # Log toutes les 15 secondes
        elapsed_int = int(elapsed)
        if elapsed_int % 15 == 0 and elapsed_int != last_log and elapsed_int > 0:
            last_log = elapsed_int
            logger.info(
                f"⏳ [{name}] En attente... ({elapsed_int}s/{timeout}s) "
                f"is_closed={bot.is_closed()}"
            )

        await asyncio.sleep(check_interval)

    elapsed_total = time.monotonic() - start_t
    logger.info(f"✅ [{name}] Prêt en {elapsed_total:.1f}s")


# -------------------------
# ORCHESTRATOR
# -------------------------
async def start():
    TOKEN_FRELON = os.getenv("FRELON_DISCORD_TOKEN")
    TOKEN_PUB = os.getenv("PUBLISHER_DISCORD_TOKEN")

    logger.info("=" * 60)
    logger.info("🚀 Démarrage de l'orchestrateur")
    logger.info(f"   Bot Frelon               : {'✓ token présent' if TOKEN_FRELON else '✗ MANQUANT'}")
    logger.info(f"   Publisher Bot            : {'✓ token présent' if TOKEN_PUB else '⚠ absent (attente config)'}")
    logger.info(f"   Publisher configured     : {getattr(publisher_config, 'configured', False)}")
    logger.info(f"   Forum MY ID              : {getattr(publisher_config, 'FORUM_MY_ID', 0)}")
    logger.info(f"   Notif channel ID         : {getattr(publisher_config, 'PUBLISHER_MAJ_NOTIFICATION_CHANNEL_ID', 0)}")
    logger.info(f"   Announce channel ID      : {getattr(publisher_config, 'PUBLISHER_ANNOUNCE_CHANNEL_ID', 0)}")
    logger.info("=" * 60)

    if not TOKEN_FRELON:
        logger.critical("❌ FRELON_DISCORD_TOKEN manquant dans .env — arrêt.")
        return

    # 1) Serveur Web
    logger.info("🌐 Lancement du serveur Web...")
    app = make_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    logger.info(f"✅ Serveur Web démarré sur http://0.0.0.0:{PORT}")

    # 2) Initialisation Supabase (sync dans executor pour ne pas bloquer l'event loop)
    logger.info("🗄️ Initialisation du client Supabase...")
    from publisher_api import _init_supabase
    await asyncio.get_event_loop().run_in_executor(None, _init_supabase)
    logger.info("✅ Client Supabase initialisé")

    # 3) Bot Frelon
    logger.info("=" * 60)
    logger.info("🐝 ÉTAPE 1/2 : Lancement Bot Frelon (F95 Checker)...")
    logger.info("=" * 60)

    frelon_task = asyncio.create_task(
        start_bot_with_backoff(bot_frelon, TOKEN_FRELON, "Bot Frelon"),
        name="task_bot_frelon"
    )

    try:
        await wait_ready(bot_frelon, "Bot Frelon", timeout=180)
        logger.info("✅🐝 Bot Frelon opérationnel")
    except Exception as e:
        logger.error(f"⛔🐝 Bot Frelon n'a pas pu démarrer: {e}")
        logger.critical("🛑 Arrêt de la séquence de démarrage")
        frelon_task.cancel()
        try:
            await frelon_task
        except asyncio.CancelledError:
            logger.info("🧹 Task Bot Frelon annulée proprement")
        return

    # 4) Publisher Bot
    if not TOKEN_PUB:
        logger.warning("⚠️ PUBLISHER_DISCORD_TOKEN absent — attente de configuration via /api/configure (max 180s)...")
        waited = 0
        while not TOKEN_PUB and waited < 180:
            await asyncio.sleep(2)
            waited += 2
            TOKEN_PUB = os.getenv("PUBLISHER_DISCORD_TOKEN") or getattr(publisher_config, "PUBLISHER_DISCORD_TOKEN", "")
            if TOKEN_PUB:
                logger.info(f"✅ Token Publisher reçu après {waited}s")
            elif waited % 30 == 0:
                logger.info(f"⏳ Toujours en attente du token Publisher ({waited}s/180s)...")

    if not TOKEN_PUB:
        logger.error("⛔ PUBLISHER_DISCORD_TOKEN toujours absent après 180s — Publisher Bot non lancé")
        logger.warning("⚠️ Bot Frelon continue de fonctionner seul")
        await asyncio.gather(frelon_task, return_exceptions=True)
        return

    logger.info("=" * 60)
    logger.info("🤖 ÉTAPE 2/2 : Lancement Publisher Bot...")
    logger.info("=" * 60)

    pub_task = asyncio.create_task(
        start_bot_with_backoff(publisher_bot, TOKEN_PUB, "PublisherBot"),
        name="task_publisher_bot"
    )

    try:
        await wait_ready(publisher_bot, "PublisherBot", timeout=180)
        logger.info("✅🤖 PublisherBot opérationnel")
    except Exception as e:
        logger.error(f"⛔🤖 PublisherBot n'a pas pu démarrer: {e}")
        logger.warning("⚠️ Bot Frelon continue de fonctionner seul")
        await asyncio.gather(frelon_task, pub_task, return_exceptions=True)
        return

    # Tous les bots sont prêts
    logger.info("=" * 60)
    logger.info("🎉 TOUS LES BOTS SONT OPÉRATIONNELS")
    logger.info(f"  ✅ Bot Frelon    : {bot_frelon.user} (id={bot_frelon.user.id})")
    logger.info(f"  ✅ PublisherBot  : {publisher_bot.user} (id={publisher_bot.user.id})")
    logger.info(f"  🌐 API REST      : http://0.0.0.0:{PORT}")
    logger.info("=" * 60)

    # Surveiller les tasks et loguer si l'une d'elles se termine inopinément
    done, pending = await asyncio.wait(
        [frelon_task, pub_task],
        return_when=asyncio.FIRST_COMPLETED
    )

    for task in done:
        name = task.get_name()
        exc = task.exception() if not task.cancelled() else None
        if exc:
            logger.critical(f"💥 Task '{name}' terminée avec une exception: {exc}", exc_info=exc)
        elif task.cancelled():
            logger.warning(f"⚠️ Task '{name}' annulée")
        else:
            logger.info(f"ℹ️ Task '{name}' terminée normalement")

    # Attendre la fin des tasks restantes
    if pending:
        logger.info(f"⏳ Attente des {len(pending)} task(s) restante(s)...")
        await asyncio.gather(*pending, return_exceptions=True)

    logger.info("🛑 Orchestrateur arrêté")


if __name__ == "__main__":
    try:
        Route.BASE = "https://discord.com/api/v10"
        logger.info("🛡️ API Discord : https://discord.com/api/v10")
        asyncio.run(start())
    except KeyboardInterrupt:
        logger.info("🛑 Arrêt manuel (KeyboardInterrupt)")
    except Exception as e:
        logger.critical(f"💥 Erreur fatale dans l'orchestrateur: {e}", exc_info=True)
        sys.exit(1)
