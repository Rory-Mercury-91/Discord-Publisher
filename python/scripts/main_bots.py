import os
import sys
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
    logging_middleware,
)


# Configuration de l'encodage pour Windows si nécessaire
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# Dossier logs (python/logs/)
LOG_DIR = _PYTHON_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "bot.log"

# Configuration logging : ajouter fichier à la console (publisher_api configure déjà la console)
file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8")
file_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] [%(name)s] %(message)s"))
logging.getLogger().addHandler(file_handler)
logger = logging.getLogger("orchestrator")

# Passer les logs aiohttp.access en DEBUG (éviter pollution des logs INFO)
logging.getLogger("aiohttp.access").setLevel(logging.WARNING)

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


async def get_logs(request):
    """Retourne le fichier de logs complet (admin, protégé par clé API)."""
    api_key = request.headers.get("X-API-KEY") or request.query.get("api_key")
    if api_key != publisher_config.PUBLISHER_API_KEY:
        # Extraction IP pour logging (helper depuis publisher_api)
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()
        else:
            client_ip = request.headers.get("X-Real-IP") or request.remote or "unknown"
        logger.warning(f"[AUTH] 🚫 API Auth failed from {client_ip} - Invalid API key (route: /api/logs)")
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    
    content = ""
    unique_user_ids = set()
    
    if LOG_FILE.exists():
        try:
            with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
                # ✅ Lire TOUT le fichier (pas de limitation)
                all_lines = f.readlines()
                content = "".join(all_lines)
                
                # Parser les lignes pour extraire les UUID (format: [REQUEST] IP | UUID | ...)
                for line in all_lines:
                    if "[REQUEST]" in line:
                        # Format attendu: [REQUEST] IP | UUID | METHOD PATH
                        parts = line.split(" | ")
                        if len(parts) >= 2:
                            user_id = parts[1].strip()
                            # Vérifier que c'est un UUID (format basique)
                            if user_id != "NULL" and len(user_id) >= 32 and "-" in user_id:
                                unique_user_ids.add(user_id)
        except Exception as e:
            logger.warning(f"Erreur lecture logs: {e}")
            content = f"[Erreur lecture: {e}]"
    
    return _with_cors(request, web.json_response({
        "ok": True,
        "logs": content,
        "unique_user_ids": list(unique_user_ids)  # Liste des UUID pour lookup frontend
    }))

import json  # Ajouter en haut du fichier si pas déjà présent

