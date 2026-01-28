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

# Discord imports
import discord
from discord.ext import commands, tasks
from discord import app_commands

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

load_dotenv()

# ==================== LOGGING ====================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# ==================== CONFIGURATION ====================
class Config:
    def __init__(self):
        # API REST
        self.DISCORD_PUBLISHER_TOKEN = os.getenv("DISCORD_PUBLISHER_TOKEN", "")
        self.PUBLISHER_API_KEY = os.getenv("PUBLISHER_API_KEY", "")
        self.ALLOWED_ORIGINS = os.getenv("PUBLISHER_ALLOWED_ORIGINS", "*")
        self.PORT = int(os.getenv("PORT", "8080"))
        self.DISCORD_API_BASE = os.getenv("DISCORD_API_BASE", "https://api-proxy-koyeb.a-fergani91.workers.dev")
        
        # Forums à contrôler
        self.FORUM_MY_ID = int(os.getenv("FORUM_CHANNEL_ID", "0")) if os.getenv("FORUM_CHANNEL_ID") else 0
        self.FORUM_PARTNER_ID = int(os.getenv("FORUM_PARTNER_ID", "0")) if os.getenv("FORUM_PARTNER_ID") else 0
        
        # Notification
        self.MAJ_NOTIFICATION_CHANNEL_ID = int(os.getenv("MAJ_NOTIFICATION_CHANNEL_ID", "0")) if os.getenv("MAJ_NOTIFICATION_CHANNEL_ID") else 0
        
        # Planification
        self.VERSION_CHECK_HOUR = int(os.getenv("VERSION_CHECK_HOUR", "6"))
        self.VERSION_CHECK_MINUTE = int(os.getenv("VERSION_CHECK_MINUTE", "0"))
        
        self.configured = bool(
            self.DISCORD_PUBLISHER_TOKEN and 
            self.FORUM_MY_ID and 
            self.FORUM_PARTNER_ID and
            self.MAJ_NOTIFICATION_CHANNEL_ID
        )
    
    def update_from_frontend(self, config_data: dict):
        if 'discordPublisherToken' in config_data and config_data['discordPublisherToken']:
            self.DISCORD_PUBLISHER_TOKEN = config_data['discordPublisherToken']
        if 'publisherForumMyId' in config_data and config_data['publisherForumMyId']:
            self.FORUM_MY_ID = int(config_data['publisherForumMyId'])
        if 'publisherForumPartnerId' in config_data and config_data['publisherForumPartnerId']:
            self.FORUM_PARTNER_ID = int(config_data['publisherForumPartnerId'])
        
        self.configured = bool(self.DISCORD_PUBLISHER_TOKEN and self.FORUM_MY_ID and self.FORUM_PARTNER_ID)
        logger.info(f"✅ Configuration mise à jour (configured: {self.configured})")

config = Config()
def get_publisher_token() -> str:
    # 1) env > 2) config en mémoire
    return (os.getenv("DISCORD_PUBLISHER_TOKEN") or config.DISCORD_PUBLISHER_TOKEN or "").strip()

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

# Extraction version depuis titre F95
_RE_BRACKETS = re.compile(r"\[(?P<val>[^\]]+)\]")

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
HISTORY_FILE = Path("publication_history.json")

class PublicationHistory:
    def __init__(self, history_file: Path = HISTORY_FILE):
        self.history_file = history_file
        self._ensure_file_exists()
    
    def _ensure_file_exists(self):
        if not self.history_file.exists():
            try:
                self.history_file.write_text(json.dumps([], ensure_ascii=False, indent=2), encoding='utf-8')
            except Exception as e:
                logger.warning(f"Impossible de créer le fichier d'historique: {e}")
    
    def add_post(self, post_data: Dict):
        try:
            if self.history_file.exists():
                content = self.history_file.read_text(encoding='utf-8')
                history = json.loads(content) if content.strip() else []
            else:
                history = []
            
            history.insert(0, post_data)
            if len(history) > 1000:
                history = history[:1000]
            
            self.history_file.write_text(
                json.dumps(history, ensure_ascii=False, indent=2),
                encoding='utf-8'
            )
            logger.info(f"✅ Post ajouté à l'historique: {post_data.get('title', 'N/A')}")
        except Exception as e:
            logger.error(f"Erreur lors de l'ajout à l'historique: {e}")
    
    def get_posts(self, limit: Optional[int] = None) -> List[Dict]:
        try:
            if not self.history_file.exists():
                return []
            content = self.history_file.read_text(encoding='utf-8')
            history = json.loads(content) if content.strip() else []
            return history[:limit] if limit else history
        except Exception as e:
            logger.error(f"Erreur lors de la lecture de l'historique: {e}")
            return []

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

