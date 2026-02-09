"""
API Publisher - Version Bot Discord Hybride avec Contrôle de Versions
- API REST pour publication depuis l'application frontend
- Bot Discord avec commandes slash pour contrôle manuel
- Tâche quotidienne automatique à 6h pour contrôle des versions F95
- Modification automatique des posts + notifications groupées
"""

import os
import sys
import json
import time
import base64
import asyncio
import logging
import datetime
import random
import re
from datetime import datetime as dt
from typing import Optional, Tuple, List, Dict
from pathlib import Path
from zoneinfo import ZoneInfo

import aiohttp
from aiohttp import web
from dotenv import load_dotenv

# ==================== LOGGING ====================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] [%(name)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("publisher")

# Discord imports
import discord
from discord.ext import commands, tasks
from discord import app_commands

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

# Charger .env : _ignored/ prioritaire, puis racine python/
from pathlib import Path as _Path
_python_dir = _Path(__file__).resolve().parent.parent
load_dotenv(_python_dir / "_ignored" / ".env")
load_dotenv(_python_dir / ".env")

# ==================== SUPABASE (source de vérité published_posts) ====================
# Import au niveau module pour éviter le lazy loading bloquant
try:
    from supabase import create_client
    _SUPABASE_AVAILABLE = True
except ImportError:
    _SUPABASE_AVAILABLE = False
    logger.warning("⚠️ Module supabase non installé")

_supabase_client = None

def _init_supabase():
    """Initialise le client Supabase au démarrage (non-bloquant pour l'event loop)."""
    global _supabase_client
    if not _SUPABASE_AVAILABLE:
        return None
    url = (os.getenv("SUPABASE_URL") or "").strip()
    # Service Role Key pour le serveur (bypass RLS) ; fallback sur Anon Key si absente
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or "").strip()
    if not url or not key:
        logger.info("ℹ️ Supabase non configuré (SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY manquants)")
        return None
    try:
        _supabase_client = create_client(url, key)
        logger.info("✅ Client Supabase initialisé")
        return _supabase_client
    except Exception as e:
        logger.warning(f"⚠️ Échec initialisation Supabase: {e}")
        return None

def _get_supabase():
    """Retourne le client Supabase (déjà initialisé au démarrage)."""
    return _supabase_client


def _delete_from_supabase_sync(thread_id: str = None, post_id: str = None) -> bool:
    """
    🔥 Supprime un post de Supabase par thread_id ou post_id (synchrone).
    Retourne True si la suppression a réussi, False sinon.
    """
    sb = _get_supabase()
    if not sb:
        logger.warning("⚠️ Client Supabase non initialisé")
        return False
    
    if not thread_id and not post_id:
        logger.warning("⚠️ Aucun identifiant fourni pour la suppression Supabase")
        return False
    
    try:
        # API Supabase Python: .delete() AVANT .eq()
        if post_id:
            result = sb.table("published_posts").delete().eq("id", post_id).execute()
        else:
            result = sb.table("published_posts").delete().eq("thread_id", str(thread_id)).execute()
        
        # Vérifier le résultat
        deleted_count = len(result.data) if result.data else 0
        
        if deleted_count > 0:
            logger.info(f"✅ {deleted_count} post(s) supprimé(s) de Supabase (thread_id={thread_id}, id={post_id})")
            return True
        else:
            logger.info(f"ℹ️ Aucun post trouvé dans Supabase avec thread_id={thread_id} ou id={post_id}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Erreur lors de la suppression Supabase: {e}")
        return False


def _fetch_post_by_thread_id_sync(thread_id) -> Optional[Dict]:
    """Récupère la ligne published_posts par thread_id (source de vérité). Retourne None si absent."""
    sb = _get_supabase()
    if not sb:
        return None
    try:
        r = sb.table("published_posts").select("*").eq("thread_id", str(thread_id)).order("updated_at", desc=True).limit(1).execute()
        if r.data and len(r.data) > 0:
            return r.data[0]
    except Exception as e:
        logger.warning(f"⚠️ Supabase fetch_post_by_thread_id: {e}")
    return None


def _parse_saved_inputs(row: Dict) -> Dict:
    """Retourne saved_inputs comme dict (parse si Supabase renvoie une chaîne json)."""
    raw = row.get("saved_inputs")
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw) if raw.strip() else {}
        except Exception:
            return {}
    return {}


def _metadata_from_row(row: Dict, new_game_version: Optional[str] = None) -> Optional[str]:
    """Construit metadata_b64 à partir d'une ligne published_posts (saved_inputs + colonnes)."""
    saved = _parse_saved_inputs(row)
    version = new_game_version if new_game_version is not None else (saved.get("Game_version") or "")
    metadata = {
        "game_name": (saved.get("Game_name") or row.get("title") or "").strip(),
        "game_version": version.strip(),
        "translate_version": (saved.get("Translate_version") or "").strip(),
        "translation_type": (row.get("translation_type") or "").strip(),
        "is_integrated": bool(row.get("is_integrated", False)),
        "timestamp": int(time.time() * 1000),
    }
    try:
        metadata_json = json.dumps(metadata, ensure_ascii=False)
        return base64.b64encode(metadata_json.encode("utf-8")).decode("utf-8")
    except Exception:
        return None


# ==================== LOGGING ====================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] [%(name)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("publisher")

# ==================== CONFIGURATION ====================
# Un seul salon "my" : FORUM = salon qui reçoit les posts, MAJ_NOTIFICATION = salon des alertes version
class Config:
    def __init__(self):
        # API REST
        self.PUBLISHER_DISCORD_TOKEN = os.getenv("PUBLISHER_DISCORD_TOKEN", "")
        self.PUBLISHER_API_KEY = os.getenv("PUBLISHER_API_KEY", "")
        self.ALLOWED_ORIGINS = os.getenv("PUBLISHER_ALLOWED_ORIGINS", "*")
        self.PORT = int(os.getenv("PORT", "8080"))
        # API Discord officielle (https://discord.com/api/v10) — le serveur Oracle communique en direct
        self.DISCORD_API_BASE = os.getenv("DISCORD_API_BASE", "https://discord.com/api/v10")
        
        # Salon unique "my" : forum qui reçoit les posts (publication + contrôle versions)
        self.FORUM_MY_ID = int(os.getenv("PUBLISHER_FORUM_TRAD_ID", "0")) if os.getenv("PUBLISHER_FORUM_TRAD_ID") else 0
        if not self.FORUM_MY_ID and os.getenv("FORUM_CHANNEL_ID"):
            self.FORUM_MY_ID = int(os.getenv("FORUM_CHANNEL_ID", "0"))
        
        # Salon qui reçoit les notifications de mise à jour de version
        self.PUBLISHER_MAJ_NOTIFICATION_CHANNEL_ID = int(os.getenv("PUBLISHER_MAJ_NOTIFICATION_CHANNEL_ID", "0")) if os.getenv("PUBLISHER_MAJ_NOTIFICATION_CHANNEL_ID") else 0
        # Salon qui reçoit les annonces (nouvelle traduction / mise à jour)
        self.PUBLISHER_ANNOUNCE_CHANNEL_ID = int(os.getenv("PUBLISHER_ANNOUNCE_CHANNEL_ID", "0")) if os.getenv("PUBLISHER_ANNOUNCE_CHANNEL_ID") else 0
        
        # Planification
        self.VERSION_CHECK_HOUR = int(os.getenv("VERSION_CHECK_HOUR", "6"))
        self.VERSION_CHECK_MINUTE = int(os.getenv("VERSION_CHECK_MINUTE", "0"))
        self.CLEANUP_EMPTY_MESSAGES_HOUR = int(os.getenv("CLEANUP_EMPTY_MESSAGES_HOUR", "4"))
        self.CLEANUP_EMPTY_MESSAGES_MINUTE = int(os.getenv("CLEANUP_EMPTY_MESSAGES_MINUTE", "0"))
        
        self.configured = bool(
            self.PUBLISHER_DISCORD_TOKEN and
            self.FORUM_MY_ID and
            self.PUBLISHER_MAJ_NOTIFICATION_CHANNEL_ID
        )
    
    def update_from_frontend(self, config_data: dict):
        if 'discordPublisherToken' in config_data and config_data['discordPublisherToken']:
            self.PUBLISHER_DISCORD_TOKEN = config_data['discordPublisherToken']
        if 'publisherForumMyId' in config_data and config_data['publisherForumMyId']:
            self.FORUM_MY_ID = int(config_data['publisherForumMyId'])
        self.configured = bool(self.PUBLISHER_DISCORD_TOKEN and self.FORUM_MY_ID and self.PUBLISHER_MAJ_NOTIFICATION_CHANNEL_ID)
        logger.info(f"✅ Configuration mise à jour (configured: {self.configured})")

config = Config()
def get_publisher_token() -> str:
    # 1) env > 2) config en mémoire
    return (os.getenv("PUBLISHER_DISCORD_TOKEN") or config.PUBLISHER_DISCORD_TOKEN or "").strip()

# ==================== DISCORD BOT SETUP ====================
intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents)

# ==================== REGEX PATTERNS ====================
# Pour parsing du contenu texte (fallback si métadonnées absentes)
_RE_GAME_VERSION_MD = re.compile(
    r"^\s*\*\s*\*\*Version\s+du\s+jeu\s*:\s*\*\*\s*`(?P<ver>[^`]+)`\s*$",
    re.IGNORECASE | re.MULTILINE
)
_RE_GAME_LINK_MD = re.compile(
    r"^\s*\*\s*\*\*Lien\s+du\s+jeu\s*:\s*\*\*\s*\[.*?\]\(<(?P<url>https?://[^>]+)>\)\s*$",
    re.IGNORECASE | re.MULTILINE
)

# Version sans markdown (format legacy)
_RE_GAME_VERSION_PLAIN = re.compile(
    r"^\s*Version\s+du\s+jeu\s*:\s*`?(?P<ver>[^`\n]+)`?\s*$",
    re.IGNORECASE | re.MULTILINE
)
_RE_GAME_LINK_PLAIN = re.compile(
    r"^\s*Lien\s+du\s+jeu\s*:\s*\[.*?\]\(<(?P<url>https?://[^)>]+)>\)\s*$",
    re.IGNORECASE | re.MULTILINE
)

# Nouveau format (uniquement lien du jeu) : * [Jeu original](<url>) — pas les autres liens F95 (traduction, etc.)
_RE_GAME_LINK_JEU_ORIGINAL = re.compile(
    r"^\s*\*\s*\[\s*Jeu\s+original\s*\]\s*\(\s*<\s*(?P<url>https?://[^>]+)\s*>\s*\)\s*$",
    re.IGNORECASE | re.MULTILINE
)

# Extraction version depuis titre F95
_RE_BRACKETS = re.compile(r"\[(?P<val>[^\]]+)\]")
# Version dans le nom du thread Discord (ex: "Growing Problems [v0.12]" -> "v0.12")
# Le groupe ver doit capturer tout le contenu y compris le préfixe "v" pour la comparaison avec F95
_RE_VERSION_IN_THREAD_NAME = re.compile(r"\[(?P<ver>v?[^\]]+)\]\s*$", re.IGNORECASE)


def _build_thread_title_with_version(thread_name: str, new_version: str) -> str:
    """Remplace la référence de version entre crochets à la fin du titre par la nouvelle version.
    Ex: 'The Legend of the Goblins [Ch.5]' -> 'The Legend of the Goblins [Ch.6]'
    """
    if not (thread_name and new_version):
        return thread_name or ""
    new_title = _RE_VERSION_IN_THREAD_NAME.sub(f"[{new_version}]", thread_name.strip()).strip()
    return new_title or thread_name

# ==================== STOCKAGE ANTI-DOUBLON ====================
# Structure: {thread_id: {"f95_version": "Ch.7", "timestamp": datetime}}
_notified_versions: Dict[int, Dict] = {}

def _clean_old_notifications():
    """Nettoie les entrées de plus de 30 jours"""
    cutoff = dt.now() - datetime.timedelta(days=30)
    to_remove = [
        tid for tid, data in _notified_versions.items()
        if data.get("timestamp", dt.min) < cutoff
    ]
    for tid in to_remove:
        del _notified_versions[tid]
    if to_remove:
        logger.info(f"🧹 Nettoyage anti-doublon: {len(to_remove)} entrées supprimées")

def _is_already_notified(thread_id: int, f95_version: str) -> bool:
    """Vérifie si cette version a déjà été notifiée pour ce thread"""
    if thread_id not in _notified_versions:
        return False
    return _notified_versions[thread_id].get("f95_version") == f95_version

def _mark_as_notified(thread_id: int, f95_version: str):
    """Marque cette version comme notifiée"""
    _notified_versions[thread_id] = {
        "f95_version": f95_version,
        "timestamp": dt.now()
    }