async def reset_password_page(request):
    """Page de réinitialisation du mot de passe (HTML)."""
    
    # ✅ Récupération depuis .env
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
    
    # 🔍 DEBUG
    logger.info(f"🔍 SUPABASE_URL: {SUPABASE_URL}")
    logger.info(f"🔍 SUPABASE_ANON_KEY length: {len(SUPABASE_ANON_KEY)} chars")
    
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        logger.error("❌ SUPABASE_URL ou SUPABASE_ANON_KEY manquant dans .env")
        return web.Response(
            text="<h1>Configuration manquante</h1><p>Les variables Supabase ne sont pas configurées sur le serveur.</p>",
            content_type='text/html',
            status=500
        )
    
    # ✅ ÉCHAPPEMENT JSON SÉCURISÉ
    supabase_url_json = json.dumps(SUPABASE_URL)
    supabase_key_json = json.dumps(SUPABASE_ANON_KEY)
    
    html_content = f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Réinitialisation du mot de passe - Discord Publisher</title>
  <style>
    * {{
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }}
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
    h1 {{
      font-size: 24px;
      color: #1f2937;
      margin-bottom: 8px;
      text-align: center;
    }}
    .subtitle {{
      font-size: 14px;
      color: #6b7280;
      text-align: center;
      margin-bottom: 32px;
    }}
    .form-group {{
      margin-bottom: 20px;
    }}
    label {{
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 8px;
    }}
    input {{
      width: 100%;
      padding: 12px 14px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 14px;
      transition: all 0.2s;
    }}
    input:focus {{
      outline: none;
      border-color: #667eea;
    }}
    .hint {{
      font-size: 12px;
      color: #6b7280;
      margin-top: 4px;
    }}
    button {{
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s;
    }}
    button:hover:not(:disabled) {{
      transform: translateY(-2px);
    }}
    button:disabled {{
      opacity: 0.6;
      cursor: not-allowed;
    }}
    .message {{
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      margin-bottom: 20px;
      display: none;
    }}
    .message.success {{
      background: #d1fae5;
      color: #065f46;
      border: 1px solid #10b981;
      display: block;
    }}
    .message.error {{
      background: #fee2e2;
      color: #991b1b;
      border: 1px solid #ef4444;
      display: block;
    }}
    .footer {{
      text-align: center;
      margin-top: 24px;
      font-size: 13px;
      color: #6b7280;
    }}
    .loading {{
      text-align: center;
      padding: 20px;
      color: #6b7280;
    }}
    .spinner {{
      border: 3px solid #f3f4f6;
      border-top: 3px solid #667eea;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }}
    @keyframes spin {{
      0% {{ transform: rotate(0deg); }}
      100% {{ transform: rotate(360deg); }}
    }}
  </style>
</head>
<body>
  <div class="container">
    <h1>🔑 Nouveau mot de passe</h1>
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

    <div class="footer">
      Une fois modifié, retournez dans l'application pour vous connecter.
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script>
    (function() {{
      // ✅ UTILISER json.dumps() POUR ÉCHAPPEMENT SÉCURISÉ
      const SUPABASE_URL = {supabase_url_json};
      const SUPABASE_ANON_KEY = {supabase_key_json};

      console.log('Supabase URL:', SUPABASE_URL);
      console.log('Anon Key length:', SUPABASE_ANON_KEY.length);

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

      function hideLoading() {{
        loadingDiv.style.display = 'none';
      }}

      function showForm() {{
        form.style.display = 'block';
        document.getElementById('password').focus();
      }}

      function parseHashParams() {{
        const hash = window.location.hash.substring(1);
        const params = {{}};
        
        if (!hash) return params;
        
        hash.split('&').forEach(pair => {{
          const [key, value] = pair.split('=');
          if (key && value) {{
            params[decodeURIComponent(key)] = decodeURIComponent(value);
          }}
        }});
        
        return params;
      }}

      async function initPasswordReset() {{
        try {{
          const hashParams = parseHashParams();
          
          console.log('Hash params:', hashParams);
          
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
            console.error('Session error:', error);
            hideLoading();
            showMessage(`Erreur : ${{error.message}}. Le lien est peut-être expiré (valide 1h).`, 'error');
            return;
          }}

          if (!data.session) {{
            hideLoading();
            showMessage('Impossible d\\'établir la session. Le lien est peut-être expiré.', 'error');
            return;
          }}

          console.log('Session établie:', data.session.user.email);
          hideLoading();
          showForm();

        }} catch (err) {{
          console.error('Exception:', err);
          hideLoading();
          showMessage(`Erreur inattendue : ${{err.message}}`, 'error');
        }}
      }}

      initPasswordReset();

      form.addEventListener('submit', async (e) => {{
        e.preventDefault();

        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (password !== confirmPassword) {{
          showMessage('Les mots de passe ne correspondent pas', 'error');
          return;
        }}

        if (password.length < 6) {{
          showMessage('Le mot de passe doit faire au moins 6 caractères', 'error');
          return;
        }}

        submitBtn.disabled = true;
        submitBtn.textContent = 'Réinitialisation...';

        try {{
          const {{ data, error }} = await supabaseClient.auth.updateUser({{ 
            password: password 
          }});

          if (error) {{
            console.error('Update error:', error);
            showMessage(`Erreur : ${{error.message}}`, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Réinitialiser le mot de passe';
            return;
          }}

          console.log('Password updated successfully');
          showMessage('✅ Mot de passe modifié avec succès ! Vous pouvez maintenant retourner dans l\\'application.', 'success');
          form.style.display = 'none';
          
          await supabaseClient.auth.signOut();
          
          setTimeout(() => {{
            window.close();
          }}, 3000);

        }} catch (err) {{
          console.error('Exception:', err);
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

    # OPTIONS global (CORS) : couvre toutes les routes (status/health/history inclus)
    app.router.add_route("OPTIONS", "/{tail:.*}", options_handler)

    # Health / Status
    app.router.add_get("/", health)
    app.router.add_get("/api/status", health)

    # ROUTE RESET PASSWORD
    app.router.add_get("/reset-password", reset_password_page)

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
    app.router.add_get("/api/logs", get_logs)
    app.router.add_post("/api/account/delete", account_delete)

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
        # API Discord officielle pour tous les bots — le serveur Oracle communique en direct
        Route.BASE = "https://discord.com/api/v10"
        logger.info("🛡️  Configuration : Bots et API en direct vers Discord.")

        asyncio.run(start())
    except KeyboardInterrupt:
        logger.info("🛑 Arrêt de l'orchestrateur (KeyboardInterrupt)")
    except Exception as e:
        logger.critical(f"💥 Erreur fatale dans l'orchestrateur: {e}", exc_info=True)
        sys.exit(1)