def _normalize_version(version: str) -> str:
    """Normalise une version pour la comparaison (enlève backticks, espaces inutiles)"""
    if not version:
        return ""
    # Enlever backticks
    normalized = version.strip().replace('`', '')
    # Normaliser les espaces
    normalized = re.sub(r'\s+', ' ', normalized)
    return normalized.strip()

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
    Priorité : métadonnées embed > parsing texte
    
    Returns:
        (game_link, game_version) ou (None, None) si non trouvé
    """
    # Récupérer starter message
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
async def _update_post_version(thread: discord.Thread, new_version: str) -> bool:
    """
    Met à jour la version du jeu dans le post Discord (contenu + métadonnées)
    
    Returns:
        True si succès, False sinon
    """
    try:
        # Récupérer le message
        msg = thread.starter_message
        if not msg:
            msg = await thread.fetch_message(thread.id)
        
        if not msg:
            logger.error(f"❌ Message introuvable pour {thread.name}")
            return False
        
        content = msg.content or ""
        
        # 1️⃣ Mise à jour du contenu texte
        # Remplacer la version dans le format markdown
        new_content = _RE_GAME_VERSION_MD.sub(
            f"* **Version du jeu :** `{new_version}`",
            content
        )
        
        # Si pas de match markdown, essayer format plain
        if new_content == content:
            new_content = _RE_GAME_VERSION_PLAIN.sub(
                f"Version du jeu : `{new_version}`",
                content
            )
        
        # 2️⃣ Mise à jour des métadonnées dans l'embed
        new_embeds = []
        metadata_updated = False
        
        for embed in msg.embeds:
            footer_text = embed.footer.text if embed.footer else ""
            
            # Vérifier si c'est notre embed de métadonnées
            if footer_text and footer_text.startswith("metadata:v1:"):
                # Reconstruction et mise à jour des métadonnées
                chunks = []
                for field in embed.fields:
                    if field.name == "\u200b":
                        chunks.append(field.value)
                
                if chunks:
                    metadata_b64 = "".join(chunks)
                    try:
                        metadata = _decode_metadata_b64(metadata_b64)
                        if metadata:
                            # Mettre à jour game_version dans les métadonnées
                            metadata["game_version"] = new_version
                            metadata["timestamp"] = int(time.time() * 1000)
                            
                            # Ré-encoder en base64
                            metadata_json = json.dumps(metadata, ensure_ascii=False)
                            metadata_b64_new = base64.b64encode(metadata_json.encode('utf-8')).decode('utf-8')
                            
                            # Recréer l'embed avec les nouvelles métadonnées
                            new_embed = _build_metadata_embed(metadata_b64_new)
                            new_embeds.append(new_embed)
                            metadata_updated = True
                            logger.info(f"✅ Métadonnées mises à jour pour {thread.name}")
                    except Exception as e:
                        logger.warning(f"⚠️ Erreur mise à jour métadonnées: {e}")
                        new_embeds.append(embed.to_dict())
            else:
                # Garder les autres embeds tels quels
                new_embeds.append(embed.to_dict())
        
        # 3️⃣ Envoi de la modification
        try:
            await msg.edit(content=new_content, embeds=[discord.Embed.from_dict(e) for e in new_embeds])
            logger.info(f"✅ Post mis à jour pour {thread.name}: {new_version}")
            
            # 4️⃣ Masquer l'embed (SUPPRESS_EMBEDS) si métadonnées présentes
            if metadata_updated:
                try:
                    await msg.edit(suppress=True)
                except Exception as e:
                    logger.warning(f"⚠️ Impossible de masquer l'embed: {e}")
            
            return True
        except Exception as e:
            logger.error(f"❌ Erreur modification message pour {thread.name}: {e}")
            return False
        
    except Exception as e:
        logger.error(f"❌ Erreur mise à jour post {thread.name}: {e}")
        return False

# ==================== ALERTES VERSIONS ====================
class VersionAlert:
    """Représente une alerte de version"""
    def __init__(self, thread_name: str, thread_url: str, f95_version: Optional[str], 
                 post_version: Optional[str], forum_type: str, updated: bool):
        self.thread_name = thread_name
        self.thread_url = thread_url
        self.f95_version = f95_version
        self.post_version = post_version
        self.forum_type = forum_type  # "My" ou "Partner"
        self.updated = updated  # True si modification effectuée

async def _group_and_send_alerts(channel: discord.TextChannel, alerts: List[VersionAlert]):
    """Regroupe et envoie les alertes par catégorie (max 10 par message)"""
    if not alerts:
        return
    
    # Groupement par type (My/Partner)
    groups = {
        "My": [],
        "Partner": []
    }
    
    for alert in alerts:
        groups[alert.forum_type].append(alert)
    
    # Envoi par catégorie
    for forum_type, alert_list in groups.items():
        if not alert_list:
            continue
        
        forum_name = "Mes traductions" if forum_type == "My" else "Traductions partenaire"
        title = f"🚨 **Mises à jour détectées : {forum_name}** ({len(alert_list)} jeux)"
        
        # Découpage par paquets de 10
        for i in range(0, len(alert_list), 10):
            batch = alert_list[i:i+10]
            
            msg_parts = [title, ""]
            for alert in batch:
                if alert.f95_version:
                    # Version détectée sur F95
                    msg_parts.append(
                        f"**{alert.thread_name}**\n"
                        f"├ Version F95 : `{alert.f95_version}`\n"
                        f"├ Version du poste : `{alert.post_version or 'Non renseignée'}`\n"
                        f"├ Version modifiée : {'OUI ✅' if alert.updated else 'NON ❌'}\n"
                        f"└ Lien : {alert.thread_url}\n"
                    )
                else:
                    # Version non détectable sur F95
                    msg_parts.append(
                        f"**{alert.thread_name}**\n"
                        f"├ Version F95 : Non détectable ⚠️\n"
                        f"├ Version du poste : `{alert.post_version or 'Non renseignée'}`\n"
                        f"├ Version modifiée : NON\n"
                        f"└ Lien : {alert.thread_url}\n"
                    )
            
            await channel.send("\n".join(msg_parts))
            await asyncio.sleep(1.5)  # Anti-rate limit

# ==================== CONTRÔLE VERSIONS F95 ====================
async def run_version_check_once(forum_filter: Optional[str] = None):
    """
    Effectue le contrôle des versions F95
    forum_filter: None (tous), "my", ou "partner"
    """
    logger.info(f"🔎 Démarrage contrôle versions F95 (filtre: {forum_filter or 'tous'})")
    
    channel_notif = bot.get_channel(config.MAJ_NOTIFICATION_CHANNEL_ID)
    if not channel_notif:
        logger.error("❌ Salon notifications MAJ introuvable")
        return
    
    # Déterminer quels forums vérifier
    forum_configs = []
    if forum_filter is None or forum_filter == "my":
        if config.FORUM_MY_ID:
            forum_configs.append((config.FORUM_MY_ID, "My"))
    if forum_filter is None or forum_filter == "partner":
        if config.FORUM_PARTNER_ID:
            forum_configs.append((config.FORUM_PARTNER_ID, "Partner"))
    
    if not forum_configs:
        logger.warning("⚠️ Aucun forum configuré pour le check version")
        return
    
    # Nettoyer les anciennes notifications
    _clean_old_notifications()
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    }
    
    all_alerts = []
    
    async with aiohttp.ClientSession(headers=headers) as session:
        for forum_id, forum_type in forum_configs:
            forum = bot.get_channel(forum_id)
            if not forum:
                logger.warning(f"⚠️ Forum {forum_id} introuvable")
                continue
            
            threads = await _collect_all_forum_threads(forum)
            logger.info(f"🔎 Check version F95 [{forum_type}]: {len(threads)} threads (actifs + archivés)")
            
            for thread in threads:
                # Jitter anti-rate limit
                await asyncio.sleep(0.6 + random.random() * 0.6)
                
                # Extraire données du post
                game_link, post_version = await _extract_post_data(thread)
                
                if not game_link or not post_version:
                    logger.info(f"⏭️  Thread ignoré (données manquantes): {thread.name}")
                    continue
                
                # Filtrer LewdCorner
                if "lewdcorner.com" in game_link.lower():
                    logger.info(f"⏭️  Thread ignoré (LewdCorner): {thread.name}")
                    continue
                
                # Vérifier que c'est bien F95Zone
                if "f95zone.to" not in game_link.lower():
                    logger.info(f"⏭️  Thread ignoré (non-F95Zone): {thread.name}")
                    continue
                
                # Fetch titre F95
                logger.info(f"🌐 Fetch F95 pour {thread.name}: {game_link}")
                title_text = await _fetch_f95_title(session, game_link)
                f95_version = _extract_version_from_f95_title(title_text or "")
                
                if f95_version:
                    f95_version = _normalize_version(f95_version)
                
                # Cas 1: Version non détectée sur F95
                if not f95_version:
                    if not _is_already_notified(thread.id, "NO_VERSION"):
                        logger.warning(f"⚠️ Version F95 non détectable pour: {thread.name}")
                        all_alerts.append(VersionAlert(
                            thread.name, thread.jump_url, None, 
                            post_version, forum_type, False
                        ))
                        _mark_as_notified(thread.id, "NO_VERSION")
                    continue
                
                # Cas 2: Versions différentes
                if f95_version.strip() != post_version.strip():
                    if not _is_already_notified(thread.id, f95_version):
                        logger.info(f"🔄 Différence détectée pour {thread.name}: F95={f95_version} vs Post={post_version}")
                        
                        # Tenter la modification automatique
                        update_success = await _update_post_version(thread, f95_version)
                        
                        all_alerts.append(VersionAlert(
                            thread.name, thread.jump_url, f95_version,
                            post_version, forum_type, update_success
                        ))
                        _mark_as_notified(thread.id, f95_version)
                else:
                    # Version identique - log uniquement
                    logger.info(f"✅ Version OK [{forum_type}]: {thread.name} ({post_version})")
    
    # Envoi groupé des alertes
    await _group_and_send_alerts(channel_notif, all_alerts)
    logger.info(f"📊 Contrôle terminé : {len(all_alerts)} alertes envoyées")

# ==================== TÂCHE QUOTIDIENNE ====================
@tasks.loop(time=datetime.time(hour=config.VERSION_CHECK_HOUR, minute=config.VERSION_CHECK_MINUTE, tzinfo=ZoneInfo("Europe/Paris")))
async def daily_version_check():
    """Contrôle quotidien automatique à l'heure configurée (défaut: 6h Europe/Paris)"""
    logger.info(f"🕕 Démarrage contrôle quotidien automatique des versions F95")
    try:
        await run_version_check_once()
    except Exception as e:
        logger.error(f"❌ Erreur contrôle quotidien: {e}")

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
        "**🧰 Commandes disponibles (Bot Publisher - Contrôle Versions)**\n\n"
        "**/check_versions** — Lance le contrôle complet des versions F95 (My + Partner).\n"
        "**/check_mytrads** — Lance le contrôle uniquement sur le forum 'Mes traductions'.\n"
        "**/check_partnertrads** — Lance le contrôle uniquement sur le forum 'Traductions partenaire'.\n"
        "**/force_sync** — Force la synchronisation des commandes slash.\n\n"
        "**ℹ️ Fonctionnement automatique**\n"
        f"Le bot effectue un contrôle automatique tous les jours à {config.VERSION_CHECK_HOUR:02d}:{config.VERSION_CHECK_MINUTE:02d} (Europe/Paris).\n"
        "Système anti-doublon actif (30 jours) pour éviter les notifications répétées."
    )

    await interaction.followup.send(help_text, ephemeral=True)

