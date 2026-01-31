"""
Bot Discord - Serveur 2 : VERSION SIMPLIFIÉE RSS
Vérifie les MAJ F95Zone via RSS quotidiennement à 6h
"""
import discord
from discord.ext import commands, tasks
from discord import app_commands
import os
import asyncio
import datetime
import random
import re
import aiohttp
from zoneinfo import ZoneInfo
from dotenv import load_dotenv
from typing import Optional, Dict, List

load_dotenv()

# ==================== CONFIGURATION ====================
TOKEN = os.getenv('DISCORD_TOKEN_F95')
FORUM_SEMI_AUTO_ID = int(os.getenv('FORUM_SEMI_AUTO_ID')) if os.getenv('FORUM_SEMI_AUTO_ID') else None
FORUM_AUTO_ID = int(os.getenv('FORUM_AUTO_ID')) if os.getenv('FORUM_AUTO_ID') else None
NOTIFICATION_CHANNEL_F95_ID = int(os.getenv('NOTIFICATION_CHANNEL_F95_ID')) if os.getenv('NOTIFICATION_CHANNEL_F95_ID') else None
WARNING_MAJ_CHANNEL_ID = int(os.getenv('WARNING_MAJ_CHANNEL_ID')) if os.getenv('WARNING_MAJ_CHANNEL_ID') else None
ALLOWED_USER_ID = int(os.getenv('ALLOWED_USER_ID')) if os.getenv('ALLOWED_USER_ID') else None
DAYS_BEFORE_PUBLICATION = int(os.getenv('DAYS_BEFORE_PUBLICATION', '14'))
CHECK_TIME_HOUR = int(os.getenv('VERSION_CHECK_HOUR', '6'))
CHECK_TIME_MINUTE = int(os.getenv('VERSION_CHECK_MINUTE', '0'))
MANUAL_CHECK_COOLDOWN_SECONDS = int(os.getenv('MANUAL_CHECK_COOLDOWN_SECONDS', '90'))
RSS_URL = "https://f95zone.to/sam/latest_alpha/latest_data.php?cmd=rss&cat=games&rows=90&ignored=hide"

intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents)

# ==================== ANTI-SPAM ====================
CHECK_LOCK = asyncio.Lock()
_LAST_MANUAL_CHECK_AT: Optional[datetime.datetime] = None
MANUAL_CHECK_COOLDOWN_SECONDS = 90

# Stockage anti-doublon (mémoire simple)
_notified_versions: Dict[int, Dict] = {}

def _manual_check_allowed() -> bool:
    global _LAST_MANUAL_CHECK_AT
    now = datetime.datetime.now()
    if _LAST_MANUAL_CHECK_AT is None:
        _LAST_MANUAL_CHECK_AT = now
        return True
    delta = (now - _LAST_MANUAL_CHECK_AT).total_seconds()
    if delta < MANUAL_CHECK_COOLDOWN_SECONDS:
        return False
    _LAST_MANUAL_CHECK_AT = now
    return True

def _clean_old_notifications():
    """Nettoie les entrées de plus de 30 jours"""
    cutoff = datetime.datetime.now() - datetime.timedelta(days=30)
    to_remove = [
        tid for tid, data in _notified_versions.items()
        if data.get("timestamp", datetime.datetime.min) < cutoff
    ]
    for tid in to_remove:
        del _notified_versions[tid]

def _is_already_notified(thread_id: int, f95_version: str) -> bool:
    if thread_id not in _notified_versions:
        return False
    return _notified_versions[thread_id].get("f95_version") == f95_version

def _mark_as_notified(thread_id: int, f95_version: str):
    _notified_versions[thread_id] = {
        "f95_version": f95_version,
        "timestamp": datetime.datetime.now()
    }