# ==================== HISTORIQUE PUBLICATIONS ====================
# Aligné sur Supabase : tous les champs (saved_inputs, saved_link_configs, etc.) sont stockés et renvoyés.
HISTORY_FILE = Path("publication_history.json")

def _normalize_history_row(row: Dict) -> Dict:
    """Garantit les clés snake_case attendues par le frontend (rowToPost)."""
    if not row:
        return row
    # Accepte camelCase entrant et renvoie snake_case pour cohérence avec Supabase
    alias = {
        "threadId": "thread_id", "messageId": "message_id", "discordUrl": "discord_url",
        "forumId": "forum_id", "imagePath": "image_path", "translationType": "translation_type",
        "isIntegrated": "is_integrated", "authorDiscordId": "author_discord_id",
        "savedInputs": "saved_inputs", "savedLinkConfigs": "saved_link_configs",
        "savedAdditionalTranslationLinks": "saved_additional_translation_links",
        "savedAdditionalModLinks": "saved_additional_mod_links", "templateId": "template_id",
        "createdAt": "created_at", "updatedAt": "updated_at",
    }
    out = dict(row)
    for camel, snake in alias.items():
        if camel in out and snake not in out:
            out[snake] = out.pop(camel)
    return out


class PublicationHistory:
    def __init__(self, history_file: Path = HISTORY_FILE):
        self.history_file = history_file
        self._ensure_file_exists()

    def _ensure_file_exists(self):
        if not self.history_file.exists():
            try:
                self.history_file.parent.mkdir(parents=True, exist_ok=True)
                self.history_file.write_text(json.dumps([], ensure_ascii=False, indent=2), encoding='utf-8')
            except Exception as e:
                logger.warning(f"Impossible de créer le fichier d'historique: {e}")

    def update_or_add_post(self, post_data: Dict) -> None:
        """
        Ajoute ou met à jour un post dans l'historique (aligné Supabase).
        Si post_data a thread_id et qu'un post avec ce thread_id existe, il est remplacé ; sinon insertion en tête.
        Tous les champs (saved_inputs, saved_link_configs, etc.) sont conservés tels quels.
        """
        post_data = _normalize_history_row(post_data)
        try:
            if self.history_file.exists():
                content = self.history_file.read_text(encoding='utf-8')
                history = json.loads(content) if content.strip() else []
            else:
                history = []

            thread_id = post_data.get("thread_id") or ""
            if thread_id:
                history = [p for p in history if (p.get("thread_id") or "") != thread_id]
            history.insert(0, post_data)
            if len(history) > 1000:
                history = history[:1000]

            self.history_file.write_text(
                json.dumps(history, ensure_ascii=False, indent=2),
                encoding='utf-8'
            )
            logger.info(f"✅ Post enregistré dans l'historique: {post_data.get('title', 'N/A')}")
        except Exception as e:
            logger.error(f"Erreur lors de l'enregistrement dans l'historique: {e}")

    def add_post(self, post_data: Dict) -> None:
        """Rétrocompatibilité : délègue à update_or_add_post."""
        self.update_or_add_post(post_data)

    def get_posts(self, limit: Optional[int] = None) -> List[Dict]:
        """Retourne la liste complète des posts (tous champs, snake_case)."""
        try:
            if not self.history_file.exists():
                return []
            content = self.history_file.read_text(encoding='utf-8')
            history = json.loads(content) if content.strip() else []
            out = [_normalize_history_row(p) for p in history]
            return out[:limit] if limit else out
        except Exception as e:
            logger.error(f"Erreur lors de la lecture de l'historique: {e}")
            return []
    
    def delete_post(self, thread_id: str = None, post_id: str = None) -> bool:
        """
        Supprime un post de l'historique local (JSON) par thread_id ou id.
        ⚠️ Ne supprime PAS de Supabase (utilisez _delete_from_supabase_sync pour ça)
        Retourne True si un post a été supprimé, False sinon.
        """
        if not thread_id and not post_id:
            logger.warning("⚠️ delete_post: aucun identifiant fourni")
            return False
        
        try:
            if not self.history_file.exists():
                return False
            
            content = self.history_file.read_text(encoding='utf-8')
            history = json.loads(content) if content.strip() else []
            initial_count = len(history)
            
            # Filtrer les posts à supprimer
            if thread_id:
                history = [p for p in history if (p.get("thread_id") or "") != thread_id]
            if post_id:
                history = [p for p in history if (p.get("id") or "") != post_id]
            
            deleted_count = initial_count - len(history)
            
            if deleted_count > 0:
                self.history_file.write_text(
                    json.dumps(history, ensure_ascii=False, indent=2),
                    encoding='utf-8'
                )
                logger.info(f"✅ {deleted_count} post(s) supprimé(s) de l'historique (thread_id={thread_id}, id={post_id})")
                return True
            else:
                logger.info(f"ℹ️ Aucun post trouvé dans l'historique avec thread_id={thread_id} ou id={post_id}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Erreur lors de la suppression dans l'historique: {e}")
            return False


history_manager = PublicationHistory()

# ==================== RATE LIMIT TRACKER ====================
class RateLimitTracker:
    def __init__(self):
        self.remaining: Optional[int] = None
        self.limit: Optional[int] = None
        self.reset_at: Optional[float] = None
    
    def update_from_headers(self, headers: dict):
        try:
            if 'X-RateLimit-Remaining' in headers:
                self.remaining = int(headers['X-RateLimit-Remaining'])
            if 'X-RateLimit-Limit' in headers:
                self.limit = int(headers['X-RateLimit-Limit'])
            if 'X-RateLimit-Reset' in headers:
                self.reset_at = float(headers['X-RateLimit-Reset'])
            if self.remaining is not None and self.remaining < 5:
                logger.warning(f"⚠️  Rate limit proche: {self.remaining} requêtes restantes")
        except Exception as e:
            logger.error(f"Erreur headers rate limit: {e}")
    
    def get_info(self) -> dict:
        info = {"remaining": self.remaining, "limit": self.limit, "reset_at": self.reset_at, "reset_in_seconds": None}
        if self.reset_at:
            info["reset_in_seconds"] = int(max(0, self.reset_at - time.time()))
        return info

rate_limiter = RateLimitTracker()

# ==================== UTILITAIRES ====================
def _b64decode_padded(s: str) -> bytes:
    """Décodage base64 tolérant (padding manquant, espaces, etc.)."""
    s = (s or "").strip()
    if not s:
        return b""
    missing = (-len(s)) % 4
    if missing:
        s += "=" * missing
    return base64.b64decode(s)

def _decode_metadata_b64(metadata_b64: str) -> Optional[Dict]:
    """Décode les métadonnées encodées en base64."""
    if not metadata_b64:
        return None
    raw = _b64decode_padded(metadata_b64)
    s = raw.decode("utf-8")
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        import urllib.parse
        return json.loads(urllib.parse.unquote(s))

def _extract_version_from_f95_title(title_text: str) -> Optional[str]:
    """Récupère la version depuis le titre F95, ex: 'Game [Ch.7] [Author]' -> 'Ch.7'"""
    if not title_text:
        return None
    
    parts = [m.group("val").strip() for m in _RE_BRACKETS.finditer(title_text)]
    return parts[0] if parts else None

def _extract_f95_thread_id(url: str) -> Optional[str]:
    """
    Extrait l'ID numérique d'un thread F95Zone.
    Accepte les URLs avec /post-XXXXX (ex: .../threads/game.8012/post-11944222 -> "8012").

    Examples:
        https://f95zone.to/threads/game-name.285451/ -> "285451"
        https://f95zone.to/threads/285451 -> "285451"
        https://f95zone.to/threads/milfy-city-v1-0e-icstor.8012/post-11944222 -> "8012"

    Returns:
        L'ID numérique comme string, ou None si non trouvé
    """
    if not url:
        return None
    # [^/]*\. pour capturer le slug avant le point, (\d+) pour l'ID (compatible /post-XXXXX)
    pattern = r'/threads/(?:[^/]*\.)?(\d+)'
    match = re.search(pattern, url)
    return match.group(1) if match else None

async def fetch_f95_versions_by_ids(session: aiohttp.ClientSession, thread_ids: list) -> Dict[str, str]:
    """
    🆕 NOUVELLE MÉTHODE: Récupère les versions depuis l'API F95 checker.php
    Plus fiable et rapide que le parsing HTML !
    
    ⚠️ LIMITE API F95: Maximum 100 IDs par requête
    Cette fonction découpe automatiquement en blocs de 50 IDs pour la sécurité
    
    Args:
        session: Session aiohttp
        thread_ids: Liste des IDs de threads F95 (ex: ["100", "285451"])
    
    Returns:
        Dict {thread_id: version}
        Example: {"100": "v0.68", "285451": "Ch.7"}
    """
    if not thread_ids:
        return {}
    
    # ⚠️ LIMITE API: Maximum 100 IDs, on utilise des chunks de 50 par sécurité
    CHUNK_SIZE = 50
    total_ids = len(thread_ids)
    all_versions = {}
    
    logger.info(f"📡 F95 API: Récupération pour {total_ids} threads (par blocs de {CHUNK_SIZE})")
    
    # Découper en chunks de 50 IDs
    for chunk_idx in range(0, total_ids, CHUNK_SIZE):
        chunk = thread_ids[chunk_idx:chunk_idx + CHUNK_SIZE]
        chunk_num = (chunk_idx // CHUNK_SIZE) + 1
        total_chunks = (total_ids + CHUNK_SIZE - 1) // CHUNK_SIZE
        
        logger.info(f"📡 Bloc {chunk_num}/{total_chunks}: {len(chunk)} IDs")
        
        # Construire l'URL pour ce chunk
        ids_str = ",".join(str(tid) for tid in chunk)
        checker_url = f"https://f95zone.to/sam/checker.php?threads={ids_str}"
        
        try:
            async with session.get(checker_url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status != 200:
                    logger.warning(f"⚠️ F95 Checker API HTTP {resp.status} pour le bloc {chunk_num}")
                    continue  # Passer au chunk suivant
                
                data = await resp.json()
                
                if data.get("status") == "ok" and "msg" in data:
                    chunk_versions = data["msg"]
                    logger.info(f"✅ Bloc {chunk_num}: {len(chunk_versions)} versions récupérées")
                    all_versions.update(chunk_versions)
                else:
                    logger.warning(f"⚠️ Bloc {chunk_num}: réponse invalide")
                    
        except Exception as e:
            logger.warning(f"❌ Erreur bloc {chunk_num}: {e}")
        
        # Petit délai entre les requêtes pour ne pas surcharger l'API
        if chunk_idx + CHUNK_SIZE < total_ids:
            await asyncio.sleep(1)
    
    logger.info(f"✅ F95 API: TOTAL {len(all_versions)}/{total_ids} versions récupérées")
    return all_versions

def _normalize_version(version: str) -> str:
    """Normalise une version pour la comparaison (enlève backticks, espaces inutiles)"""
    if not version:
        return ""
    # Enlever backticks
    normalized = version.strip().replace('`', '')
    # Normaliser les espaces
    normalized = re.sub(r'\s+', ' ', normalized)
    return normalized.strip()


def _extract_version_from_thread_name(thread_name: str) -> Optional[str]:
    """Extrait la version depuis le nom du thread Discord (ex: 'Growing Problems [v0.12]' -> 'v0.12')."""
    if not (thread_name or isinstance(thread_name, str)):
        return None
    m = _RE_VERSION_IN_THREAD_NAME.search(thread_name.strip())
    return m.group("ver").strip() if m else None

async def _fetch_f95_title(session: aiohttp.ClientSession, url: str) -> Optional[str]:
    """Télécharge la page F95 et extrait le titre H1"""
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=25)) as resp:
            if resp.status >= 300:
                logger.warning(f"⚠️ F95 HTTP {resp.status} sur {url}")
                return None
            html = await resp.text(errors="ignore")
    except Exception as e:
        logger.warning(f"⚠️ Erreur fetch F95 {url}: {e}")
        return None

    # Parsing léger: cherche <h1 class="p-title-value">...</h1>
    m = re.search(r"<h1[^>]*class=\"p-title-value\"[^>]*>(.*?)</h1>", html, re.IGNORECASE | re.DOTALL)
    if not m:
        return None
    
    raw = m.group(1)
    txt = re.sub(r"<[^>]+>", "", raw)  # Supprime les tags HTML
    txt = re.sub(r"\s+", " ", txt).strip()
    
    return txt or None

async def _collect_all_forum_threads(forum: discord.ForumChannel) -> List[discord.Thread]:
    """
    Retourne TOUS les threads d'un forum :
    - Actifs (forum.threads)
    - Archivés publics (forum.archived_threads)
    """
    all_threads: Dict[int, discord.Thread] = {}

    # 1) Threads actifs (cache)
    for t in list(getattr(forum, "threads", []) or []):
        all_threads[t.id] = t

    # 2) Threads archivés publics (pagination)
    if hasattr(forum, "archived_threads"):
        before = None
        while True:
            batch = []
            try:
                async for t in forum.archived_threads(limit=100, before=before):
                    batch.append(t)
            except TypeError:
                # Compat si la signature diffère
                async for t in forum.archived_threads(limit=100):
                    batch.append(t)

            if not batch:
                break

            for t in batch:
                all_threads[t.id] = t

            # Pagination
            before = batch[-1].archive_timestamp or batch[-1].created_at
            await asyncio.sleep(0.8)

            if before is None:
                break

    return list(all_threads.values())