@bot.tree.command(name="check_versions", description="Contrôle les versions F95 (My + Partner)")
async def check_versions(interaction: discord.Interaction):
    """Lance le contrôle complet immédiatement"""
    if not _user_can_run_checks(interaction):
        await interaction.response.send_message("⛔ Permission insuffisante.", ephemeral=True)
        return

    await interaction.response.send_message("⏳ Contrôle des versions F95 en cours…", ephemeral=True)
    try:
        await run_version_check_once()
        await interaction.followup.send("✅ Contrôle terminé.", ephemeral=True)
    except Exception as e:
        logger.error(f"❌ Erreur commande check_versions: {e}")
        await interaction.followup.send(f"❌ Erreur: {e}", ephemeral=True)

@bot.tree.command(name="check_mytrads", description="Contrôle uniquement les 'Mes traductions'")
async def check_mytrads(interaction: discord.Interaction):
    """Lance le contrôle My uniquement"""
    if not _user_can_run_checks(interaction):
        await interaction.response.send_message("⛔ Permission insuffisante.", ephemeral=True)
        return

    await interaction.response.send_message("⏳ Contrôle 'Mes traductions' en cours…", ephemeral=True)
    try:
        await run_version_check_once(forum_filter="my")
        await interaction.followup.send("✅ Contrôle 'Mes traductions' terminé.", ephemeral=True)
    except Exception as e:
        logger.error(f"❌ Erreur commande check_mytrads: {e}")
        await interaction.followup.send(f"❌ Erreur: {e}", ephemeral=True)