# ==================== REGEX PATTERNS ====================
_RE_GAME_LINK = re.compile(
    r"^\s*Lien\s+du\s+jeu\s*:\s*\[(?P<label>[^\]]+)\]\((?P<url>https?://[^)]+)\)\s*$",
    re.IGNORECASE | re.MULTILINE
)
_RE_GAME_VERSION = re.compile(
    r"^\s*Version\s+du\s+jeu\s*:\s*(?P<ver>.+?)\s*$",
    re.IGNORECASE | re.MULTILINE
)
_RE_TRANSLATION_VERSION = re.compile(
    r"^\s*Version\s+de\s+la\s+traduction\s*:\s*(?P<ver>.+?)\s*$",
    re.IGNORECASE | re.MULTILINE
)

def _extract_link_and_versions(text: str):
    """Extrait (url_f95, version_jeu, version_traduction)"""
    if not text:
        return None, None, None
    
    m_link = _RE_GAME_LINK.search(text)
    m_game_ver = _RE_GAME_VERSION.search(text)
    m_trad_ver = _RE_TRANSLATION_VERSION.search(text)
    
    url = m_link.group("url").strip() if m_link else None
    game_ver = m_game_ver.group("ver").strip() if m_game_ver else None
    trad_ver = m_trad_ver.group("ver").strip() if m_trad_ver else None
    
    return url, game_ver, trad_ver

# ==================== NORMALISATION URLs ====================

def extract_f95_thread_id(url: str) -> Optional[str]:
    """
    Extrait l'ID numérique d'un thread F95Zone
    
    Examples:
        https://f95zone.to/threads/game-name.285451/ -> "285451"
        https://f95zone.to/threads/285451 -> "285451"
        https://f95zone.to/threads/game-name.285451/page-5#post-123 -> "285451"
    
    Returns:
        L'ID numérique comme string, ou None si non trouvé
    """
    if not url:
        return None
    
    # Pattern pour capturer l'ID : soit après "threads/" soit après le dernier "."
    # Format 1: /threads/285451
    # Format 2: /threads/game-name.285451/
    pattern = r'/threads/(?:[^/]+\.)?(\d+)'
    
    match = re.search(pattern, url)
    if match:
        return match.group(1)
    
    return None


def normalize_f95_url(url: str) -> str:
    """
    Normalise une URL F95Zone en gardant juste l'ID
    
    Returns:
        URL normalisée : "https://f95zone.to/threads/285451"
    """
    thread_id = extract_f95_thread_id(url)
    if thread_id:
        return f"https://f95zone.to/threads/{thread_id}"
    return url.lower().rstrip('/').split('#')[0]


# ==================== PARSING RSS ====================

import xml.etree.ElementTree as ET