# ==================== EXTRACTION MÉTADONNÉES/CONTENU ====================
async def _extract_post_data(thread: discord.Thread) -> Tuple[Optional[str], Optional[str]]:
    """
    Extrait (game_link, game_version) depuis un thread Discord.
    Priorité : Supabase (published_posts) > métadonnées embed > parsing texte
    Returns:
        (game_link, game_version) ou (None, None) si non trouvé
    """
    # 1) Priorité : ligne published_posts par thread_id (source de vérité)
    loop = asyncio.get_event_loop()
    row = await loop.run_in_executor(None, _fetch_post_by_thread_id_sync, thread.id)
    if row:
        saved = _parse_saved_inputs(row)
        game_version = (saved.get("Game_version") or "").strip()
        # Le nom du thread Discord est mis à jour par forum_post_update ; priorité à cette version (état live)
        version_from_thread_name = _extract_version_from_thread_name(getattr(thread, "name", "") or "")
        if version_from_thread_name:
            game_version = _normalize_version(version_from_thread_name)
            logger.info(f"📌 Version post pour {thread.name}: {game_version} (depuis nom du thread)")
        elif game_version:
            game_version = _normalize_version(game_version)
            logger.info(f"📌 Version post pour {thread.name}: {game_version}")
        content = (row.get("content") or "") or ""
        game_link = None
        m_link_md = _RE_GAME_LINK_MD.search(content)
        m_link_plain = _RE_GAME_LINK_PLAIN.search(content)
        if m_link_md:
            game_link = m_link_md.group("url").strip()
        elif m_link_plain:
            game_link = m_link_plain.group("url").strip()
        if not game_link:
            # Nouveau format : * [Jeu original](<url>) — ligne dédiée, pas les autres liens F95
            m_jeu = _RE_GAME_LINK_JEU_ORIGINAL.search(content)
            if m_jeu:
                game_link = m_jeu.group("url").strip()
        if game_link or game_version:
            logger.info(f"✅ Données post depuis Supabase (thread_id={thread.id})")
            return game_link, game_version

    # 2) Fallback : message Discord (métadonnées embed ou parsing)
    msg = thread.starter_message
    if not msg:
        try:
            await asyncio.sleep(0.8)
            msg = thread.starter_message or await thread.fetch_message(thread.id)
        except Exception as e:
            logger.warning(f"⚠️ Impossible de récupérer le message de départ pour {thread.name}: {e}")
            return None, None
    
    if not msg:
        return None, None
    
    game_link = None
    game_version = None
    
    # 1️⃣ PRIORITÉ : Métadonnées de l'embed invisible
    if msg.embeds:
        for embed in msg.embeds:
            footer_text = embed.footer.text if embed.footer else ""
            
            # Vérifier si c'est notre embed de métadonnées
            if footer_text and footer_text.startswith("metadata:v1:"):
                logger.info(f"📦 Métadonnées détectées pour {thread.name}")
                
                # Reconstruction du metadata_b64 depuis les fields
                chunks = []
                for field in embed.fields:
                    if field.name == "\u200b":  # Notre marqueur invisible
                        chunks.append(field.value)
                
                if chunks:
                    metadata_b64 = "".join(chunks)
                    try:
                        metadata = _decode_metadata_b64(metadata_b64)
                        if metadata:
                            # Extraire game_version depuis les métadonnées
                            # Note: les métadonnées contiennent game_version (version du jeu)
                            game_version = metadata.get("game_version", "")
                            
                            # Pour game_link, on doit parser le contenu texte car ce n'est pas dans les métadonnées
                            # Les métadonnées contiennent : game_name, game_version, translate_version, traductor, etc.
                            # mais pas game_link
                            logger.info(f"✅ Version extraite des métadonnées: {game_version}")
                    except Exception as e:
                        logger.warning(f"⚠️ Erreur décodage métadonnées pour {thread.name}: {e}")
    
    # 2️⃣ FALLBACK : Parsing du contenu texte
    content = (msg.content if msg else "") or ""
    
    # Extraire game_link (toujours depuis le texte car absent des métadonnées)
    m_link_md = _RE_GAME_LINK_MD.search(content)
    m_link_plain = _RE_GAME_LINK_PLAIN.search(content)
    if m_link_md:
        game_link = m_link_md.group("url").strip()
    elif m_link_plain:
        game_link = m_link_plain.group("url").strip()
    if not game_link:
        # Nouveau format : * [Jeu original](<url>) — ligne dédiée, pas les autres liens F95
        m_jeu = _RE_GAME_LINK_JEU_ORIGINAL.search(content)
        if m_jeu:
            game_link = m_jeu.group("url").strip()
    
    # Si game_version n'a pas été trouvée dans les métadonnées, parser le texte
    if not game_version:
        m_ver_md = _RE_GAME_VERSION_MD.search(content)
        m_ver_plain = _RE_GAME_VERSION_PLAIN.search(content)
        
        if m_ver_md:
            game_version = m_ver_md.group("ver").strip()
        elif m_ver_plain:
            game_version = m_ver_plain.group("ver").strip()
    
    # Normaliser la version
    if game_version:
        game_version = _normalize_version(game_version)
    
    if game_link:
        logger.info(f"🔗 Lien extrait pour {thread.name}: {game_link}")
    if game_version:
        logger.info(f"📌 Version post pour {thread.name}: {game_version}")
    
    return game_link, game_version

# ==================== MODIFICATION POST ====================
def _embed_preserve_dict(embed: discord.Embed) -> dict:
    """
    Convertit un embed en dict en préservant explicitement image, thumbnail et tous les champs
    visuels pour un round-trip sans perte (ex: image du post qui ne doit pas disparaître au MAJ version).
    """
    d = embed.to_dict()
    # S'assurer que l'image est bien présente (embed créé côté Discord peut avoir une structure différente)
    if getattr(embed, "image", None) and getattr(embed.image, "url", None):
        d["image"] = {"url": str(embed.image.url)}
    if getattr(embed, "thumbnail", None) and getattr(embed.thumbnail, "url", None):
        d["thumbnail"] = {"url": str(embed.thumbnail.url)}
    return d


async def _update_post_version(thread: discord.Thread, new_version: str) -> bool:
    """
    Met à jour la version du jeu dans le post Discord (contenu + métadonnées).
    Préserve tous les éléments existants : image(s), embeds non-métadonnées, etc.
    Priorité : construire les métadonnées depuis Supabase (published_posts), sinon depuis l'embed Discord.
    Returns:
        True si succès, False sinon
    """
    try:
        msg = thread.starter_message
        if not msg:
            msg = await thread.fetch_message(thread.id)
        if not msg:
            logger.error(f"❌ Message introuvable pour {thread.name}")
            return False

        content = msg.content or ""
        new_content = _RE_GAME_VERSION_MD.sub(
            f"* **Version du jeu :** `{new_version}`",
            content
        )
        if new_content == content:
            new_content = _RE_GAME_VERSION_PLAIN.sub(
                f"Version du jeu : `{new_version}`",
                content
            )

        # Métadonnées : priorité Supabase (row), sinon embed Discord
        metadata_b64_new = None
        loop = asyncio.get_event_loop()
        row = await loop.run_in_executor(None, _fetch_post_by_thread_id_sync, thread.id)
        if row:
            metadata_b64_new = _metadata_from_row(row, new_game_version=new_version)
            if metadata_b64_new:
                logger.info(f"✅ Métadonnées construites depuis Supabase pour {thread.name}")

        if not metadata_b64_new and msg.embeds:
            for embed in msg.embeds:
                footer_text = embed.footer.text if embed.footer else ""
                if footer_text and footer_text.startswith("metadata:v1:"):
                    chunks = []
                    for field in embed.fields:
                        if field.name == "\u200b":
                            chunks.append(field.value)
                    if chunks:
                        metadata_b64 = "".join(chunks)
                        metadata = _decode_metadata_b64(metadata_b64)
                        if metadata:
                            metadata["game_version"] = new_version
                            metadata["timestamp"] = int(time.time() * 1000)
                            metadata_json = json.dumps(metadata, ensure_ascii=False)
                            metadata_b64_new = base64.b64encode(metadata_json.encode("utf-8")).decode("utf-8")
                    break

        # Conserver uniquement les embeds non-métadonnées (image, etc.) sur le message principal.
        # Les métadonnées vont dans un 2e message séparé (comme à la création) puis SUPPRESS pour le masquer.
        new_embeds = []
        for embed in msg.embeds:
            footer_text = embed.footer.text if embed.footer else ""
            if footer_text and footer_text.startswith("metadata:v1:"):
                # Ne pas copier l'embed métadonnées sur le message principal
                continue
            new_embeds.append(_embed_preserve_dict(embed))

        try:
            await msg.edit(content=new_content, embeds=[discord.Embed.from_dict(e) for e in new_embeds])

            # Mettre à jour ou créer le message métadonnées séparé (2e message), puis le masquer (SUPPRESS)
            if metadata_b64_new and len(metadata_b64_new) <= 25000:
                metadata_message = None
                async for m in thread.history(limit=30):
                    if m.id == msg.id:
                        continue
                    for e in m.embeds:
                        ft = e.footer.text if e.footer else ""
                        if ft and ft.startswith("metadata:v1:"):
                            metadata_message = m
                            break
                    if metadata_message:
                        break
                if metadata_message:
                    await metadata_message.edit(
                        content=" ",
                        embeds=[discord.Embed.from_dict(_build_metadata_embed(metadata_b64_new))]
                    )
                    try:
                        await metadata_message.edit(suppress=True)
                    except Exception as e:
                        logger.warning(f"⚠️ Impossible de masquer l'embed métadonnées: {e}")
                    logger.info(f"✅ Message métadonnées mis à jour et masqué pour {thread.name}")
                else:
                    # Créer un 2e message avec les métadonnées puis le masquer
                    sent = await thread.send(
                        content=" ",
                        embeds=[discord.Embed.from_dict(_build_metadata_embed(metadata_b64_new))]
                    )
                    try:
                        await sent.edit(suppress=True)
                    except Exception as e:
                        logger.warning(f"⚠️ Impossible de masquer le nouvel embed métadonnées: {e}")
                    logger.info(f"✅ Message métadonnées créé et masqué pour {thread.name}")

            # Mettre à jour le titre du thread Discord : référence entre crochets -> nouvelle version (ex: "Jeu [Ch.5]" -> "Jeu [Ch.6]")
            new_title = _build_thread_title_with_version(thread.name, new_version)
            if new_title != thread.name:
                try:
                    await thread.edit(name=new_title)
                    logger.info(f"✅ Titre du thread mis à jour: {thread.name} -> {new_title}")
                except Exception as e:
                    logger.warning(f"⚠️ Impossible de renommer le thread {thread.name}: {e}")
            # Mettre à jour published_posts sur Supabase pour que l'historique reste aligné
            if row:
                sb = _get_supabase()
                if sb:
                    try:
                        saved = _parse_saved_inputs(row)
                        saved["Game_version"] = new_version
                        updates = {
                            "title": new_title,
                            "saved_inputs": saved,
                            "updated_at": datetime.datetime.now(ZoneInfo("UTC")).isoformat(),
                        }
                        sb.table("published_posts").update(updates).eq("id", row["id"]).execute()
                        logger.info(f"✅ published_posts mis à jour sur Supabase pour {thread.name}")
                    except Exception as e:
                        logger.warning(f"⚠️ Échec mise à jour Supabase published_posts: {e}")
            logger.info(f"✅ Post mis à jour pour {thread.name}: {new_version}")
            return True
        except Exception as e:
            logger.error(f"❌ Erreur modification message pour {thread.name}: {e}")
            return False
    except Exception as e:
        logger.error(f"❌ Erreur mise à jour post {thread.name}: {e}")
        return False

# ==================== ALERTES VERSIONS ====================
class VersionAlert:
    """Représente une alerte de version (salon my uniquement)"""
    def __init__(self, thread_name: str, thread_url: str, f95_version: Optional[str],
                 post_version: Optional[str], updated: bool):
        self.thread_name = thread_name
        self.thread_url = thread_url
        self.f95_version = f95_version
        self.post_version = post_version
        self.updated = updated