@bot.tree.command(name="check_partnertrads", description="Contrôle uniquement les 'Traductions partenaire'")
async def check_partnertrads(interaction: discord.Interaction):
    """Lance le contrôle Partner uniquement"""
    if not _user_can_run_checks(interaction):
        await interaction.response.send_message("⛔ Permission insuffisante.", ephemeral=True)
        return

    await interaction.response.send_message("⏳ Contrôle 'Traductions partenaire' en cours…", ephemeral=True)
    try:
        await run_version_check_once(forum_filter="partner")
        await interaction.followup.send("✅ Contrôle 'Traductions partenaire' terminé.", ephemeral=True)
    except Exception as e:
        logger.error(f"❌ Erreur commande check_partnertrads: {e}")
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
        print(f"⚠️ Erreur defer: {e}")
        return

    bot_name = bot.user.name if bot.user else "Bot"
    guild = interaction.guild
    
    try:
        # ÉTAPE 1: Nettoyage global
        print(f"🧹 [{bot_name}] Étape 1/4: Suppression commandes globales...")
        bot.tree.clear_commands(guild=None)
        await bot.tree.sync()
        await asyncio.sleep(2)
        
        # ÉTAPE 2: Nettoyage serveur (si dans un serveur)
        if guild:
            print(f"🧹 [{bot_name}] Étape 2/4: Suppression commandes serveur {guild.name}...")
            bot.tree.clear_commands(guild=guild)
            await bot.tree.sync(guild=guild)
            await asyncio.sleep(2)
        else:
            print(f"⏭️  [{bot_name}] Étape 2/4: Ignorée (pas dans un serveur)")
        
        # ÉTAPE 3: Resync global
        print(f"🔄 [{bot_name}] Étape 3/4: Synchronisation globale...")
        await bot.tree.sync()
        await asyncio.sleep(2)
        
        # ÉTAPE 4: Resync serveur (si dans un serveur)
        if guild:
            print(f"🔄 [{bot_name}] Étape 4/4: Synchronisation serveur {guild.name}...")
            bot.tree.copy_global_to(guild=guild)
            await bot.tree.sync(guild=guild)
        else:
            print(f"⏭️  [{bot_name}] Étape 4/4: Ignorée (pas dans un serveur)")
        
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
        print(f"✅ [{bot_name}] Reset complet terminé avec succès!")
        
    except discord.errors.HTTPException as e:
        error_msg = f"❌ Erreur Discord HTTP: {e}"
        print(f"❌ [{bot_name}] {error_msg}")
        await interaction.followup.send(error_msg, ephemeral=True)
    except Exception as e:
        error_msg = f"❌ Erreur inattendue: {type(e).__name__}: {e}"
        print(f"❌ [{bot_name}] {error_msg}")
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
        print(f"⚠️ Erreur defer: {e}")
        return

    bot_name = bot.user.name if bot.user else "Bot"
    guild = interaction.guild
    
    try:
        # Sync global
        print(f"🔄 [{bot_name}] Synchronisation globale...")
        await bot.tree.sync()
        await asyncio.sleep(1)
        
        # Sync serveur si applicable
        if guild:
            print(f"🔄 [{bot_name}] Synchronisation serveur {guild.name}...")
            bot.tree.copy_global_to(guild=guild)
            await bot.tree.sync(guild=guild)
        
        success_msg = f"✅ **Sync terminé pour {bot_name}**\n\n"
        success_msg += "✓ Commandes globales synchronisées\n"
        if guild:
            success_msg += f"✓ Commandes serveur '{guild.name}' synchronisées\n"
        success_msg += "\n**ℹ️ Les commandes peuvent mettre jusqu'à 1h pour apparaître partout.**"
        
        await interaction.followup.send(success_msg, ephemeral=True)
        print(f"✅ [{bot_name}] Sync terminé avec succès!")
        
    except discord.errors.HTTPException as e:
        error_msg = f"❌ Erreur Discord HTTP: {e}"
        print(f"❌ [{bot_name}] {error_msg}")
        await interaction.followup.send(error_msg, ephemeral=True)
    except Exception as e:
        error_msg = f"❌ Erreur inattendue: {type(e).__name__}: {e}"
        print(f"❌ [{bot_name}] {error_msg}")
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
        print(f"⚠️ Erreur defer: {e}")
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
        print(f"❌ [{bot_name}] {error_msg}")
        await interaction.followup.send(error_msg, ephemeral=True)
