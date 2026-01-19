"""
Bot Discord - Serveur 2 : Rappels F95fr + Contrôle versions
Gère les notifications de rappel pour les publications F95fr
+ Contrôle automatique des versions F95 avec alertes groupées
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
from collections import defaultdict
from typing import Optional, Tuple, Dict, List

load_dotenv()

# ==================== CONFIGURATION ====================
TOKEN = os.getenv('DISCORD_TOKEN_F95')
FORUM_SEMI_AUTO_ID = int(os.getenv('FORUM_SEMI_AUTO_ID')) if os.getenv('FORUM_SEMI_AUTO_ID') else None
FORUM_AUTO_ID = int(os.getenv('FORUM_AUTO_ID')) if os.getenv('FORUM_AUTO_ID') else None
NOTIFICATION_CHANNEL_F95_ID = int(os.getenv('NOTIFICATION_CHANNEL_F95_ID')) if os.getenv('NOTIFICATION_CHANNEL_F95_ID') else None
WARNING_MAJ_CHANNEL_ID = int(os.getenv('WARNING_MAJ_CHANNEL_ID', '1436297589854310441'))
DAYS_BEFORE_PUBLICATION = int(os.getenv('DAYS_BEFORE_PUBLICATION', '14'))
CHECK_TIME_HOUR = int(os.getenv('VERSION_CHECK_HOUR', '6'))
CHECK_TIME_MINUTE = int(os.getenv('VERSION_CHECK_MINUTE', '0'))

intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents)

# ==================== REGEX PATTERNS ====================
_RE_GAME_LINK = re.compile(
    r"^\s*Lien\s+du\s+jeu\s*:\s*\[(?P<label>[^\]]+)\]\((?P<url>https?://[^)]+)\)\s*$",
    re.IGNORECASE | re.MULTILINE
)
_RE_GAME_VERSION = re.compile(
    r"^\s*Version\s+du\s+jeu\s*:\s*(?P<ver>.+?)\s*$",
    re.IGNORECASE | re.MULTILINE
)
_RE_BRACKETS = re.compile(r"\[(?P<val>[^\]]+)\]")

# ==================== STOCKAGE ANTI-DOUBLON ====================
# Structure: {thread_id: {"f95_version": "Ch.7", "timestamp": datetime}}
_notified_versions: Dict[int, Dict] = {}

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
    """Vérifie si cette version a déjà été notifiée pour ce thread"""
    if thread_id not in _notified_versions:
        return False
    return _notified_versions[thread_id].get("f95_version") == f95_version

def _mark_as_notified(thread_id: int, f95_version: str):
    """Marque cette version comme notifiée"""
    _notified_versions[thread_id] = {
        "f95_version": f95_version,
        "timestamp": datetime.datetime.now()
    }

# ==================== DÉTECTION TAG MAJ ====================
def a_tag_maj(thread) -> bool:
    """Vérifie si le tag 'Mise à jour' ou 'MAJ' est présent"""
    for tag in thread.applied_tags:
        if "mise à jour" in tag.name.lower() or "maj" in tag.name.lower():
            return True
    return False

# ==================== EXTRACTION VERSION ====================
def _extract_link_and_declared_version(text: str) -> Tuple[Optional[str], Optional[str]]:
    """Extrait (url_f95, version_thread) depuis le contenu du message."""
    if not text:
        return None, None
    
    m_link = _RE_GAME_LINK.search(text)
    m_ver = _RE_GAME_VERSION.search(text)
    
    url = m_link.group("url").strip() if m_link else None
    ver = m_ver.group("ver").strip() if m_ver else None
    
    return url, ver

def _extract_version_from_f95_title(title_text: str) -> Optional[str]:
    """Récupère la version depuis le titre F95, ex: 'Game [Ch.7] [Author]' -> 'Ch.7'"""
    if not title_text:
        return None
    
    parts = [m.group("val").strip() for m in _RE_BRACKETS.finditer(title_text)]
    return parts[0] if parts else None

async def _fetch_f95_title(session: aiohttp.ClientSession, url: str) -> Optional[str]:
    """Télécharge la page F95 et extrait le titre H1"""
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=25)) as resp:
            if resp.status >= 300:
                print(f"⚠️ F95 HTTP {resp.status} sur {url}")
                return None
            html = await resp.text(errors="ignore")
    except Exception as e:
        print(f"⚠️ Erreur fetch F95 {url}: {e}")
        return None

    # Parsing léger: cherche <h1 class="p-title-value">...</h1>
    m = re.search(r"<h1[^>]*class=\"p-title-value\"[^>]*>(.*?)</h1>", html, re.IGNORECASE | re.DOTALL)
    if not m:
        return None
    
    raw = m.group(1)
    txt = re.sub(r"<[^>]+>", "", raw)  # Supprime les tags HTML
    txt = re.sub(r"\s+", " ", txt).strip()
    
    return txt or None

# ==================== CONTRÔLE VERSIONS ====================
class VersionAlert:
    """Représente une alerte de version"""
    def __init__(self, thread_name: str, thread_url: str, f95_version: Optional[str], 
                 declared_version: Optional[str], forum_type: str):
        self.thread_name = thread_name
        self.thread_url = thread_url
        self.f95_version = f95_version
        self.declared_version = declared_version
        self.forum_type = forum_type  # "Auto" ou "Semi-Auto"

async def _group_and_send_alerts(channel: discord.TextChannel, alerts: List[VersionAlert]):
    """Regroupe et envoie les alertes par catégorie (max 10 par message)"""
    if not alerts:
        return
    
    # Groupement par type (Auto/Semi-Auto) et par catégorie (différente/non détectée)
    groups = {
        "Auto_diff": [],
        "Auto_missing": [],
        "SemiAuto_diff": [],
        "SemiAuto_missing": []
    }
    
    for alert in alerts:
        prefix = "Auto" if alert.forum_type == "Auto" else "SemiAuto"
        suffix = "diff" if alert.f95_version else "missing"
        key = f"{prefix}_{suffix}"
        groups[key].append(alert)
    
    # Envoi par catégorie
    for key, alert_list in groups.items():
        if not alert_list:
            continue
        
        # Déterminer le titre du message
        forum_type = "Traduction Auto" if "Auto" in key else "Traduction Semi-Auto"
        if "diff" in key:
            title = f"🚨 **{forum_type} : Mises à jour détectées sur F95** ({len(alert_list)} jeux)"
        else:
            title = f"⚠️ **{forum_type} : Version indisponible sur F95** ({len(alert_list)} jeux)"
        
        # Découpage par paquets de 10
        for i in range(0, len(alert_list), 10):
            batch = alert_list[i:i+10]
            
            msg_parts = [title, ""]
            for alert in batch:
                if alert.f95_version:
                    msg_parts.append(
                        f"**{alert.thread_name}**\n"
                        f"├ Version F95 : `{alert.f95_version}`\n"
                        f"├ Version annoncée : `{alert.declared_version or 'Non renseignée'}`\n"
                        f"└ Lien : {alert.thread_url}\n"
                    )
                else:
                    msg_parts.append(
                        f"**{alert.thread_name}**\n"
                        f"├ Version annoncée : `{alert.declared_version or 'Non renseignée'}`\n"
                        f"└ Lien : {alert.thread_url}\n"
                    )
            
            await channel.send("\n".join(msg_parts))
            await asyncio.sleep(1.5)  # Anti-rate limit


async def _collect_all_forum_threads(forum: discord.ForumChannel) -> List[discord.Thread]:
    """
    Retourne TOUS les threads d'un forum :
    - Actifs (forum.threads)
    - Archivés publics (forum.archived_threads)
    
    Note: les 'private archived threads' ne concernent généralement pas les forums.
    """
    all_threads: Dict[int, discord.Thread] = {}

    # 1) Threads actifs (cache)
    for t in list(getattr(forum, "threads", []) or []):
        all_threads[t.id] = t

    # 2) Threads archivés publics (pagination)
    # discord.py expose généralement forum.archived_threads(...)
    if hasattr(forum, "archived_threads"):
        before = None
        while True:
            batch = []
            try:
                async for t in forum.archived_threads(limit=100, before=before):  # public archived
                    batch.append(t)
            except TypeError:
                # Compat si la signature diffère (certaines versions)
                async for t in forum.archived_threads(limit=100):
                    batch.append(t)
                    # pas de pagination possible -> 1 passe

            if not batch:
                break

            for t in batch:
                all_threads[t.id] = t

            # Pagination : on continue "avant" le plus vieux de la page
            before = batch[-1].archive_timestamp or batch[-1].created_at
            # Sécurité anti-rate limit
            await asyncio.sleep(0.8)

            # Si on ne peut pas paginer correctement, on sort
            if before is None:
                break

    return list(all_threads.values())


async def run_version_check_once(forum_filter: Optional[str] = None):
    """
    Effectue le contrôle des versions F95
    forum_filter: None (tous), "auto", ou "semiauto"
    """
    channel_warn = bot.get_channel(WARNING_MAJ_CHANNEL_ID)
    if not channel_warn:
        print("❌ Salon avertissements MAJ/version introuvable")
        return
    
    # Déterminer quels forums vérifier
    forum_configs = []
    if forum_filter is None or forum_filter == "auto":
        if FORUM_AUTO_ID:
            forum_configs.append((FORUM_AUTO_ID, "Auto"))
    if forum_filter is None or forum_filter == "semiauto":
        if FORUM_SEMI_AUTO_ID:
            forum_configs.append((FORUM_SEMI_AUTO_ID, "Semi-Auto"))
    
    if not forum_configs:
        print("⚠️ Aucun forum configuré pour le check version")
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
                print(f"⚠️ Forum {forum_id} introuvable")
                continue
            
            # threads = list(getattr(forum, "threads", []) or [])
            # print(f"🔎 Check version F95 [{forum_type}]: {len(threads)} threads actifs")
            threads = await _collect_all_forum_threads(forum)
            print(f"🔎 Check version F95 [{forum_type}]: {len(threads)} threads (actifs + archivés)")

            for thread in threads:
                # Jitter anti-rate limit
                await asyncio.sleep(0.6 + random.random() * 0.6)
                
                # Récupérer starter message
                msg = thread.starter_message
                if not msg:
                    try:
                        await asyncio.sleep(0.8)
                        msg = thread.starter_message or await thread.fetch_message(thread.id)
                    except Exception:
                        msg = None
                
                content = (msg.content if msg else "") or ""
                f95_url, declared_version = _extract_link_and_declared_version(content)
                
                if not f95_url or not declared_version:
                    continue
                
                # Fetch titre F95
                title_text = await _fetch_f95_title(session, f95_url)
                f95_version = _extract_version_from_f95_title(title_text or "")
                
                # Cas 1: Version non détectée sur F95
                if not f95_version:
                    if not _is_already_notified(thread.id, "NO_VERSION"):
                        all_alerts.append(VersionAlert(
                            thread.name, thread.jump_url, None, 
                            declared_version, forum_type
                        ))
                        _mark_as_notified(thread.id, "NO_VERSION")
                    continue
                
                # Cas 2: Versions différentes
                if f95_version.strip() != declared_version.strip():
                    if not _is_already_notified(thread.id, f95_version):
                        all_alerts.append(VersionAlert(
                            thread.name, thread.jump_url, f95_version,
                            declared_version, forum_type
                        ))
                        _mark_as_notified(thread.id, f95_version)
                else:
                    # Version identique - log uniquement
                    print(f"✅ Version OK [{forum_type}]: {thread.name} ({declared_version})")
    
    # Envoi groupé des alertes
    await _group_and_send_alerts(channel_warn, all_alerts)
    print(f"📊 Contrôle terminé : {len(all_alerts)} alertes envoyées")

# ==================== TÂCHE QUOTIDIENNE ====================
@tasks.loop(time=datetime.time(hour=CHECK_TIME_HOUR, minute=CHECK_TIME_MINUTE, tzinfo=ZoneInfo("Europe/Paris")))
async def daily_version_check():
    """Contrôle quotidien à 06:00 Europe/Paris"""
    print(f"🕕 Démarrage contrôle quotidien des versions F95")
    try:
        await run_version_check_once()
    except Exception as e:
        print(f"❌ Erreur contrôle quotidien: {e}")

# ==================== ENVOI NOTIFICATION F95 ====================
async def envoyer_notification_f95(thread, is_update: bool = False):
    """Envoie un rappel pour la publication F95fr (FONCTION CONSERVÉE)"""
    channel_notif = bot.get_channel(NOTIFICATION_CHANNEL_F95_ID)
    if not channel_notif:
        print("❌ Canal de notification F95 non trouvé")
        return
    
    try:
        # Jitter pour éviter collision avec autre bot
        await asyncio.sleep(random.random() * 3)
        
        # Récupération du starter message
        message = thread.starter_message
        if not message:
            await asyncio.sleep(1.5)
            message = thread.starter_message or await thread.fetch_message(thread.id)
        
        # Auteur du thread
        auteur = "Inconnu"
        if message and getattr(message, "author", None):
            auteur = message.author.display_name
        
        # Calcul date de publication
        date_creation = thread.created_at
        date_publication = date_creation + datetime.timedelta(days=DAYS_BEFORE_PUBLICATION)
        timestamp_discord = int(date_publication.timestamp())
        
        action_txt = "a été mis à jour" if is_update else "a été créé"
        
        msg_content = (
            f"🔔 **Rappel Publication F95fr**\n"
            f"Le thread **{thread.name}** {action_txt}.\n"
            f"**Traducteur :** {auteur}\n"
            f"📅 À publier le : <t:{timestamp_discord}:D> (<t:{timestamp_discord}:R>)\n"
            f"🔗 Lien : {thread.jump_url}"
        )
        
        await channel_notif.send(content=msg_content)
        print(f"✅ Notification F95 envoyée pour : {thread.name}")
        
    except Exception as e:
        print(f"❌ Erreur notification F95 : {e}")

# ==================== COMMANDES SLASH ====================

# ✅ Accès direct autorisé (override permissions)
ALLOWED_USER_ID = 394893413843206155

def _user_can_run_checks(interaction: discord.Interaction) -> bool:
    """Autorise admin/manage_guild OU un user ID spécifique."""
    if getattr(interaction.user, "id", None) == ALLOWED_USER_ID:
        return True
    perms = getattr(interaction.user, "guild_permissions", None)
    return bool(perms and (perms.administrator or perms.manage_guild))

@bot.tree.command(name="check_help", description="Affiche la liste des commandes et leur utilité")
async def check_help(interaction: discord.Interaction):
    # ✅ Ack immédiat (évite 404 Unknown interaction)
    try:
        await interaction.response.defer(ephemeral=True)
    except Exception:
        pass

    if not _user_can_run_checks(interaction):
        await interaction.followup.send("⛔ Permission insuffisante.", ephemeral=True)
        return

    help_text = (
        "**🧰 Commandes disponibles (Bot Publication Traduction)**\n\n"
        "**/check_version** — Lance le contrôle complet des versions F95 (Auto + Semi-Auto).\n"
        "**/check_auto** — Lance le contrôle des versions F95 uniquement sur le forum Auto.\n"
        "**/check_semiauto** — Lance le contrôle des versions F95 uniquement sur le forum Semi-Auto.\n"
        "**/check_count** — Compte les threads du forum (actifs + archivés) pour vérifier que le bot “voit tout”.\n"
        "**/force_sync** — Force la synchronisation des commandes slash.\n"
    )

    await interaction.followup.send(help_text, ephemeral=True)



@bot.tree.command(name="check_version", description="Contrôle les versions F95 (Auto + Semi-Auto)")
async def check_version(interaction: discord.Interaction):
    """Lance le contrôle complet immédiatement"""
    if not _user_can_run_checks(interaction):
        await interaction.response.send_message("⛔ Permission insuffisante.", ephemeral=True)
        return

    await interaction.response.send_message("⏳ Contrôle des versions F95 en cours…", ephemeral=True)
    try:
        await run_version_check_once()
        await interaction.followup.send("✅ Contrôle terminé.", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"❌ Erreur: {e}", ephemeral=True)


@bot.tree.command(name="check_auto", description="Contrôle uniquement les traductions Auto")
async def check_auto(interaction: discord.Interaction):
    """Lance le contrôle Auto uniquement"""
    if not _user_can_run_checks(interaction):
        await interaction.response.send_message("⛔ Permission insuffisante.", ephemeral=True)
        return

    await interaction.response.send_message("⏳ Contrôle Auto en cours…", ephemeral=True)
    try:
        await run_version_check_once(forum_filter="auto")
        await interaction.followup.send("✅ Contrôle Auto terminé.", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"❌ Erreur: {e}", ephemeral=True)


@bot.tree.command(name="check_semiauto", description="Contrôle uniquement les traductions Semi-Auto")
async def check_semiauto(interaction: discord.Interaction):
    """Lance le contrôle Semi-Auto uniquement"""
    if not _user_can_run_checks(interaction):
        await interaction.response.send_message("⛔ Permission insuffisante.", ephemeral=True)
        return

    await interaction.response.send_message("⏳ Contrôle Semi-Auto en cours…", ephemeral=True)
    try:
        await run_version_check_once(forum_filter="semiauto")
        await interaction.followup.send("✅ Contrôle Semi-Auto terminé.", ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"❌ Erreur: {e}", ephemeral=True)


@bot.tree.command(name="force_sync", description="Force la synchronisation des commandes")
async def force_sync(interaction: discord.Interaction):
    """Force le sync des commandes. Autorisé pour admin OU ALLOWED_USER_ID."""
    # ✅ Acknowledge tout de suite (évite 404 Unknown interaction)
    try:
        await interaction.response.defer(ephemeral=True)
    except Exception:
        # si déjà ack, on continue et on utilisera followup
        pass

    # ✅ Autorisation: admin OU ton user ID
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
        await interaction.followup.send(f"❌ Erreur: {e}", ephemeral=True)



@bot.tree.command(name="check_count", description="Compte les threads (actifs + archivés) dans les forums")
async def check_count(interaction: discord.Interaction):
    if not _user_can_run_checks(interaction):
        await interaction.response.send_message("⛔ Permission insuffisante.", ephemeral=True)
        return

    await interaction.response.send_message("⏳ Comptage en cours…", ephemeral=True)

    results = []
    for forum_id, forum_type in [
        (FORUM_SEMI_AUTO_ID, "Semi-Auto"),
        (FORUM_AUTO_ID, "Auto"),
    ]:
        if not forum_id:
            continue

        forum = bot.get_channel(forum_id)
        if not forum:
            results.append(f"⚠️ Forum {forum_type} introuvable")
            continue

        threads = await _collect_all_forum_threads(forum)
        results.append(f"📌 {forum_type}: {len(threads)} threads (actifs + archivés)")

    await interaction.followup.send("\n".join(results), ephemeral=True)


# ==================== ÉVÉNEMENTS ====================
@bot.event
async def on_ready():
    print(f'🤖 Bot Serveur 2 prêt : {bot.user}')
    
    # Sync commandes slash
    try:
        await bot.tree.sync()
        print("✅ Commandes slash synchronisées (/check_version, /check_auto, /check_semiauto)")
    except Exception as e:
        print(f"⚠️ Sync commandes slash échouée: {e}")
    
    # Lancement tâche quotidienne
    if not daily_version_check.is_running():
        daily_version_check.start()
        print(f"✅ Contrôle quotidien programmé à {CHECK_TIME_HOUR:02d}:{CHECK_TIME_MINUTE:02d} Europe/Paris")

@bot.event
async def on_thread_create(thread):
    """Envoi rappel F95 lors de la création d'un thread"""
    if thread.parent_id in [FORUM_SEMI_AUTO_ID, FORUM_AUTO_ID]:
        await asyncio.sleep(5 + random.random() * 2)
        thread_actuel = bot.get_channel(thread.id)
        if thread_actuel:
            await envoyer_notification_f95(thread_actuel, is_update=a_tag_maj(thread_actuel))

@bot.event
async def on_thread_update(before, after):
    """Détecte l'ajout du tag MAJ"""
    if after.parent_id in [FORUM_SEMI_AUTO_ID, FORUM_AUTO_ID]:
        if a_tag_maj(after) and not a_tag_maj(before):
            print(f"✅ Tag MAJ détecté sur : {after.name}")
            await envoyer_notification_f95(after, is_update=True)

@bot.event
async def on_message_edit(before, after):
    """Détecte les modifications sur le premier message du thread"""
    if not isinstance(after.channel, discord.Thread):
        return
    
    # Vérifier que c'est bien le starter message
    if after.id == after.channel.id:
        if before.content != after.content:
            if after.channel.parent_id in [FORUM_SEMI_AUTO_ID, FORUM_AUTO_ID]:
                if a_tag_maj(after.channel):
                    await envoyer_notification_f95(after.channel, is_update=True)

# ==================== LANCEMENT ====================
if __name__ == "__main__":
    from discord.http import Route
    Route.BASE = "https://discord.com/api"
    bot.run(TOKEN)