async def _group_and_send_alerts(channel: discord.TextChannel, alerts: List[VersionAlert]):
    """Envoie les alertes (max 10 par message)"""
    if not alerts:
        return
    title = f"🚨 **Mises à jour détectées** ({len(alerts)} jeux)"
    for i in range(0, len(alerts), 10):
        batch = alerts[i:i+10]
        msg_parts = [title, ""]
        for alert in batch:
            if alert.f95_version:
                msg_parts.append(
                    f"**{alert.thread_name}**\n"
                    f"├ Version F95 : `{alert.f95_version}`\n"
                    f"├ Version du poste : `{alert.post_version or 'Non renseignée'}`\n"
                    f"├ Version modifiée : {'OUI ✅' if alert.updated else 'NON ❌'}\n"
                    f"└ Lien : {alert.thread_url}\n"
                )
            else:
                msg_parts.append(
                    f"**{alert.thread_name}**\n"
                    f"├ Version F95 : Non détectable ⚠️\n"
                    f"├ Version du poste : `{alert.post_version or 'Non renseignée'}`\n"
                    f"├ Version modifiée : NON\n"
                    f"└ Lien : {alert.thread_url}\n"
                )
        await channel.send("\n".join(msg_parts))
        await asyncio.sleep(1.5)

# ==================== CONTRÔLE VERSIONS F95 ====================
async def run_version_check_once():
    """
    🆕 Contrôle des versions F95 via l'API checker.php (salon my uniquement)
    AMÉLIORATION: Utilise l'API au lieu du parsing HTML pour plus de fiabilité !
    """
    logger.info("🔎 Démarrage contrôle versions F95 (salon my) - Méthode API")
    channel_notif = bot.get_channel(config.PUBLISHER_MAJ_NOTIFICATION_CHANNEL_ID)
    if not channel_notif:
        logger.error("❌ Salon notifications MAJ introuvable")
        return
    if not config.FORUM_MY_ID:
        logger.warning("⚠️ PUBLISHER_FORUM_TRAD_ID non configuré")
        return
    
    _clean_old_notifications()
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json,*/*",
    }
    
    all_alerts: List[VersionAlert] = []
    forum = bot.get_channel(config.FORUM_MY_ID)
    if not forum:
        logger.warning(f"⚠️ Forum {config.FORUM_MY_ID} introuvable")
        return
    
    threads = await _collect_all_forum_threads(forum)
    logger.info(f"🔎 Check version F95: {len(threads)} threads (actifs + archivés)")
    
    # 📊 PHASE 1: Collecter tous les IDs F95 depuis les threads Discord
    thread_mapping = {}  # {f95_id: (thread, post_version)}
    
    async with aiohttp.ClientSession(headers=headers) as session:
        for thread in threads:
            await asyncio.sleep(0.3)  # Anti-spam Discord
            
            game_link, post_version = await _extract_post_data(thread)
            if not game_link or not post_version:
                logger.info(f"⏭️  Thread ignoré (données manquantes): {thread.name}")
                continue
            
            if "lewdcorner.com" in game_link.lower():
                logger.info(f"⏭️  Thread ignoré (LewdCorner): {thread.name}")
                continue
            
            if "f95zone.to" not in game_link.lower():
                logger.info(f"⏭️  Thread ignoré (non-F95Zone): {thread.name}")
                continue
            
            # Extraire l'ID F95
            f95_id = _extract_f95_thread_id(game_link)
            if not f95_id:
                logger.warning(f"⚠️ Impossible d'extraire l'ID F95 depuis: {game_link}")
                continue
            
            thread_mapping[f95_id] = (thread, post_version)
            logger.info(f"✅ Thread mappé: {thread.name} → F95 ID {f95_id}")
        
        if not thread_mapping:
            logger.info("✅ Aucun thread avec lien F95 trouvé")
            return
        
        # 🚀 PHASE 2: Récupérer toutes les versions via l'API (1 seule requête !)
        f95_ids = list(thread_mapping.keys())
        logger.info(f"🌐 Récupération API F95 pour {len(f95_ids)} threads...")
        
        f95_versions = await fetch_f95_versions_by_ids(session, f95_ids)
        
        if not f95_versions:
            logger.warning("⚠️ Aucune version récupérée depuis l'API F95")
            return
        
        # 🎯 PHASE 3: Comparaison des versions
        for f95_id, api_version in f95_versions.items():
            if f95_id not in thread_mapping:
                continue
            
            thread, post_version = thread_mapping[f95_id]
            
            # Normaliser les versions
            api_version_clean = _normalize_version(api_version)
            post_version_clean = _normalize_version(post_version)
            
            if api_version_clean != post_version_clean:
                if not _is_already_notified(thread.id, api_version_clean):
                    logger.info(f"🔄 Différence: {thread.name}: F95={api_version_clean} vs Post={post_version_clean}")
                    update_success = await _update_post_version(thread, api_version_clean)
                    all_alerts.append(VersionAlert(thread.name, thread.jump_url, api_version_clean, post_version_clean, update_success))
                    _mark_as_notified(thread.id, api_version_clean)
            else:
                logger.info(f"✅ Version OK: {thread.name} ({post_version_clean})")
    
    await _group_and_send_alerts(channel_notif, all_alerts)
    logger.info(f"📊 Contrôle terminé : {len(all_alerts)} alertes envoyées")

# ==================== NETTOYAGE MESSAGES VIDES ====================
async def run_cleanup_empty_messages_once():
    """Supprime les messages vides dans les threads du salon my (sauf message de départ et métadonnées)."""
    logger.info("🧹 Démarrage nettoyage quotidien des messages vides (salon my)")
    if not config.FORUM_MY_ID:
        logger.warning("⚠️ PUBLISHER_FORUM_TRAD_ID non configuré")
        return
    forum = bot.get_channel(config.FORUM_MY_ID)
    if not forum:
        logger.warning(f"⚠️ Forum {config.FORUM_MY_ID} introuvable")
        return
    threads = await _collect_all_forum_threads(forum)
    logger.info(f"🧹 Nettoyage: {len(threads)} threads à traiter")
    total_deleted = 0
    async with aiohttp.ClientSession() as session:
        for thread_idx, thread in enumerate(threads, 1):
            await asyncio.sleep(1.0 + random.random())
            n = await _clean_empty_messages_in_thread(session, str(thread.id))
            total_deleted += n
            if thread_idx % 10 == 0:
                logger.info(f"📊 Progression: {thread_idx}/{len(threads)} threads traités")
    logger.info(f"✅ Nettoyage terminé : {total_deleted} message(s) vide(s) supprimé(s)")

# ==================== TÂCHE QUOTIDIENNE ====================
@tasks.loop(time=datetime.time(hour=config.VERSION_CHECK_HOUR, minute=config.VERSION_CHECK_MINUTE, tzinfo=ZoneInfo("Europe/Paris")))
async def daily_version_check():
    """Contrôle quotidien automatique à l'heure configurée (défaut: 6h Europe/Paris)"""
    logger.info(f"🕕 Démarrage contrôle quotidien automatique des versions F95")
    try:
        await run_version_check_once()
    except Exception as e:
        logger.error(f"❌ Erreur contrôle quotidien: {e}")

@tasks.loop(time=datetime.time(hour=config.CLEANUP_EMPTY_MESSAGES_HOUR, minute=config.CLEANUP_EMPTY_MESSAGES_MINUTE, tzinfo=ZoneInfo("Europe/Paris")))
async def daily_cleanup_empty_messages():
    """Nettoyage quotidien des messages vides dans les threads (défaut: 4h Europe/Paris)."""
    logger.info("🧹 Démarrage nettoyage quotidien des messages vides")
    try:
        await run_cleanup_empty_messages_once()
    except Exception as e:
        logger.error(f"❌ Erreur nettoyage messages vides: {e}")

# ==================== COMMANDES SLASH ====================
ALLOWED_USER_ID = 394893413843206155
OWNER_IDS = {394893413843206155}

def owner_only():
    async def predicate(interaction: discord.Interaction) -> bool:
        return interaction.user and interaction.user.id in OWNER_IDS
    return app_commands.check(predicate)
def _user_can_run_checks(interaction: discord.Interaction) -> bool:
    """Autorise admin/manage_guild OU un user ID spécifique."""
    if getattr(interaction.user, "id", None) == ALLOWED_USER_ID:
        return True
    perms = getattr(interaction.user, "guild_permissions", None)
    return bool(perms and (perms.administrator or perms.manage_guild))

@bot.tree.command(name="check_help", description="Affiche la liste des commandes et leur utilité")
async def check_help(interaction: discord.Interaction):
    try:
        await interaction.response.defer(ephemeral=True)
    except Exception:
        pass
    if not _user_can_run_checks(interaction):
        await interaction.followup.send("⛔ Permission insuffisante.", ephemeral=True)
        return
    help_text = (
        "**🧰 Commandes disponibles (Bot Publisher - Salon my)**\n\n"
        "**/check_versions** — Lance le contrôle des versions F95 sur le salon my.\n"
        "**/cleanup_empty_messages** — Supprime les messages vides dans les threads (sauf métadonnées).\n"
        "**/force_sync** — Force la synchronisation des commandes slash.\n\n"
        "**ℹ️ Automatique**\n"
        f"Contrôle des versions : tous les jours à {config.VERSION_CHECK_HOUR:02d}:{config.VERSION_CHECK_MINUTE:02d} (Europe/Paris).\n"
        f"Nettoyage des messages vides : tous les jours à {config.CLEANUP_EMPTY_MESSAGES_HOUR:02d}:{config.CLEANUP_EMPTY_MESSAGES_MINUTE:02d} (Europe/Paris).\n"
        "Système anti-doublon actif (30 jours)."
    )
    await interaction.followup.send(help_text, ephemeral=True)

@bot.tree.command(name="check_versions", description="Contrôle les versions F95 (salon my)")
async def check_versions(interaction: discord.Interaction):
    """Lance le contrôle des versions sur le salon my."""
    try:
        await interaction.response.defer(ephemeral=True)
    except Exception:
        pass
    if not _user_can_run_checks(interaction):
        await interaction.followup.send("⛔ Permission insuffisante.", ephemeral=True)
        return
    try:
        await interaction.followup.send("⏳ Contrôle des versions F95 en cours…", ephemeral=True)
    except Exception:
        pass
    try:
        await run_version_check_once()
        await interaction.followup.send("✅ Contrôle terminé.", ephemeral=True)
    except Exception as e:
        logger.error(f"❌ Erreur commande check_versions: {e}")
        await interaction.followup.send(f"❌ Erreur: {e}", ephemeral=True)

@bot.tree.command(name="cleanup_empty_messages", description="Supprime les messages vides dans les threads (sauf métadonnées)")
async def cleanup_empty_messages_cmd(interaction: discord.Interaction):
    """Lance le nettoyage des messages vides manuellement."""
    try:
        await interaction.response.defer(ephemeral=True)
    except Exception:
        pass
    if not _user_can_run_checks(interaction):
        await interaction.followup.send("⛔ Permission insuffisante.", ephemeral=True)
        return
    try:
        await interaction.followup.send("⏳ Nettoyage des messages vides en cours…", ephemeral=True)
    except Exception:
        pass
    try:
        await run_cleanup_empty_messages_once()
        await interaction.followup.send("✅ Nettoyage terminé.", ephemeral=True)
    except Exception as e:
        logger.error(f"❌ Erreur commande cleanup_empty_messages: {e}")
        await interaction.followup.send(f"❌ Erreur: {e}", ephemeral=True)

@bot.tree.command(name="force_sync", description="Force la synchronisation des commandes")
async def force_sync(interaction: discord.Interaction):
    """Force le sync des commandes. Autorisé pour admin OU ALLOWED_USER_ID."""
    try:
        await interaction.response.defer(ephemeral=True)
    except Exception:
        pass

    if not _user_can_run_checks(interaction):
        await interaction.followup.send("⛔ Permission insuffisante.", ephemeral=True)
        return

    try:
        guild = interaction.guild
        if guild is None:
            await interaction.followup.send("❌ Impossible: commande utilisable uniquement dans un serveur.", ephemeral=True)
            return

        bot.tree.copy_global_to(guild=guild)
        await bot.tree.sync(guild=guild)

        await interaction.followup.send("✅ Commandes synchronisées pour ce serveur !", ephemeral=True)
    except Exception as e:
        logger.error(f"❌ Erreur force_sync: {e}")
        await interaction.followup.send(f"❌ Erreur: {e}", ephemeral=True)


# Définir l'ID du propriétaire (celui qui peut utiliser ces commandes)
OWNER_IDS = {394893413843206155}

def owner_only():
    """Décorateur pour limiter les commandes aux propriétaires uniquement"""
    async def predicate(interaction: discord.Interaction) -> bool:
        return interaction.user and interaction.user.id in OWNER_IDS
    return app_commands.check(predicate)