# ==================== ÉVÉNEMENTS BOT ====================
@bot.event
async def on_ready():
    logger.info(f'🤖 Bot Publisher prêt : {bot.user}')
    
    # Sync commandes slash
    try:
        await bot.tree.sync()
        logger.info("✅ Commandes slash synchronisées (/check_versions, /check_mytrads, /check_partnertrads, /check_help)")
    except Exception as e:
        logger.error(f"⚠️ Sync commandes slash échouée: {e}")
    
    # Lancement tâche quotidienne
    if not daily_version_check.is_running():
        daily_version_check.start()
        logger.info(f"✅ Contrôle quotidien programmé à {config.VERSION_CHECK_HOUR:02d}:{config.VERSION_CHECK_MINUTE:02d} Europe/Paris")

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
    return {"Authorization": f"Bot {config.DISCORD_PUBLISHER_TOKEN}"}

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

def _pick_forum_id(template):
    return config.FORUM_PARTNER_ID if template == "partner" else config.FORUM_MY_ID

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

async def _create_forum_post(session, forum_id, title, content, tags_raw, images, metadata_b64=None):
    """
    Crée un post de forum Discord.
    - L'image est affichée via un embed "image" sur le 1er message (sinon SUPPRESS_EMBEDS la masque).
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

    # Retirer le lien d'image du contenu pour le masquer (il sera dans l'embed)
    final_content = content or " "
    message_embeds = []
    if image_urls_full:
        image_url = image_urls_full[0]
        # Créer l'embed avec l'image
        message_embeds.append({"image": {"url": image_url}})
        logger.info(f"✅ Embed image (message principal): {image_url[:60]}...")
        
        # Retirer le lien du contenu (y compris s'il est sur une ligne séparée)
        # On retire le lien et les retours à la ligne qui l'entourent
        final_content = re.sub(r'\n\s*' + re.escape(image_url) + r'\s*\n?', '\n', final_content)
        final_content = re.sub(r'\n\s*' + re.escape(image_url) + r'\s*$', '', final_content)
        final_content = re.sub(re.escape(image_url), '', final_content)
        # Nettoyer les doubles retours à la ligne
        final_content = re.sub(r'\n\n\n+', '\n\n', final_content)
        final_content = final_content.strip()

    message_payload = {"content": final_content or " "}
    # Si pas d'image, on force embeds=[] pour nettoyer une éventuelle image précédente lors d'updates
    message_payload["embeds"] = message_embeds if message_embeds else []

    payload = {
        "name": title,
        "message": message_payload
    }

    if applied_tag_ids:
        payload["applied_tags"] = applied_tag_ids

    status, data, _ = await _discord_post_json(session, f"/channels/{forum_id}/threads", payload)

    if status >= 300:
        return False, {"status": status, "discord": data}

    thread_id = data.get("id")
    message_id = (data.get("message") or {}).get("id") or data.get("message_id")

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

def _with_cors(request, resp):
    origin = request.headers.get("Origin", "*")
    resp.headers.update({"Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Credentials": "true"})
    return resp

# ==================== HANDLERS HTTP ====================
async def health(request):
    return _with_cors(request, web.json_response({"ok": True, "configured": config.configured, "rate_limit": rate_limiter.get_info()}))

async def options_handler(request):
    return _with_cors(request, web.Response(status=204))

async def configure(request):
    """Handler pour configurer l'API"""
    try:
        data = await request.json()
        config.update_from_frontend(data)
        resp = web.json_response({"ok": True, "message": "Configuration mise à jour", "configured": config.configured})
        return _with_cors(request, resp)
    except Exception as e:
        logger.error(f"Erreur configuration: {e}")
        return _with_cors(request, web.json_response({"ok": False, "error": str(e)}, status=400))