async def fetch_f95_versions_by_ids(session: aiohttp.ClientSession, thread_ids: list) -> Dict[str, str]:
    """
    🆕 NOUVELLE MÉTHODE: Récupère les versions depuis l'API F95 checker.php
    Plus fiable et précise que le flux RSS !
    
    Args:
        session: Session aiohttp
        thread_ids: Liste des IDs de threads F95 (ex: ["100", "285451"])
    
    Returns:
        Dict {thread_id: version}
        Example: {"100": "v0.68", "285451": "Ch.7"}
    """
    if not thread_ids:
        return {}
    
    # L'API accepte plusieurs IDs séparés par des virgules
    # Ex: https://f95zone.to/sam/checker.php?threads=100,285451,300
    ids_str = ",".join(str(tid) for tid in thread_ids)
    checker_url = f"https://f95zone.to/sam/checker.php?threads={ids_str}"
    
    try:
        async with session.get(checker_url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            if resp.status != 200:
                print(f"⚠️ F95 Checker API HTTP {resp.status}")
                return {}
            
            data = await resp.json()
            
            # Format de réponse: {"status":"ok","msg":{"100":"v0.68","285451":"Ch.7"}}
            if data.get("status") == "ok" and "msg" in data:
                print(f"✅ F95 Checker API: {len(data['msg'])} versions récupérées")
                return data["msg"]
            else:
                print(f"⚠️ F95 Checker API réponse invalide: {data}")
                return {}
                
    except Exception as e:
        print(f"❌ Erreur fetch F95 Checker API: {e}")
        return {}


async def fetch_f95_rss_updates(session: aiohttp.ClientSession) -> Dict[str, str]:
    """
    Récupère le flux RSS F95Zone
    
    Returns:
        Dict {url_normalisée: version}
        Example: {"https://f95zone.to/threads/285451": "Ch.7"}
    """
    try:
        async with session.get(RSS_URL, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            if resp.status != 200:
                print(f"⚠️ RSS F95 HTTP {resp.status}")
                return {}
            xml_content = await resp.text()
    except Exception as e:
        print(f"❌ Erreur fetch RSS: {e}")
        raise  # On propage pour signaler l'erreur HTTP
    
    updates_map = {}
    
    try:
        root = ET.fromstring(xml_content)
        
        for item in root.findall('.//item'):
            link_elem = item.find('link')
            title_elem = item.find('title')
            
            if link_elem is None or title_elem is None:
                continue
            
            url = link_elem.text.strip() if link_elem.text else ""
            title = title_elem.text.strip() if title_elem.text else ""
            
            if not url or not title:
                continue
            
            # Normaliser l'URL (juste l'ID)
            clean_url = normalize_f95_url(url)
            
            # Extraire version du titre: "Game Name [Ch.7] [Author]"
            version = extract_version_from_rss_title(title)
            
            if clean_url and version:
                updates_map[clean_url] = version
        
        print(f"📡 RSS: {len(updates_map)} jeux avec MAJ récente")
        
    except ET.ParseError as e:
        print(f"❌ XML parsing error: {e}")
        raise
    except Exception as e:
        print(f"❌ Erreur traitement RSS: {e}")
        raise
    
    return updates_map


def extract_version_from_rss_title(title: str) -> Optional[str]:
    """
    Extrait la version / info depuis le titre RSS F95zone.
    Format: "[TAG] Titre du jeu [Version ou Chapitre ou Libellé]"
    Retourne le dernier segment entre crochets (après le titre), quel qu'en soit le format :
    - versions : [v26.1.0a], [v1.0], [v.2 Release], [0.22]
    - chapitres : [Ch. 1], [Ch.7]
    - libellés : [Final], [Demo], [Alpha 0.15.2], [6000.0.24f1], etc.
    """
    bracket_pattern = re.compile(r'\[([^\]]+)\]')
    matches = bracket_pattern.findall(title)
    if not matches:
        return None
    return matches[-1].strip()


# ==================== COLLECTE THREADS ====================

async def _collect_all_forum_threads(forum: discord.ForumChannel) -> List[discord.Thread]:
    """Récupère TOUS les threads (actifs + archivés)"""
    all_threads: Dict[int, discord.Thread] = {}
    
    # Threads actifs
    for t in list(getattr(forum, "threads", []) or []):
        all_threads[t.id] = t
    
    # Threads archivés
    if hasattr(forum, "archived_threads"):
        before = None
        while True:
            batch = []
            try:
                async for t in forum.archived_threads(limit=100, before=before):
                    batch.append(t)
            except TypeError:
                async for t in forum.archived_threads(limit=100):
                    batch.append(t)
            
            if not batch:
                break
            
            for t in batch:
                all_threads[t.id] = t
            
            before = batch[-1].archive_timestamp or batch[-1].created_at
            await asyncio.sleep(0.5)
            
            if before is None:
                break
    
    return list(all_threads.values())


# ==================== CONTRÔLE VERSION RSS ====================

class VersionAlert:
    def __init__(self, thread_name: str, thread_url: str, f95_version: str,
                 post_game_version: str, post_trad_version: str, forum_type: str):
        self.thread_name = thread_name
        self.thread_url = thread_url
        self.f95_version = f95_version
        self.post_game_version = post_game_version
        self.post_trad_version = post_trad_version
        self.forum_type = forum_type


async def send_grouped_alerts(channel: discord.TextChannel, alerts: List[VersionAlert]):
    """Envoie les alertes groupées par type de forum"""
    if not alerts:
        return
    
    # Grouper par type
    auto_alerts = [a for a in alerts if a.forum_type == "Auto"]
    semiauto_alerts = [a for a in alerts if a.forum_type == "Semi-Auto"]
    
    # Envoyer Auto
    if auto_alerts:
        await _send_alert_batch(channel, auto_alerts, "Traductions Automatiques")
    
    # Envoyer Semi-Auto
    if semiauto_alerts:
        await _send_alert_batch(channel, semiauto_alerts, "Traductions Semi-Automatiques")


async def _send_alert_batch(channel: discord.TextChannel, alerts: List[VersionAlert], forum_name: str):
    """Envoie un batch d'alertes (max 5 par message)"""
    for i in range(0, len(alerts), 5):
        batch = alerts[i:i+5]
        
        msg_parts = [
            f"🚨 **Mises à jour détectées : {forum_name}** ({len(batch)} jeu{'x' if len(batch) > 1 else ''})",
            ""
        ]
        
        for alert in batch:
            msg_parts.append(
                f"**{alert.thread_name}**\n"
                f"├ Version F95 : `{alert.f95_version}`\n"
                f"├ Version du poste : `{alert.post_game_version}`\n"
                f"├ Version traduction : `{alert.post_trad_version}`\n"
                f"└ Lien : {alert.thread_url}\n"
            )
        
        await channel.send("\n".join(msg_parts))
        await asyncio.sleep(1.0)


async def run_api_version_check():
    """
    🆕 CONTRÔLE VIA API F95 (checker.php) - PLUS FIABLE QUE LE RSS
    
    1. Récupère les threads Discord
    2. Extrait les IDs F95 depuis les Game_link
    3. Appelle l'API checker.php avec tous les IDs groupés
    4. Compare avec les versions des posts Discord
    5. Envoie les alertes groupées
    """
    channel_warn = bot.get_channel(WARNING_MAJ_CHANNEL_ID)
    if not channel_warn:
        print("❌ Canal avertissements introuvable")
        return
    
    _clean_old_notifications()
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json,*/*",
    }
    
    all_alerts = []
    http_error = None
    
    try:
        async with aiohttp.ClientSession(headers=headers) as session:
            # 📊 PHASE 1: Collecter tous les threads Discord et leurs IDs F95
            thread_mapping = {}  # {thread_id_f95: (thread_discord, post_version, trad_version, forum_type)}
            
            forum_configs = []
            if FORUM_AUTO_ID:
                forum_configs.append((FORUM_AUTO_ID, "Auto"))
            if FORUM_SEMI_AUTO_ID:
                forum_configs.append((FORUM_SEMI_AUTO_ID, "Semi-Auto"))
            
            for forum_id, forum_type in forum_configs:
                forum = bot.get_channel(forum_id)
                if not forum:
                    continue
                
                threads = await _collect_all_forum_threads(forum)
                print(f"🔎 [{forum_type}] {len(threads)} threads à vérifier")
                
                for thread in threads:
                    await asyncio.sleep(0.2)  # Anti-spam Discord
                    
                    # Récupérer le premier message
                    msg = thread.starter_message
                    if not msg:
                        try:
                            msg = await thread.fetch_message(thread.id)
                        except Exception:
                            continue
                    
                    if not msg:
                        continue
                    
                    # Extraire les infos
                    content = msg.content or ""
                    f95_url, post_game_version, post_trad_version = _extract_link_and_versions(content)
                    
                    if not f95_url or not post_game_version:
                        continue
                    
                    # Extraire l'ID F95 depuis l'URL
                    f95_id = extract_f95_thread_id(f95_url)
                    if not f95_id:
                        print(f"⚠️ Impossible d'extraire l'ID F95 depuis: {f95_url}")
                        continue
                    
                    thread_mapping[f95_id] = (thread, post_game_version, post_trad_version or "Non renseignée", forum_type)
            
            if not thread_mapping:
                print("✅ Aucun thread avec lien F95 trouvé")
                return
            
            # 🚀 PHASE 2: Récupérer les versions F95 via l'API (1 seule requête groupée !)
            f95_ids = list(thread_mapping.keys())
            print(f"🌐 Récupération API F95 pour {len(f95_ids)} threads...")
            
            try:
                f95_versions = await fetch_f95_versions_by_ids(session, f95_ids)
            except Exception as e:
                http_error = str(e)
                f95_versions = {}
            
            if http_error:
                await channel_warn.send(
                    f"⚠️ **Contrôle F95 impossible**\n"
                    f"Erreur lors de la récupération de l'API F95 : `{http_error}`\n"
                    f"Nouvelle tentative dans 24h."
                )
                return
            
            if not f95_versions:
                print("✅ Aucune version récupérée depuis l'API F95")
                return
            
            # 🎯 PHASE 3: Comparaison des versions
            for f95_id, api_version in f95_versions.items():
                if f95_id not in thread_mapping:
                    continue
                
                thread, post_version, trad_version, forum_type = thread_mapping[f95_id]
                
                # Normaliser les versions pour comparaison
                api_version_clean = api_version.strip()
                post_version_clean = post_version.strip()
                
                # Vérifier si différent
                if api_version_clean != post_version_clean:
                    # Anti-doublon
                    if not _is_already_notified(thread.id, api_version_clean):
                        all_alerts.append(VersionAlert(
                            thread.name,
                            thread.jump_url,
                            api_version_clean,
                            post_version_clean,
                            trad_version,
                            forum_type
                        ))
                        _mark_as_notified(thread.id, api_version_clean)
                        print(f"🔔 MAJ: {thread.name} ({post_version_clean} -> {api_version_clean})")
        
        # 📢 ENVOI DES ALERTES (ou silence)
        if all_alerts:
            await send_grouped_alerts(channel_warn, all_alerts)
            print(f"✅ {len(all_alerts)} alertes envoyées")
        else:
            print("✅ Aucune MAJ détectée, silence total")
    
    except Exception as e:
        print(f"❌ Erreur globale: {e}")
        import traceback
        traceback.print_exc()
        await channel_warn.send(
            f"⚠️ **Erreur lors du contrôle F95**\n"
            f"Erreur technique : `{type(e).__name__}: {e}`\n"
            f"Nouvelle tentative dans 24h."
        )


async def run_rss_version_check():
    """
    ⚠️ OBSOLÈTE: Ancienne méthode RSS - Redirige vers la nouvelle API
    Gardé pour compatibilité avec les anciens appels
    """
    await run_api_version_check()


# ==================== TÂCHE QUOTIDIENNE ====================

@tasks.loop(time=datetime.time(hour=CHECK_TIME_HOUR, minute=CHECK_TIME_MINUTE, tzinfo=ZoneInfo("Europe/Paris")))
async def daily_version_check():
    """Contrôle quotidien à 6h Europe/Paris"""
    print(f"🕐 Contrôle quotidien RSS à {CHECK_TIME_HOUR:02d}:{CHECK_TIME_MINUTE:02d}")
    
    if CHECK_LOCK.locked():
        print("⏸️ Contrôle ignoré: déjà en cours")
        return
    
    async with CHECK_LOCK:
        try:
            await run_rss_version_check()
        except Exception as e:
            print(f"❌ Erreur contrôle quotidien: {e}")


# ==================== COMMANDE MANUELLE ====================

def _user_can_run_checks(interaction: discord.Interaction) -> bool:
    if getattr(interaction.user, "id", None) == ALLOWED_USER_ID:
        return True
    perms = getattr(interaction.user, "guild_permissions", None)
    return bool(perms and (perms.administrator or perms.manage_guild))


@bot.tree.command(name="check_version", description="Vérifie les MAJ F95 via RSS (manuel)")
async def check_version(interaction: discord.Interaction):
    if not _user_can_run_checks(interaction):
        try:
            await interaction.response.send_message("⛔ Permission insuffisante.", ephemeral=True)
        except Exception:
            pass
        return
    
    if not _manual_check_allowed():
        try:
            await interaction.response.send_message(
                f"⏳ Attends {MANUAL_CHECK_COOLDOWN_SECONDS}s entre deux contrôles.",
                ephemeral=True
            )
        except Exception:
            pass
        return
    
    try:
        await interaction.response.defer(ephemeral=True)
    except Exception:
        pass
    
    if CHECK_LOCK.locked():
        await interaction.followup.send("⏳ Contrôle déjà en cours.", ephemeral=True)
        return
    
    async with CHECK_LOCK:
        await interaction.followup.send("⚡ Contrôle RSS en cours...", ephemeral=True)
        try:
            await run_rss_version_check()
            await interaction.followup.send("✅ Contrôle terminé.", ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"❌ Erreur: {e}", ephemeral=True)


# ==================== NOTIFICATION F95FR ====================

def a_tag_maj(thread) -> bool:
    for tag in thread.applied_tags:
        if "mise à jour" in tag.name.lower() or "maj" in tag.name.lower():
            return True
    return False


async def envoyer_notification_f95(thread, is_update: bool = False):
    channel_notif = bot.get_channel(NOTIFICATION_CHANNEL_F95_ID)
    if not channel_notif:
        return
    
    try:
        await asyncio.sleep(random.random() * 2)
        
        message = thread.starter_message
        if not message:
            await asyncio.sleep(1)
            message = await thread.fetch_message(thread.id)
        
        auteur = "Inconnu"
        if message and getattr(message, "author", None):
            auteur = message.author.display_name
        
        date_ref = message.edited_at if (message and message.edited_at) else thread.created_at
        date_publication = date_ref + datetime.timedelta(days=DAYS_BEFORE_PUBLICATION)
        timestamp_discord = int(date_publication.timestamp())
        
        action_txt = "a été mis à jour" if is_update else "a été créé"
        
        msg_content = (
            f"📢 **Rappel Publication F95fr**\n"
            f"Le thread **{thread.name}** {action_txt}.\n"
            f"**Traducteur :** {auteur}\n"
            f"📅 À publier le : <t:{timestamp_discord}:D> (<t:{timestamp_discord}:R>)\n"
            f"🔗 Lien : {thread.jump_url}"
        )
        
        await channel_notif.send(msg_content)
        print(f"✅ Notification F95fr: {thread.name}")
        
    except Exception as e:
        print(f"❌ Erreur notification: {e}")


# ==================== ÉVÉNEMENTS ====================

@bot.event
async def on_ready():
    print(f'🤖 Bot prêt: {bot.user}')
    
    # Sync commandes (une seule fois au démarrage)
    if not getattr(bot, "_synced", False):
        bot._synced = True
        await asyncio.sleep(2)
        try:
            await bot.tree.sync()
            print("✅ Commande /check_version synchronisée")
        except Exception as e:
            print(f"⚠️ Sync échoué: {e}")
    
    # Lancement tâche quotidienne
    if not daily_version_check.is_running():
        daily_version_check.start()
        print(f"✅ Contrôle quotidien: {CHECK_TIME_HOUR:02d}:{CHECK_TIME_MINUTE:02d} Paris")


@bot.event
async def on_thread_create(thread):
    if thread.parent_id in [FORUM_SEMI_AUTO_ID, FORUM_AUTO_ID]:
        await asyncio.sleep(5)
        thread_actuel = bot.get_channel(thread.id)
        if thread_actuel:
            await envoyer_notification_f95(thread_actuel, is_update=a_tag_maj(thread_actuel))


@bot.event
async def on_thread_update(before, after):
    if after.parent_id in [FORUM_SEMI_AUTO_ID, FORUM_AUTO_ID]:
        if a_tag_maj(after) and not a_tag_maj(before):
            await envoyer_notification_f95(after, is_update=True)


@bot.event
async def on_message_edit(before, after):
    if not isinstance(after.channel, discord.Thread):
        return
    if after.id == after.channel.id:
        if before.content != after.content:
            if after.channel.parent_id in [FORUM_SEMI_AUTO_ID, FORUM_AUTO_ID]:
                if a_tag_maj(after.channel):
                    await envoyer_notification_f95(after.channel, is_update=True)


# ==================== LANCEMENT ====================

if __name__ == "__main__":
    bot.run(TOKEN)