@owner_only()
@bot.tree.command(name="reset_commands", description="[OWNER] Nettoie et resynchronise TOUTES les commandes (global + serveur)")
async def reset_commands(interaction: discord.Interaction):
    """
    Commande ultime de reset : nettoie tout et resynchronise
    - Supprime les commandes globales
    - Supprime les commandes du serveur
    - Resynchronise tout proprement
    """
    try:
        await interaction.response.defer(ephemeral=True)
    except Exception as e:
        logger.warning("⚠️ Erreur defer: %s", e)
        return

    bot_name = bot.user.name if bot.user else "Bot"
    guild = interaction.guild
    
    try:
        # ÉTAPE 1: Nettoyage global
        logger.info("🧹 [%s] Étape 1/4: Suppression commandes globales...", bot_name)
        bot.tree.clear_commands(guild=None)
        await bot.tree.sync()
        await asyncio.sleep(2)
        
        # ÉTAPE 2: Nettoyage serveur (si dans un serveur)
        if guild:
            logger.info("🧹 [%s] Étape 2/4: Suppression commandes serveur %s...", bot_name, guild.name)
            bot.tree.clear_commands(guild=guild)
            await bot.tree.sync(guild=guild)
            await asyncio.sleep(2)
        else:
            logger.info("⏭️  [%s] Étape 2/4: Ignorée (pas dans un serveur)", bot_name)
        
        # ÉTAPE 3: Resync global
        logger.info("🔄 [%s] Étape 3/4: Synchronisation globale...", bot_name)
        await bot.tree.sync()
        await asyncio.sleep(2)
        
        # ÉTAPE 4: Resync serveur (si dans un serveur)
        if guild:
            logger.info("🔄 [%s] Étape 4/4: Synchronisation serveur %s...", bot_name, guild.name)
            bot.tree.copy_global_to(guild=guild)
            await bot.tree.sync(guild=guild)
        else:
            logger.info("⏭️  [%s] Étape 4/4: Ignorée (pas dans un serveur)", bot_name)
        
        # Message de succès
        success_msg = (
            f"✅ **Reset terminé pour {bot_name}**\n\n"
            f"**Actions effectuées:**\n"
            f"✓ Commandes globales nettoyées\n"
        )
        if guild:
            success_msg += f"✓ Commandes serveur '{guild.name}' nettoyées\n"
        success_msg += (
            f"✓ Resynchronisation globale\n"
        )
        if guild:
            success_msg += f"✓ Resynchronisation serveur '{guild.name}'\n"
        
        success_msg += f"\n**⏰ Délai total: ~8-10 secondes**\n"
        success_msg += f"**ℹ️ Les commandes peuvent mettre jusqu'à 1h pour apparaître partout.**"
        
        await interaction.followup.send(success_msg, ephemeral=True)
        logger.info("✅ [%s] Reset complet terminé avec succès!", bot_name)
        
    except discord.errors.HTTPException as e:
        error_msg = f"❌ Erreur Discord HTTP: {e}"
        logger.error("❌ [%s] %s", bot_name, error_msg)
        await interaction.followup.send(error_msg, ephemeral=True)
    except Exception as e:
        error_msg = f"❌ Erreur inattendue: {type(e).__name__}: {e}"
        logger.error("❌ [%s] %s", bot_name, error_msg)
        await interaction.followup.send(error_msg, ephemeral=True)


@owner_only()
@bot.tree.command(name="sync_commands", description="[OWNER] Synchronise les commandes sans nettoyer")
async def sync_commands(interaction: discord.Interaction):
    """
    Synchronise les commandes sans faire de nettoyage
    Utile pour mettre à jour après modification du code
    """
    try:
        await interaction.response.defer(ephemeral=True)
    except Exception as e:
        logger.warning("⚠️ Erreur defer: %s", e)
        return

    bot_name = bot.user.name if bot.user else "Bot"
    guild = interaction.guild
    
    try:
        # Sync global
        logger.info("🔄 [%s] Synchronisation globale...", bot_name)
        await bot.tree.sync()
        await asyncio.sleep(1)
        
        # Sync serveur si applicable
        if guild:
            logger.info("🔄 [%s] Synchronisation serveur %s...", bot_name, guild.name)
            bot.tree.copy_global_to(guild=guild)
            await bot.tree.sync(guild=guild)
        
        success_msg = f"✅ **Sync terminé pour {bot_name}**\n\n"
        success_msg += "✓ Commandes globales synchronisées\n"
        if guild:
            success_msg += f"✓ Commandes serveur '{guild.name}' synchronisées\n"
        success_msg += "\n**ℹ️ Les commandes peuvent mettre jusqu'à 1h pour apparaître partout.**"
        
        await interaction.followup.send(success_msg, ephemeral=True)
        logger.info("✅ [%s] Sync terminé avec succès!", bot_name)
        
    except discord.errors.HTTPException as e:
        error_msg = f"❌ Erreur Discord HTTP: {e}"
        logger.error("❌ [%s] %s", bot_name, error_msg)
        await interaction.followup.send(error_msg, ephemeral=True)
    except Exception as e:
        error_msg = f"❌ Erreur inattendue: {type(e).__name__}: {e}"
        logger.error("❌ [%s] %s", bot_name, error_msg)
        await interaction.followup.send(error_msg, ephemeral=True)


@owner_only()
@bot.tree.command(name="list_commands", description="[OWNER] Liste toutes les commandes enregistrées")
async def list_commands(interaction: discord.Interaction):
    """
    Affiche la liste des commandes actuellement enregistrées
    Utile pour diagnostiquer les problèmes
    """
    try:
        await interaction.response.defer(ephemeral=True)
    except Exception as e:
        logger.warning("⚠️ Erreur defer: %s", e)
        return

    bot_name = bot.user.name if bot.user else "Bot"
    
    try:
        # Récupérer les commandes
        global_commands = await bot.tree.fetch_commands()
        
        msg = f"📋 **Commandes enregistrées pour {bot_name}**\n\n"
        msg += f"**Commandes globales ({len(global_commands)}):**\n"
        
        if global_commands:
            for cmd in global_commands:
                msg += f"• `/{cmd.name}` - {cmd.description}\n"
        else:
            msg += "*Aucune commande globale*\n"
        
        # Commandes serveur (si dans un serveur)
        if interaction.guild:
            guild_commands = await bot.tree.fetch_commands(guild=interaction.guild)
            msg += f"\n**Commandes serveur ({len(guild_commands)}):**\n"
            if guild_commands:
                for cmd in guild_commands:
                    msg += f"• `/{cmd.name}` - {cmd.description}\n"
            else:
                msg += "*Aucune commande serveur*\n"
        
        await interaction.followup.send(msg, ephemeral=True)
        
    except Exception as e:
        error_msg = f"❌ Erreur: {type(e).__name__}: {e}"
        logger.error("❌ [%s] %s", bot_name, error_msg)
        await interaction.followup.send(error_msg, ephemeral=True)
# ==================== ÉVÉNEMENTS BOT ====================
@bot.event
async def on_ready():
    logger.info(f'🤖 Bot Publisher prêt : {bot.user}')
    
    # Sync commandes slash
    try:
        await bot.tree.sync()
        logger.info("✅ Commandes slash synchronisées (/check_versions, /cleanup_empty_messages, /check_help)")
    except Exception as e:
        logger.error(f"⚠️ Sync commandes slash échouée: {e}")
    
    # Lancement tâches quotidiennes
    if not daily_version_check.is_running():
        daily_version_check.start()
        logger.info(f"✅ Contrôle quotidien programmé à {config.VERSION_CHECK_HOUR:02d}:{config.VERSION_CHECK_MINUTE:02d} Europe/Paris")
    if not daily_cleanup_empty_messages.is_running():
        daily_cleanup_empty_messages.start()
        logger.info(f"✅ Nettoyage messages vides programmé à {config.CLEANUP_EMPTY_MESSAGES_HOUR:02d}:{config.CLEANUP_EMPTY_MESSAGES_MINUTE:02d} Europe/Paris")

# ==================== HELPERS API REST ====================
def _build_metadata_embed(metadata_b64: str) -> dict:
    """
    Embed "invisible" qui transporte metadata_b64 en respectant les limites Discord.
    - field.value: max ~1024 caractères -> on découpe en chunks
    - max 25 fields
    """
    CHUNK_SIZE = 950
    chunks = [metadata_b64[i:i + CHUNK_SIZE] for i in range(0, len(metadata_b64), CHUNK_SIZE)]
    if len(chunks) > 25:
        chunks = chunks[:25]

    return {
        "color": 2829617,  # #2b2d31 (quasi invisible en dark mode)
        "footer": {"text": f"metadata:v1:chunks={len(chunks)}"},
        "fields": [
            {"name": "\u200b", "value": c, "inline": False}
            for c in chunks
        ]
    }

def _auth_headers():
    return {"Authorization": f"Bot {config.PUBLISHER_DISCORD_TOKEN}"}

async def _discord_request(session, method, path, headers=None, json_data=None, data=None):
    url = f"{config.DISCORD_API_BASE}{path}"
    try:
        async with session.request(method, url, headers=headers, json=json_data, data=data) as resp:
            rate_limiter.update_from_headers(resp.headers)
            try:
                data = await resp.json()
            except:
                data = await resp.text()
            return resp.status, data, resp.headers
    except Exception as e:
        logger.error(f"Erreur requête Discord: {e}")
        return 500, {"error": str(e)}, {}

async def _discord_get(session, path):
    status, data, _ = await _discord_request(session, "GET", path, headers=_auth_headers())
    return status, data

async def _discord_list_messages(session, channel_id: str, limit: int = 50):
    """Liste les derniers messages d'un channel/thread (REST)."""
    status, data, _ = await _discord_request(
        session,
        "GET",
        f"/channels/{channel_id}/messages?limit={limit}",
        headers=_auth_headers()
    )
    if status >= 300 or not isinstance(data, list):
        return []
    return data

async def _discord_patch_json(session, path, payload):
    status, data, _ = await _discord_request(
        session, "PATCH", path,
        headers={**_auth_headers(), "Content-Type": "application/json"},
        json_data=payload
    )
    return status, data

async def _discord_patch_form(session, path, form):
    """Envoie une requête PATCH avec FormData et retourne les 3 valeurs attendues"""
    status, data, headers = await _discord_request(session, "PATCH", path, headers=_auth_headers(), data=form)
    return status, data, headers

async def _discord_post_form(session, path, form):
    return await _discord_request(session, "POST", path, headers=_auth_headers(), data=form)

async def _fetch_image_from_url(session, url: str) -> Optional[Tuple[bytes, str, str]]:
    """
    Télécharge une image depuis une URL. Retourne (bytes, filename, content_type) ou None en cas d'échec.
    """
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            if resp.status >= 400:
                logger.warning(f"⚠️ Échec téléchargement image (status {resp.status}): {url[:60]}...")
                return None
            data = await resp.read()
            if not data:
                return None
            # Nom de fichier : depuis Content-Disposition ou extrait de l'URL
            disp = resp.headers.get("Content-Disposition")
            filename = "image.png"
            if disp and "filename=" in disp:
                part = disp.split("filename=")[-1].strip().strip('"\'')
                if part:
                    filename = part
            else:
                path = url.split("?")[0].strip("/")
                if "/" in path:
                    name = path.split("/")[-1]
                    if "." in name and len(name) < 200:
                        filename = name
            if not any(filename.lower().endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".gif", ".webp")):
                filename = filename + ".png" if "." not in filename else "image.png"
            ctype = resp.headers.get("Content-Type") or "image/png"
            if ";" in ctype:
                ctype = ctype.split(";")[0].strip()
            return (data, filename, ctype)
    except Exception as e:
        logger.warning(f"⚠️ Exception téléchargement image: {e}")
        return None

async def _discord_post_thread_with_attachment(
    session, forum_id: str, name: str, message_content: str,
    applied_tag_ids: Optional[List[str]], file_bytes: bytes, filename: str, content_type: str
):
    """
    Crée un thread avec un message contenant une pièce jointe (multipart/form-data).
    Retourne (status, data, headers).
    """
    payload = {
        "name": name,
        "message": {"content": message_content or " "}
    }
    if applied_tag_ids:
        payload["applied_tags"] = applied_tag_ids
    form = aiohttp.FormData()
    form.add_field("payload_json", json.dumps(payload), content_type="application/json")
    form.add_field("files[0]", file_bytes, filename=filename, content_type=content_type)
    return await _discord_request(
        session, "POST", f"/channels/{forum_id}/threads",
        headers=_auth_headers(), data=form
    )

async def _discord_patch_message_with_attachment(
    session, thread_id: str, message_id: str, content: str,
    file_bytes: bytes, filename: str, content_type: str
):
    """
    Met à jour un message en remplaçant la pièce jointe (multipart/form-data).
    payload_json.attachments avec id 0 et filename permet de remplacer l'attachment.
    """
    payload = {
        "content": content or " ",
        "embeds": [],
        "attachments": [{"id": 0, "filename": filename}]
    }
    form = aiohttp.FormData()
    form.add_field("payload_json", json.dumps(payload), content_type="application/json")
    form.add_field("files[0]", file_bytes, filename=filename, content_type=content_type)
    status, data, headers = await _discord_request(
        session, "PATCH", f"/channels/{thread_id}/messages/{message_id}",
        headers=_auth_headers(), data=form
    )
    return status, data