async def forum_post(request):
    """Handler modifié pour accepter les métadonnées"""
    api_key = request.headers.get("X-API-KEY") or request.query.get("api_key")
    if api_key != config.PUBLISHER_API_KEY: 
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    
    title, content, tags, template, images, metadata_b64 = "", "", "", "my", [], None
    reader = await request.multipart()
    
    async for part in reader:
        if part.name == "title":
            title = (await part.text()).strip()
        elif part.name == "content":
            content = (await part.text()).strip()
        elif part.name == "tags":
            tags = (await part.text()).strip()
        elif part.name == "template":
            template = (await part.text()).strip()
        elif part.name == "metadata":
            metadata_b64 = (await part.text()).strip()
        # Plus besoin de traiter les images comme attachments, elles sont dans le contenu (liens masqués)
        # elif part.name and part.name.startswith("image_") and part.filename:
        #     images.append({
        #         "bytes": await part.read(decode=False),
        #         "filename": part.filename,
        #         "content_type": part.headers.get("Content-Type", "image/png")
        #     })

    forum_id = _pick_forum_id(template)
    
    async with aiohttp.ClientSession() as session:
        # Plus besoin d'envoyer les images comme attachments, elles sont dans le contenu
        ok, result = await _create_forum_post(session, forum_id, title, content, tags, [], metadata_b64)
    
    if not ok:
        return _with_cors(request, web.json_response({"ok": False, "details": result}, status=500))
    
    # Ajouter à l'historique
    history_manager.add_post({
        "id": f"post_{int(time.time())}",
        "timestamp": int(time.time() * 1000),
        "title": title,
        "content": content,
        "tags": tags,
        "template": template,
        "thread_id": result["thread_id"],
        "message_id": result["message_id"],
        "discord_url": result["thread_url"],
        "forum_id": forum_id
    })
    
    return _with_cors(request, web.json_response({"ok": True, **result}))

async def forum_post_update(request):
    """Handler modifié pour la mise à jour avec métadonnées"""
    api_key = request.headers.get("X-API-KEY") or request.query.get("api_key")
    if api_key != config.PUBLISHER_API_KEY:
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))

    title, content, tags, template, images, thread_id, message_id, metadata_b64 = "", "", "", "my", [], None, None, None
    reader = await request.multipart()

    async for part in reader:
        if part.name == "title":
            title = (await part.text()).strip()
        elif part.name == "content":
            content = (await part.text()).strip()
        elif part.name == "tags":
            tags = (await part.text()).strip()
        elif part.name == "template":
            template = (await part.text()).strip()
        elif part.name == "threadId":
            thread_id = (await part.text()).strip()
        elif part.name == "messageId":
            message_id = (await part.text()).strip()
        elif part.name == "metadata":
            metadata_b64 = (await part.text()).strip()
        # Plus besoin de traiter les images comme attachments, elles sont dans le contenu (liens masqués)
        # elif part.name and part.name.startswith("image_") and part.filename:
        #     images.append({
        #         "bytes": await part.read(decode=False),
        #         "filename": part.filename,
        #         "content_type": part.headers.get("Content-Type", "image/png")
        #     })

    if not thread_id or not message_id:
        return _with_cors(request, web.json_response({"ok": False, "error": "threadId and messageId required"}, status=400))

    logger.info(f"🔄 Mise à jour post: {title} (thread: {thread_id})")

    async with aiohttp.ClientSession() as session:
        message_path = f"/channels/{thread_id}/messages/{message_id}"

        # Détecter une URL d'image dans le contenu (y compris query string complète)
        import re
        image_exts = r"(?:jpg|jpeg|png|gif|webp|avif|bmp|svg|ico|tiff|tif)"
        image_url_pattern = re.compile(
            rf"https?://[^\s<>\"']+\.{image_exts}(?:\?[^\s<>\"']*)?",
            re.IGNORECASE
        )
        image_urls_full = [m.group(0) for m in image_url_pattern.finditer(content or "")]

        # Retirer le lien d'image du contenu pour le masquer (il sera dans l'embed)
        final_content = content or " "
        message_embeds = []
        if image_urls_full:
            image_url = image_urls_full[0]
            # Créer l'embed avec l'image
            message_embeds.append({"image": {"url": image_url}})
            logger.info(f"✅ Embed image (update message principal): {image_url[:60]}...")
            
            # Retirer le lien du contenu (y compris s'il est sur une ligne séparée)
            # On retire le lien et les retours à la ligne qui l'entourent
            final_content = re.sub(r'\n\s*' + re.escape(image_url) + r'\s*\n?', '\n', final_content)
            final_content = re.sub(r'\n\s*' + re.escape(image_url) + r'\s*$', '', final_content)
            final_content = re.sub(re.escape(image_url), '', final_content)
            # Nettoyer les doubles retours à la ligne
            final_content = re.sub(r'\n\n\n+', '\n\n', final_content)
            final_content = final_content.strip()

        message_payload = {"content": final_content or " ", "embeds": message_embeds if message_embeds else []}
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
        applied_tag_ids = await _resolve_applied_tag_ids(session, _pick_forum_id(template), tags)
        status, data = await _discord_patch_json(session, f"/channels/{thread_id}", {
            "name": title,
            "applied_tags": applied_tag_ids
        })

        if status >= 300:
            return _with_cors(request, web.json_response({"ok": False, "details": data}, status=500))

    history_manager.add_post({
        "id": f"post_{int(time.time())}",
        "timestamp": int(time.time() * 1000),
        "title": title,
        "content": content,
        "tags": tags,
        "thread_id": thread_id,
        "updated": True,
        "message_id": message_id,
        "template": template
    })

    return _with_cors(request, web.json_response({"ok": True, "updated": True, "thread_id": thread_id}))

async def get_history(request):
    api_key = request.headers.get("X-API-KEY") or request.query.get("api_key")
    if api_key != config.PUBLISHER_API_KEY: 
        return _with_cors(request, web.json_response({"ok": False, "error": "Invalid API key"}, status=401))
    posts = history_manager.get_posts()
    return _with_cors(request, web.json_response({"ok": True, "posts": posts, "count": len(posts)}))

# ==================== APPLICATION WEB ====================
app = web.Application()
app.add_routes([
    web.get('/api/publisher/health', health),
    web.post('/api/forum-post', forum_post),
    web.post('/api/forum-post/update', forum_post_update),
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
    await bot.start(config.DISCORD_PUBLISHER_TOKEN)

if __name__ == '__main__':
    from discord.http import Route
    Route.BASE = "https://discord.com/api"
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("👋 Arrêt du bot...")