async def _discord_post_json(session, path, payload):
    """Envoie une requête POST avec JSON et retourne les 3 valeurs attendues"""
    status, data, headers = await _discord_request(session, "POST", path, headers=_auth_headers(), json_data=payload)
    return status, data, headers

async def _discord_delete_message(session, channel_id: str, message_id: str):
    """Supprime un message Discord"""
    status, data, _ = await _discord_request(
        session, "DELETE", f"/channels/{channel_id}/messages/{message_id}", headers=_auth_headers()
    )
    return status < 300


async def _discord_delete_channel(session, channel_id: str) -> Tuple[bool, int]:
    """Supprime un channel/thread Discord (DELETE /channels/{channel_id}). Retourne (succès, status_code)."""
    status, data, _ = await _discord_request(
        session, "DELETE", f"/channels/{channel_id}", headers=_auth_headers()
    )
    return (status < 300, status)


async def _delete_old_metadata_messages(session, thread_id: str, keep_message_id: str = None):
    """
    Supprime tous les anciens messages de métadonnées dans un thread.
    Garde uniquement le message spécifié (si fourni) ou le plus récent.
    
    Args:
        session: Session aiohttp
        thread_id: ID du thread
        keep_message_id: ID du message à garder (optionnel)
    
    Returns:
        Nombre de messages supprimés
    """
    try:
        messages = await _discord_list_messages(session, thread_id, limit=50)
        metadata_messages = []
        
        # Trouver tous les messages de métadonnées
        for m in messages:
            msg_id = m.get("id")
            if not msg_id:
                continue
            
            # Ignorer le message à garder
            if keep_message_id and msg_id == keep_message_id:
                continue
            
            # Vérifier si c'est un message de métadonnées
            for e in (m.get("embeds") or []):
                footer = (e.get("footer") or {}).get("text") or ""
                if footer.startswith("metadata:v1:") or footer.startswith("metadata:"):
                    metadata_messages.append(msg_id)
                    break
        
        # Supprimer tous les anciens messages de métadonnées
        deleted_count = 0
        for msg_id in metadata_messages:
            if await _discord_delete_message(session, thread_id, msg_id):
                deleted_count += 1
                logger.info(f"🗑️ Message metadata supprimé: {msg_id}")
            else:
                logger.warning(f"⚠️ Échec suppression message metadata: {msg_id}")
        
        if deleted_count > 0:
            logger.info(f"✅ {deleted_count} ancien(s) message(s) metadata supprimé(s)")
        
        return deleted_count
    except Exception as e:
        logger.warning(f"⚠️ Exception suppression anciens messages metadata: {e}")
        return 0

def _message_has_metadata_embed(msg_dict: dict) -> bool:
    """Indique si le message contient un embed de métadonnées (footer metadata:v1:)."""
    for e in (msg_dict.get("embeds") or []):
        footer = (e.get("footer") or {}).get("text") or ""
        if footer.startswith("metadata:v1:") or footer.startswith("metadata:"):
            return True
    return False

# Type de message Discord : changement de nom du channel/thread ("X a changé le titre du post : …")
CHANNEL_NAME_CHANGE_TYPE = 4


def _is_message_empty_and_not_metadata(msg_dict: dict) -> bool:
    """
    True si le message est totalement vide : pas de contenu, pas de pièce jointe, pas d'embed.
    On ne supprime jamais les messages contenant les métadonnées ni ceux avec un embed (image, etc.).
    """
    content = (msg_dict.get("content") or "").strip()
    if content:
        return False
    attachments = msg_dict.get("attachments") or []
    if attachments:
        return False
    embeds = msg_dict.get("embeds") or []
    if not embeds:
        return True
    if _message_has_metadata_embed(msg_dict):
        return False
    return False


def _is_message_thread_name_change(msg_dict: dict) -> bool:
    """
    True si le message est une notification "X a changé le titre du post" (type CHANNEL_NAME_CHANGE ou contenu similaire).
    Ces messages ne sont pas utiles et peuvent être supprimés par le nettoyage.
    """
    if msg_dict.get("type") == CHANNEL_NAME_CHANGE_TYPE:
        return True
    content = (msg_dict.get("content") or "").strip()
    if not content:
        return False
    # Secours : message bot avec texte "a changé le titre" / "changed the thread name"
    lower = content.lower()
    if "a changé le titre" in lower or "changed the thread name" in lower or "changed the channel name" in lower:
        return True
    return False


async def _clean_empty_messages_in_thread(session, thread_id: str) -> int:
    """
    Supprime dans un thread :
    - les messages vides (pas de contenu, pièce jointe ni embed utile) ;
    - les messages "X a changé le titre du post" (type CHANNEL_NAME_CHANGE ou contenu similaire).
    Sauf le message de départ et les messages contenant les métadonnées.
    L'API renvoie les messages du plus récent au plus ancien ; le dernier de la liste est le message de départ.
    Returns:
        Nombre de messages supprimés
    """
    try:
        messages = await _discord_list_messages(session, thread_id, limit=50)
        if len(messages) <= 1:
            return 0
        # Ne jamais supprimer le message de départ (le plus ancien = dernier de la liste)
        starter_id = messages[-1].get("id") if messages else None
        to_delete = []
        for m in messages[:-1]:
            msg_id = m.get("id")
            if not msg_id or msg_id == starter_id:
                continue
            if _is_message_empty_and_not_metadata(m) or _is_message_thread_name_change(m):
                to_delete.append(msg_id)
        deleted = 0
        for msg_id in to_delete:
            # Délai entre chaque suppression (0.5-1 seconde)
            if deleted > 0:
                await asyncio.sleep(0.5 + random.random() * 0.5)
            
            if await _discord_delete_message(session, thread_id, msg_id):
                deleted += 1
                logger.info(f"🗑️ Message vide ou « titre changé » supprimé: {msg_id} (thread {thread_id})")
            else:
                logger.warning(f"⚠️ Échec suppression message: {msg_id}")
        return deleted
    except Exception as e:
        logger.warning(f"⚠️ Exception nettoyage messages vides (thread {thread_id}): {e}")
        return 0

async def _discord_suppress_embeds(session, channel_id: str, message_id: str) -> bool:
    try:
        status, msg = await _discord_get(session, f"/channels/{channel_id}/messages/{message_id}")
        if status >= 300:
            logger.warning(f"⚠️ Impossible de lire le message avant SUPPRESS_EMBEDS (status={status}): {msg}")
            return False

        new_flags = (msg.get("flags", 0) | 4)

        status, data = await _discord_patch_json(
            session,
            f"/channels/{channel_id}/messages/{message_id}",
            {"flags": new_flags}
        )
        if status >= 300:
            logger.warning(f"⚠️ Impossible de SUPPRESS_EMBEDS (status={status}): {data}")
            return False

        return True
    except Exception as e:
        logger.warning(f"⚠️ Exception SUPPRESS_EMBEDS: {e}")
        return False

async def _resolve_applied_tag_ids(session, forum_id, tags_raw):
    wanted = [t.strip() for t in (tags_raw or "").replace(';', ',').replace('|', ',').split(',') if t.strip()]
    if not wanted: return []
    status, ch = await _discord_get(session, f"/channels/{forum_id}")
    if status >= 300: return []
    available = ch.get("available_tags", [])
    applied = []
    for w in wanted:
        if w.isdigit():
            applied.append(int(w))
        else:
            for t in available:
                if t.get("name", "").lower() == w.lower():
                    applied.append(int(t["id"]))
                    break
    return list(dict.fromkeys(applied))

def _strip_image_url_from_content(content: str, image_url: str) -> str:
    """Retire l'URL d'image du contenu (lien et retours à la ligne autour)."""
    final_content = content or " "
    final_content = re.sub(r'\n\s*' + re.escape(image_url) + r'\s*\n?', '\n', final_content)
    final_content = re.sub(r'\n\s*' + re.escape(image_url) + r'\s*$', '', final_content)
    final_content = re.sub(re.escape(image_url), '', final_content)
    final_content = re.sub(r'\n\n\n+', '\n\n', final_content)
    return final_content.strip()


async def _create_forum_post(session, forum_id, title, content, tags_raw, images, metadata_b64=None):
    """
    Crée un post de forum Discord.
    - L'image est envoyée en pièce jointe (fichier joint) sur le 1er message (téléchargée depuis l'URL).
    - Les métadonnées sont stockées dans un 2e message (embed) puis SUPPRESS_EMBEDS sur ce 2e message.
    """
    applied_tag_ids = await _resolve_applied_tag_ids(session, forum_id, tags_raw)

    # Détecter une URL d'image dans le contenu (y compris query string complète)
    image_exts = r"(?:jpg|jpeg|png|gif|webp|avif|bmp|svg|ico|tiff|tif)"
    image_url_pattern = re.compile(
        rf"https?://[^\s<>\"']+\.{image_exts}(?:\?[^\s<>\"']*)?",
        re.IGNORECASE
    )
    image_urls_full = [m.group(0) for m in image_url_pattern.finditer(content or "")]

    final_content = content or " "
    use_attachment = False
    file_bytes, filename, content_type = None, "image.png", "image/png"

    if image_urls_full:
        image_url = image_urls_full[0]
        # Télécharger l'image et l'envoyer en pièce jointe (au lieu d'embed)
        fetched = await _fetch_image_from_url(session, image_url)
        if fetched:
            file_bytes, filename, content_type = fetched
            final_content = _strip_image_url_from_content(content or " ", image_url)
            use_attachment = True
            logger.info(f"✅ Image en pièce jointe (message principal): {image_url[:60]}...")
        else:
            # Fallback : embed si le téléchargement échoue
            final_content = _strip_image_url_from_content(content or " ", image_url)
            logger.info(f"⚠️ Téléchargement image échoué, fallback embed: {image_url[:60]}...")

    if use_attachment and file_bytes:
        status, data, _ = await _discord_post_thread_with_attachment(
            session, forum_id, title, final_content or " ", applied_tag_ids,
            file_bytes, filename, content_type
        )
    else:
        # Sans image ou fallback embed
        message_embeds = []
        if image_urls_full and not use_attachment:
            message_embeds.append({"image": {"url": image_urls_full[0]}})
        message_payload = {"content": final_content or " ", "embeds": message_embeds}
        payload = {"name": title, "message": message_payload}
        if applied_tag_ids:
            payload["applied_tags"] = applied_tag_ids
        status, data, _ = await _discord_post_json(session, f"/channels/{forum_id}/threads", payload)

    if status >= 300:
        return False, {"status": status, "discord": data}

    thread_id = data.get("id")
    # Discord peut renvoyer le message starter dans "message" ou last_message_id (channel object)
    message_id = (data.get("message") or {}).get("id") or data.get("message_id") or data.get("last_message_id")
    if not message_id and thread_id:
        # Fallback : récupérer l'id du message de départ en listant les messages du thread
        try:
            messages = await _discord_list_messages(session, str(thread_id), limit=5)
            if messages:
                # Les messages sont du plus récent au plus ancien ; le dernier est le message de départ
                message_id = (messages[-1] or {}).get("id")
        except Exception as e:
            logger.warning(f"⚠️ Impossible de récupérer le message de départ (thread {thread_id}): {e}")
    # Garantir des chaînes pour le frontend (suppression, historique)
    thread_id = str(thread_id) if thread_id is not None else None
    message_id = str(message_id) if message_id is not None else None

    # Publier les métadonnées dans un 2e message puis SUPPRESS_EMBEDS sur ce 2e message
    # Structure: Message 1 = contenu + image, Message 2 = métadonnées
    if metadata_b64 and thread_id:
        try:
            if len(metadata_b64) > 25000:
                logger.warning("⚠️ metadata_b64 trop long, metadata message ignoré pour éviter un 400 Discord")
            else:
                # Supprimer tous les anciens messages de métadonnées avant d'en créer un nouveau
                await _delete_old_metadata_messages(session, str(thread_id))
                
                meta_payload = {
                    "content": " ",
                    "embeds": [_build_metadata_embed(metadata_b64)]
                }
                s2, d2, _ = await _discord_post_json(session, f"/channels/{thread_id}/messages", meta_payload)
                if s2 < 300 and isinstance(d2, dict) and d2.get("id"):
                    await _discord_suppress_embeds(session, str(thread_id), str(d2["id"]))
                else:
                    logger.warning(f"⚠️ Échec création message metadata (status={s2}): {d2}")
        except Exception as e:
            logger.warning(f"⚠️ Exception création/suppression metadata message: {e}")

    return True, {
        "thread_id": thread_id,
        "message_id": message_id,
        "guild_id": data.get("guild_id"),
        "thread_url": f"https://discord.com/channels/{data.get('guild_id')}/{thread_id}"
    }

def _get_client_ip(request) -> str:
    """Extrait l'IP du client en tenant compte des reverse proxies."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return request.remote or "unknown"

def _with_cors(request, resp):
    """Applique les headers CORS avec whitelist d'origines autorisées."""
    origin = request.headers.get("Origin", "")
    
    # Parse ALLOWED_ORIGINS (par défaut: tauri://localhost)
    allowed_raw = config.ALLOWED_ORIGINS or "tauri://localhost"
    allowed_origins = [o.strip() for o in allowed_raw.split(",") if o.strip()]
    
    # Autoriser si l'origine est dans la whitelist ou si elle commence par http://localhost ou http://127.0.0.1
    if origin in allowed_origins or origin.startswith("http://localhost") or origin.startswith("http://127.0.0.1") or origin.startswith("tauri://"):
        resp.headers.update({
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Credentials": "true"
        })
    else:
        # Fallback pour compatibilité (peut être retiré en production stricte)
        resp.headers.update({
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
            "Access-Control-Allow-Headers": "*"
        })
    
    return resp


async def _send_announcement(
    session,
    is_update: bool,
    title: str,
    thread_url: str,
    translator_label: str,
    state_label: str,
    game_version: str,
    translate_version: str,
    image_url: Optional[str] = None,
) -> bool:
    """
    Envoie l'annonce (nouvelle traduction ou mise à jour) dans PUBLISHER_ANNOUNCE_CHANNEL_ID.
    Format défini : titre, nom du jeu (lien), traducteur, versions, état, Bon jeu à vous 😊, embed image.
    """
    if not config.PUBLISHER_ANNOUNCE_CHANNEL_ID:
        logger.warning("⚠️ PUBLISHER_ANNOUNCE_CHANNEL_ID non configuré, annonce non envoyée")
        return False
    title_clean = (title or "").strip() or "Sans titre"
    game_version = (game_version or "").strip() or "Non spécifiée"
    translate_version = (translate_version or "").strip() or "Non spécifiée"
    prefixe = "🔄 **Mise à jour d'une traduction**" if is_update else "🎮 **Nouvelle traduction**"
    msg_content = f"{prefixe}\n\n"
    msg_content += f"**Nom du jeu :** [{title_clean}]({thread_url})\n"
    if translator_label and translator_label.strip():
        msg_content += f"**Traducteur :** {translator_label.strip()}\n"
    msg_content += f"**Version du jeu :** `{game_version}`\n"
    msg_content += f"**Version de la traduction :** `{translate_version}`\n"
    if state_label and state_label.strip():
        msg_content += f"\n**État :** {state_label.strip()}\n"
    msg_content += "\n**Bon jeu à vous** 😊"
    payload = {"content": msg_content}
    if image_url and image_url.strip().startswith("http"):
        payload["embeds"] = [{"color": 0x4ADE80, "image": {"url": image_url.strip()}}]
    status, data, _ = await _discord_post_json(
        session,
        f"/channels/{config.PUBLISHER_ANNOUNCE_CHANNEL_ID}/messages",
        payload,
    )
    if status >= 300:
        logger.warning(f"⚠️ Échec envoi annonce (status={status}): {data}")
        return False
    logger.info(f"✅ Annonce envoyée ({'mise à jour' if is_update else 'nouvelle traduction'}): {title_clean}")
    return True


async def _send_deletion_announcement(
    session,
    title: str,
    reason: str = None,
) -> bool:
    """
    Envoie une annonce de suppression de post dans PUBLISHER_ANNOUNCE_CHANNEL_ID.
    Format : titre du post supprimé, raison si fournie.
    """
    if not config.PUBLISHER_ANNOUNCE_CHANNEL_ID:
        logger.warning("⚠️ PUBLISHER_ANNOUNCE_CHANNEL_ID non configuré, annonce de suppression non envoyée")
        return False
    
    title_clean = (title or "").strip() or "Publication"
    reason_clean = (reason or "").strip()
    
    msg_content = "🗑️ **Suppression d'une publication**\n\n"
    msg_content += f"**Publication supprimée :** {title_clean}\n"
    
    if reason_clean:
        msg_content += f"**Raison :** {reason_clean}\n"
    
    payload = {
        "content": msg_content,
        "embeds": [{
            "color": 0xFF6B6B,  # Rouge pour suppression
            "footer": {
                "text": "Cette publication a été retirée définitivement"
            }
        }]
    }
    
    status, data, _ = await _discord_post_json(
        session,
        f"/channels/{config.PUBLISHER_ANNOUNCE_CHANNEL_ID}/messages",
        payload,
    )
    
    if status >= 300:
        logger.warning(f"⚠️ Échec envoi annonce suppression (status={status}): {data}")
        return False
    
    logger.info(f"✅ Annonce de suppression envoyée: {title_clean}")
    return True


# ==================== HANDLERS HTTP ====================
async def health(request):
    return _with_cors(request, web.json_response({"ok": True, "configured": config.configured, "rate_limit": rate_limiter.get_info()}))

async def options_handler(request):
    return _with_cors(request, web.Response(status=204))

async def configure(request):
    """Handler pour configurer l'API (protégé par clé API)."""
    api_key = request.headers.get("X-API-KEY") or request.query.get("api_key")
    if api_key != config.PUBLISHER_API_KEY:
        client_ip = _get_client_ip(request)
        logger.warning(f"[AUTH] 🚫 API Auth failed from {client_ip} - Invalid API key (route: /api/configure)")
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    
    try:
        data = await request.json()
        config.update_from_frontend(data)
        resp = web.json_response({"ok": True, "message": "Configuration mise à jour", "configured": config.configured})
        return _with_cors(request, resp)
    except Exception as e:
        logger.error(f"[API] Erreur configuration: {e}")
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=400))

async def forum_post(request):
    """Handler pour publier un post dans le salon my uniquement."""
    api_key = request.headers.get("X-API-KEY") or request.query.get("api_key")
    if api_key != config.PUBLISHER_API_KEY:
        client_ip = _get_client_ip(request)
        logger.warning(f"[AUTH] 🚫 API Auth failed from {client_ip} - Invalid API key (route: /api/forum-post)")
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    if not config.FORUM_MY_ID:
        return _with_cors(request, web.json_response({"ok": False, "error": "PUBLISHER_FORUM_TRAD_ID non configuré"}, status=500))
    title, content, tags, metadata_b64 = "", "", "", None
    translator_label, state_label, game_version, translate_version, announce_image_url = "", "", "", "", ""
    history_payload_raw = None
    reader = await request.multipart()
    async for part in reader:
        if part.name == "title":
            title = (await part.text()).strip()
        elif part.name == "content":
            content = (await part.text()).strip()
        elif part.name == "tags":
            tags = (await part.text()).strip()
        elif part.name == "metadata":
            metadata_b64 = (await part.text()).strip()
        elif part.name == "translator_label":
            translator_label = (await part.text()).strip()
        elif part.name == "state_label":
            state_label = (await part.text()).strip()
        elif part.name == "game_version":
            game_version = (await part.text()).strip()
        elif part.name == "translate_version":
            translate_version = (await part.text()).strip()
        elif part.name == "announce_image_url":
            announce_image_url = (await part.text()).strip()
        elif part.name == "history_payload":
            history_payload_raw = (await part.text()).strip()
    forum_id = config.FORUM_MY_ID

    async with aiohttp.ClientSession() as session:
        ok, result = await _create_forum_post(session, forum_id, title, content, tags, [], metadata_b64)
        if ok and config.PUBLISHER_ANNOUNCE_CHANNEL_ID:
            await _send_announcement(
                session,
                is_update=False,
                title=title,
                thread_url=result.get("thread_url", ""),
                translator_label=translator_label,
                state_label=state_label,
                game_version=game_version,
                translate_version=translate_version,
                image_url=announce_image_url or None,
            )

    if not ok:
        return _with_cors(request, web.json_response({"ok": False, "details": result}, status=500))

    if history_payload_raw:
        try:
            payload = json.loads(history_payload_raw)
            payload["thread_id"] = result.get("thread_id") or ""
            payload["message_id"] = result.get("message_id") or ""
            payload["discord_url"] = result.get("thread_url") or ""
            payload["forum_id"] = forum_id
            ts = int(time.time() * 1000)
            if "created_at" not in payload or not payload.get("created_at"):
                payload["created_at"] = datetime.datetime.now(ZoneInfo("UTC")).isoformat()
            payload["updated_at"] = datetime.datetime.now(ZoneInfo("UTC")).isoformat()
            if "timestamp" not in payload:
                payload["timestamp"] = ts
            history_manager.update_or_add_post(payload)
            
            # 🔥 SAUVEGARDER DANS SUPABASE (source de vérité)
            sb = _get_supabase()
            if sb:
                try:
                    # Supprimer les champs qui ne sont pas dans la table Supabase
                    supabase_payload = {k: v for k, v in payload.items() if k not in ['timestamp', 'template']}
                    res = sb.table("published_posts").upsert(supabase_payload, on_conflict="id").execute()
                    logger.info(f"✅ Post enregistré dans Supabase: {payload.get('title')}")
                except Exception as e:
                    logger.warning(f"⚠️ Échec sauvegarde Supabase lors de la création: {e}")
        except Exception as e:
            logger.warning(f"Historique (create): payload invalide, fallback minimal: {e}")
            fallback_payload = {
                "id": f"post_{int(time.time())}",
                "timestamp": int(time.time() * 1000),
                "title": title,
                "content": content,
                "tags": tags,
                "template": "my",
                "thread_id": result["thread_id"],
                "message_id": result["message_id"],
                "discord_url": result["thread_url"],
                "forum_id": forum_id,
            }
            history_manager.update_or_add_post(fallback_payload)
            
            # 🔥 SAUVEGARDER DANS SUPABASE (fallback)
            sb = _get_supabase()
            if sb:
                try:
                    supabase_fallback = {k: v for k, v in fallback_payload.items() if k not in ['timestamp', 'template']}
                    supabase_fallback["created_at"] = datetime.datetime.now(ZoneInfo("UTC")).isoformat()
                    supabase_fallback["updated_at"] = datetime.datetime.now(ZoneInfo("UTC")).isoformat()
                    res = sb.table("published_posts").upsert(supabase_fallback, on_conflict="id").execute()
                    logger.info(f"✅ Post (fallback) enregistré dans Supabase: {title}")
                except Exception as e2:
                    logger.warning(f"⚠️ Échec sauvegarde Supabase fallback: {e2}")
    else:
        fallback_payload = {
            "id": f"post_{int(time.time())}",
            "timestamp": int(time.time() * 1000),
            "title": title,
            "content": content,
            "tags": tags,
            "template": "my",
            "thread_id": result["thread_id"],
            "message_id": result["message_id"],
            "discord_url": result["thread_url"],
            "forum_id": forum_id,
        }
        history_manager.update_or_add_post(fallback_payload)
        
        # 🔥 SAUVEGARDER DANS SUPABASE
        sb = _get_supabase()
        if sb:
            try:
                supabase_fallback = {k: v for k, v in fallback_payload.items() if k not in ['timestamp', 'template']}
                supabase_fallback["created_at"] = datetime.datetime.now(ZoneInfo("UTC")).isoformat()
                supabase_fallback["updated_at"] = datetime.datetime.now(ZoneInfo("UTC")).isoformat()
                res = sb.table("published_posts").upsert(supabase_fallback, on_conflict="id").execute()
                logger.info(f"✅ Post (no payload) enregistré dans Supabase: {title}")
            except Exception as e:
                logger.warning(f"⚠️ Échec sauvegarde Supabase no payload: {e}")

    return _with_cors(request, web.json_response({"ok": True, **result}))

async def forum_post_update(request):
    """Handler pour mettre à jour un post (salon my uniquement)."""
    api_key = request.headers.get("X-API-KEY") or request.query.get("api_key")
    if api_key != config.PUBLISHER_API_KEY:
        client_ip = _get_client_ip(request)
        logger.warning(f"[AUTH] 🚫 API Auth failed from {client_ip} - Invalid API key (route: /api/forum-post/update)")
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    if not config.FORUM_MY_ID:
        return _with_cors(request, web.json_response({"ok": False, "error": "PUBLISHER_FORUM_TRAD_ID non configuré"}, status=500))
    
    title, content, tags, thread_id, message_id, metadata_b64 = "", "", "", None, None, None
    translator_label, state_label, game_version, translate_version, announce_image_url, thread_url = "", "", "", "", "", ""
    history_payload_raw = None
    silent_update = False

    reader = await request.multipart()
    async for part in reader:
        if part.name == "silent_update":
            val = (await part.text()).strip().lower()
            silent_update = val in ("true", "1", "yes")
        elif part.name == "title":
            title = (await part.text()).strip()
        elif part.name == "content":
            content = (await part.text()).strip()
        elif part.name == "tags":
            tags = (await part.text()).strip()
        elif part.name == "threadId":
            thread_id = (await part.text()).strip()
        elif part.name == "messageId":
            message_id = (await part.text()).strip()
        elif part.name == "metadata":
            metadata_b64 = (await part.text()).strip()
        elif part.name == "translator_label":
            translator_label = (await part.text()).strip()
        elif part.name == "state_label":
            state_label = (await part.text()).strip()
        elif part.name == "game_version":
            game_version = (await part.text()).strip()
        elif part.name == "translate_version":
            translate_version = (await part.text()).strip()
        elif part.name == "announce_image_url":
            announce_image_url = (await part.text()).strip()
        elif part.name == "thread_url":
            thread_url = (await part.text()).strip()
        elif part.name == "history_payload":
            history_payload_raw = (await part.text()).strip()

    if not thread_id or not message_id:
        return _with_cors(request, web.json_response({"ok": False, "error": "threadId and messageId required"}, status=400))

    logger.info(f"🔄 Mise à jour post: {title} (thread: {thread_id})")

    async with aiohttp.ClientSession() as session:
        message_path = f"/channels/{thread_id}/messages/{message_id}"

        # Détecter une URL d'image dans le contenu (y compris query string complète)
        image_exts = r"(?:jpg|jpeg|png|gif|webp|avif|bmp|svg|ico|tiff|tif)"
        image_url_pattern = re.compile(
            rf"https?://[^\s<>\"']+\.{image_exts}(?:\?[^\s<>\"']*)?",
            re.IGNORECASE
        )
        image_urls_full = [m.group(0) for m in image_url_pattern.finditer(content or "")]

        final_content = content or " "
        use_attachment = False
        file_bytes, filename, content_type = None, "image.png", "image/png"

        if image_urls_full:
            image_url = image_urls_full[0]
            fetched = await _fetch_image_from_url(session, image_url)
            if fetched:
                file_bytes, filename, content_type = fetched
                final_content = _strip_image_url_from_content(content or " ", image_url)
                use_attachment = True
                logger.info(f"✅ Image en pièce jointe (update message principal): {image_url[:60]}...")
            else:
                final_content = _strip_image_url_from_content(content or " ", image_url)
                logger.info(f"⚠️ Téléchargement image échoué (update), pas de nouvelle image")

        if use_attachment and file_bytes:
            status, data = await _discord_patch_message_with_attachment(
                session, str(thread_id), str(message_id), final_content or " ",
                file_bytes, filename, content_type
            )
        else:
            # Mise à jour du contenu uniquement (sans nouvelle image ; pas d'embed)
            message_payload = {"content": final_content or " ", "embeds": []}
            status, data = await _discord_patch_json(session, message_path, message_payload)

        if status >= 300:
            return _with_cors(request, web.json_response({"ok": False, "details": data}, status=500))

        # Mettre à jour/créer le message metadata séparé (et le SUPPRESS)
        # Structure: Message 1 = contenu + image, Message 2 = métadonnées
        if metadata_b64:
            try:
                if len(metadata_b64) > 25000:
                    logger.warning("⚠️ metadata_b64 trop long, metadata message ignoré pour éviter un 400 Discord")
                else:
                    messages = await _discord_list_messages(session, str(thread_id), limit=50)
                    metadata_message_id = None
                    for m in messages:
                        for e in (m.get("embeds") or []):
                            footer = (e.get("footer") or {}).get("text") or ""
                            if footer.startswith("metadata:v1:") or footer.startswith("metadata:"):
                                metadata_message_id = m.get("id")
                                break
                        if metadata_message_id:
                            break

                    meta_payload = {"content": " ", "embeds": [_build_metadata_embed(metadata_b64)]}
                    if metadata_message_id:
                        # Mettre à jour le message existant
                        s3, d3 = await _discord_patch_json(session, f"/channels/{thread_id}/messages/{metadata_message_id}", meta_payload)
                        if s3 < 300:
                            await _discord_suppress_embeds(session, str(thread_id), str(metadata_message_id))
                            # Supprimer les autres anciens messages de métadonnées (s'il y en a)
                            await _delete_old_metadata_messages(session, str(thread_id), keep_message_id=str(metadata_message_id))
                        else:
                            logger.warning(f"⚠️ Échec update metadata message (status={s3}): {d3}")
                    else:
                        # Supprimer tous les anciens messages de métadonnées avant d'en créer un nouveau
                        await _delete_old_metadata_messages(session, str(thread_id))
                        
                        # Créer un nouveau message de métadonnées
                        s2, d2, _ = await _discord_post_json(session, f"/channels/{thread_id}/messages", meta_payload)
                        if s2 < 300 and isinstance(d2, dict) and d2.get("id"):
                            await _discord_suppress_embeds(session, str(thread_id), str(d2["id"]))
                        else:
                            logger.warning(f"⚠️ Échec création metadata message (status={s2}): {d2}")
            except Exception as e:
                logger.warning(f"⚠️ Exception update/création metadata message: {e}")

        # Mettre à jour le titre et les tags du thread
        applied_tag_ids = await _resolve_applied_tag_ids(session, config.FORUM_MY_ID, tags)
        status, data = await _discord_patch_json(session, f"/channels/{thread_id}", {
            "name": title,
            "applied_tags": applied_tag_ids
        })

        if status >= 300:
            return _with_cors(request, web.json_response({"ok": False, "details": data}, status=500))

        if config.PUBLISHER_ANNOUNCE_CHANNEL_ID and thread_url and not silent_update:
            await _send_announcement(
                session,
                is_update=True,
                title=title,
                thread_url=thread_url,
                translator_label=translator_label,
                state_label=state_label,
                game_version=game_version,
                translate_version=translate_version,
                image_url=announce_image_url or None,
            )
        elif silent_update:
            logger.info(f"🔇 Mise à jour silencieuse (sans annonce): {title}")

        # 🔥 RECONSTRUCTION DU PAYLOAD COMPLET POUR L'HISTORIQUE
        ts = int(time.time() * 1000)
        
        # Récupérer l'entrée existante depuis Supabase pour fusionner
        loop = asyncio.get_event_loop()
        existing_row = await loop.run_in_executor(None, _fetch_post_by_thread_id_sync, thread_id)
        
        if history_payload_raw:
            try:
                payload = json.loads(history_payload_raw)
            except Exception as e:
                logger.warning(f"⚠️ Payload JSON invalide, création minimal: {e}")
                payload = {}
        else:
            payload = {}
        
        # Fusionner avec les données existantes (si trouvées)
        if existing_row:
            # Garder les champs non modifiés de l'ancien post
            final_payload = dict(existing_row)  # Copie de l'existant
            # Écraser avec les nouvelles valeurs du payload
            final_payload.update(payload)
        else:
            final_payload = payload
        
        # Forcer les champs reçus (priorité aux nouvelles valeurs)
        final_payload["thread_id"] = thread_id
        final_payload["message_id"] = message_id
        final_payload["discord_url"] = (thread_url or "").strip() or final_payload.get("discord_url") or ""
        final_payload["title"] = title
        final_payload["content"] = content
        final_payload["tags"] = tags
        final_payload["updated_at"] = datetime.datetime.now(ZoneInfo("UTC")).isoformat()
        
        # S'assurer que created_at existe
        if "created_at" not in final_payload or not final_payload.get("created_at"):
            final_payload["created_at"] = datetime.datetime.now(ZoneInfo("UTC")).isoformat()
        
        # Normaliser le payload (snake_case)
        final_payload = _normalize_history_row(final_payload)
        
        # Sauvegarder dans l'historique
        history_manager.update_or_add_post(final_payload)
        
        # 🔥 SAUVEGARDER DANS SUPABASE (source de vérité)
        sb = _get_supabase()
        if sb:
            try:
                # Supprimer les clamps qui ne sont pas dans la table Supabase
                supabase_payload = {k: v for k, v in final_payload.items() if k not in ['timestamp', 'template']}
                res = sb.table("published_posts").upsert(supabase_payload, on_conflict="id").execute()
                logger.info(f"✅ Post enregistré dans Supabase: {final_payload.get('title')}")
            except Exception as e:
                logger.warning(f"⚠️ Échec sauvegarde Supabase lors de la mise à jour: {e}")

    return _with_cors(request, web.json_response({
        "ok": True, 
        "updated": True, 
        "thread_id": thread_id,
        "message_id": message_id,
        "thread_url": thread_url,
        "discord_url": thread_url,
        "forum_id": config.FORUM_MY_ID or 0,
        # Aliases pour compatibilité
        "threadId": thread_id,
        "messageId": message_id,
        "threadUrl": thread_url,
        "discordUrl": thread_url,
        "forumId": config.FORUM_MY_ID or 0
    }))

async def get_history(request):
    api_key = request.headers.get("X-API-KEY") or request.query.get("api_key")
    if api_key != config.PUBLISHER_API_KEY:
        client_ip = _get_client_ip(request)
        logger.warning(f"[AUTH] 🚫 API Auth failed from {client_ip} - Invalid API key (route: /api/history)")
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    posts = history_manager.get_posts()
    return _with_cors(request, web.json_response({"ok": True, "posts": posts, "count": len(posts)}))


async def forum_post_delete(request):
    """
    Supprime définitivement un post de TOUS les systèmes :
    1. Thread Discord (tous les messages)
    2. Historique local (JSON)
    3. Base de données Supabase
    """
    api_key = request.headers.get("X-API-KEY") or request.query.get("api_key")
    if api_key != config.PUBLISHER_API_KEY:
        client_ip = _get_client_ip(request)
        logger.warning(f"[AUTH] 🚫 API Auth failed from {client_ip} - Invalid API key (route: /api/forum-post/delete)")
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    
    try:
        body = await request.json()
    except Exception as e:
        logger.warning(f"⚠️ Erreur lecture body suppression: {e}")
        body = {}
    
    thread_id = (body.get("threadId") or body.get("thread_id") or "").strip()
    post_id = (body.get("postId") or body.get("post_id") or body.get("id") or "").strip()
    post_title = (body.get("postTitle") or body.get("title") or "").strip()
    reason = (body.get("reason") or "").strip()
    
    logger.info(f"🗑️ Suppression post: {post_title or post_id} (thread={thread_id}, raison={reason or 'N/A'})")
    
    if not thread_id:
        # Pas de thread Discord : succès sans appeler Discord (suppression historique/base uniquement)
        if post_id:
            # Suppression historique local
            history_manager.delete_post(post_id=post_id)
            # 🔥 SUPPRESSION SUPABASE
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, _delete_from_supabase_sync, None, post_id)
        return _with_cors(request, web.json_response({"ok": True, "skipped_discord": True}))
    
    async with aiohttp.ClientSession() as session:
        deleted, status = await _discord_delete_channel(session, thread_id)
        
        if not deleted:
            if status == 404:
                logger.info(f"ℹ️ Thread déjà supprimé: {thread_id}")
                # Supprimer quand même de l'historique et Supabase
                history_manager.delete_post(thread_id=thread_id)
                # 🔥 SUPPRESSION SUPABASE
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, _delete_from_supabase_sync, thread_id, post_id)
                return _with_cors(request, web.json_response({"ok": False, "error": "Thread introuvable (déjà supprimé ?)", "not_found": True}, status=404))
            logger.warning(f"⚠️ Échec suppression thread Discord: {thread_id} (status={status})")
            return _with_cors(request, web.json_response({"ok": False, "error": "Échec suppression du thread sur Discord"}, status=500))
        
        # Supprimer de l'historique
        history_manager.delete_post(thread_id=thread_id)
        
        # 🔥 SUPPRESSION SUPABASE
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _delete_from_supabase_sync, thread_id, post_id)
        
        # 🔥 Envoyer l'annonce de suppression dans le salon Discord
        if post_title:  # Seulement si on a un titre
            await _send_deletion_announcement(session, post_title, reason)
    
    logger.info(f"✅ Post supprimé complètement: {post_title or thread_id}")
    return _with_cors(request, web.json_response({"ok": True, "thread_id": thread_id}))

# ==================== APPLICATION WEB ====================
app = web.Application()
app.add_routes([
    web.get('/api/publisher/health', health),
    web.post('/api/forum-post', forum_post),
    web.post('/api/forum-post/update', forum_post_update),
    web.post('/api/forum-post/delete', forum_post_delete),
    web.get('/api/history', get_history),
    web.post('/api/configure', configure),
    web.options('/{tail:.*}', options_handler)
])

# ==================== LANCEMENT ====================
async def start_web_server():
    """Lance le serveur web API REST"""
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', config.PORT)
    await site.start()
    logger.info(f"🌐 API REST démarrée sur le port {config.PORT}")

async def main():
    """Point d'entrée principal - Lance bot Discord + API REST en parallèle"""
    # Lancer le serveur web
    await start_web_server()
    
    # Lancer le bot Discord
    await bot.start(config.PUBLISHER_DISCORD_TOKEN)

if __name__ == '__main__':
    from discord.http import Route
    Route.BASE = "https://discord.com/api"
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("👋 Arrêt du bot...")
