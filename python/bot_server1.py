import discord
from discord.ext import commands
from discord import app_commands
import re
import os
import asyncio
import random
import time
import json
import base64
from dotenv import load_dotenv

load_dotenv()

# Configuration (inchangée)
TOKEN = os.getenv('DISCORD_TOKEN')
# Salon surveillé pour les nouveaux posts (forum "my")
FORUM_CHANNEL_ID = int(os.getenv('FORUM_CHANNEL_ID'))
# Salon de réception des annonces / mises à jour (utilisé uniquement si annonces gérées par ce bot)
ANNOUNCE_CHANNEL_ID = int(os.getenv('ANNOUNCE_CHANNEL_ID'))
ANNOUNCE_DELAY = 5
# Les annonces (nouvelle traduction / mise à jour) sont envoyées par le publisher ; ce bot ne les envoie plus
ANNOUNCEMENTS_HANDLED_BY_PUBLISHER = True

# Supabase : source de vérité pour published_posts (réduit les appels Discord)
_supabase_client = None
def _get_supabase():
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client
    url = (os.getenv("SUPABASE_URL") or "").strip()
    key = (os.getenv("SUPABASE_ANON_KEY") or "").strip()
    if not url or not key:
        return None
    try:
        from supabase import create_client
        _supabase_client = create_client(url, key)
        return _supabase_client
    except Exception as e:
        print(f"⚠️ Supabase non disponible: {e}")
        return None


def fetch_post_by_thread_id_sync(thread_id):
    """Récupère la ligne published_posts par thread_id (source de vérité). Retourne None si absent."""
    sb = _get_supabase()
    if not sb:
        return None
    try:
        r = sb.table("published_posts").select("*").eq("thread_id", str(thread_id)).order("updated_at", desc=True).limit(1).execute()
        if r.data and len(r.data) > 0:
            return r.data[0]
    except Exception as e:
        print(f"⚠️ Supabase fetch_post_by_thread_id: {e}")
    return None


def _traducteur_from_content(content):
    """Extrait le traducteur depuis le contenu (regex cohérent avec extraire_infos_post)."""
    if not content:
        return None
    m = re.search(
        r"(?:\*\*\s*)?Traducteur\s*:\s*(?:\*\*\s*)?(.+?)(?:\n|$)",
        content,
        re.IGNORECASE,
    )
    if not m:
        return None
    t = m.group(1).strip()
    if t.lower() in ("(traducteur)", "(nom)", "", "n/a", "na", "aucun"):
        return None
    return t


def _parse_saved_inputs(row):
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


def infos_from_row(row):
    """
    Construit le même dict que extraire_infos_post à partir d'une ligne published_posts.
    Cohérent avec la table : title, saved_inputs, content, translation_type, is_integrated.
    """
    saved = _parse_saved_inputs(row)
    title = (row.get("title") or "").strip()
    content = row.get("content") or ""
    return {
        "titre_jeu": (saved.get("Game_name") or title or "Jeu inconnu").strip(),
        "traducteur": _traducteur_from_content(content),
        "version_jeu": (saved.get("Game_version") or "Non spécifiée").strip(),
        "version_trad": (saved.get("Translate_version") or "Non spécifiée").strip(),
        "translation_type": (row.get("translation_type") or "Non spécifié").strip(),
        "is_integrated": bool(row.get("is_integrated", False)),
    }

intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents)

pending_announcements = {}
recent_threads = {}
announcement_locks = {}

# Nom du traducteur "principal" (pour ne pas afficher "de moi")
# Peut être surchargé via la variable d'environnement OWNER_TRANSLATOR_NAME.
OWNER_TRANSLATOR_NAME = os.getenv("OWNER_TRANSLATOR_NAME", "🏍️ Roadrenegat").strip()


# ✅ NOUVELLE FONCTION : Extraire les métadonnées de l'embed invisible
def extraire_metadata_embed(message):
    """
    Extrait les métadonnées structurées depuis l'embed invisible
    Retourne un dict avec les données ou None si aucune métadonnée trouvée
    """
    if not message.embeds:
        return None

    def _b64decode_padded(s: str) -> bytes:
        """Décodage base64 tolérant (padding manquant, espaces, etc.)."""
        s = (s or "").strip()
        if not s:
            return b""
        # Discord / certaines libs peuvent tronquer le padding (=)
        missing = (-len(s)) % 4
        if missing:
            s += "=" * missing
        return base64.b64decode(s)
    
    for embed in message.embeds:
        # Vérifier si c'est notre embed de métadonnées
        # Ancien format: footer "metadata:..."
        # Nouveau format: footer "metadata:v1:chunks=..." (ou similaire)
        if embed.footer and embed.footer.text and embed.footer.text.startswith("metadata:"):
            try:
                if not embed.fields:
                    return None

                # ✅ Nouveau: les données peuvent être découpées en plusieurs fields (chunks)
                # On concatène tout pour reconstituer le base64 complet.
                joined = "".join([f.value or "" for f in embed.fields]).strip()

                # Compat ancien format où les données étaient dans un bloc ```json ...```
                json_b64 = joined.replace("```json\n", "").replace("\n```", "").strip()

                raw = _b64decode_padded(json_b64)
                metadata_json = raw.decode("utf-8")

                try:
                    metadata = json.loads(metadata_json)
                except json.JSONDecodeError:
                    import urllib.parse
                    metadata = json.loads(urllib.parse.unquote(metadata_json))

                print(f"✅ Métadonnées structurées trouvées: {metadata.get('game_name', 'N/A')}")
                return metadata
            except Exception as e:
                print(f"⚠️ Erreur extraction métadonnées embed: {e}")
                return None
    
    return None


# ✅ FONCTION MODIFIÉE : Extraction avec priorité sur les métadonnées structurées
def extraire_infos_post(message, metadata=None):
    """
    Extrait les informations du post.
    Si metadata (dict) est fourni, utilise ces données en priorité.
    Sinon, fallback sur le parsing Regex du contenu.

    Retourne: dict avec {
        'titre_jeu': str,
        'traducteur': str ou None,
        'version_jeu': str,
        'version_trad': str,
        'translation_type': str,
        'is_integrated': bool
    }
    """

    def nettoyer_nom_jeu_depuis_thread_name(thread_name: str) -> str:
        """
        Nettoie un nom de thread du style:
        "Forbidden Kin [v1.0 SE] [FR = v1.0 SE] [Dumb Koala Games]"
        -> "Forbidden Kin"
        """
        if not thread_name:
            return "Jeu inconnu"
        s = thread_name.strip()
        if "[" in s:
            s = s.split("[", 1)[0].strip()
        return s or "Jeu inconnu"

    # Valeurs par défaut
    thread_name = message.channel.name if hasattr(message, "channel") else "Jeu inconnu"
    infos = {
        # ⚠️ IMPORTANT: par défaut on nettoie déjà le nom du thread
        # pour éviter d'afficher le titre complet en "Nom du jeu" dans les annonces.
        "titre_jeu": nettoyer_nom_jeu_depuis_thread_name(thread_name),
        "traducteur": None,
        "version_jeu": "Non spécifiée",
        "version_trad": "Non spécifiée",
        "translation_type": "Non spécifié",
        "is_integrated": False,
    }

    # ✅ PRIORITÉ 1 : Métadonnées structurées
    if metadata:
        # Ici on garde tel quel (c'est la source de vérité: Game_name -> game_name)
        titre_meta = (metadata.get("game_name") or "").strip()
        if titre_meta:
            infos["titre_jeu"] = titre_meta

        trad_meta = (metadata.get("traductor") or "").strip()
        infos["traducteur"] = trad_meta or None

        vj_meta = (metadata.get("game_version") or "").strip()
        if vj_meta:
            infos["version_jeu"] = vj_meta

        vt_meta = (metadata.get("translate_version") or "").strip()
        if vt_meta:
            infos["version_trad"] = vt_meta

        tt_meta = (metadata.get("translation_type") or "").strip()
        if tt_meta:
            infos["translation_type"] = tt_meta

        infos["is_integrated"] = bool(metadata.get("is_integrated", False))

        print(f"📊 Données extraites depuis métadonnées: {infos['titre_jeu']}")
        return infos

    # ✅ PRIORITÉ 2 : Parsing Regex (fallback pour les anciens posts)
    contenu = message.content or ""

    # Traducteur
    trad_match = re.search(
        r"(?:\*\*\s*)?Traducteur\s*:\s*(?:\*\*\s*)?(.+?)(?:\n|$)",
        contenu,
        re.IGNORECASE,
    )
    if trad_match:
        traducteur = trad_match.group(1).strip()
        if traducteur.lower() not in ["(traducteur)", "(nom)", "", "n/a", "na", "aucun"]:
            infos["traducteur"] = traducteur

    # Titre du jeu (si présent dans le contenu, il override le fallback nettoyé)
    titre_match_message = re.search(
        r"TRADUCTION FR DISPONIBLE POUR\s*:\s*\*\*(.+?)\*\*",
        contenu,
        re.IGNORECASE,
    )
    if titre_match_message:
        infos["titre_jeu"] = titre_match_message.group(1).strip()
    else:
        titre_match = re.search(r"\*\*Titre du jeu\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
        if titre_match:
            titre_extrait = titre_match.group(1).strip()
            if titre_extrait.lower() not in ["(titre du jeu)", "(titre)", ""]:
                infos["titre_jeu"] = titre_extrait

    # Version du jeu
    version_jeu_match = re.search(r"\*\*Version du jeu\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
    if version_jeu_match:
        infos["version_jeu"] = version_jeu_match.group(1).strip()
    else:
        # Fallback: essayer d'extraire le 1er crochet du nom du thread
        version_titre_match = re.search(r"\[([^\]]+)\]", thread_name or "")
        if version_titre_match:
            infos["version_jeu"] = version_titre_match.group(1).strip()

    # Version de la traduction
    version_trad_match = re.search(
        r"\*\*Version traduite\s*:\*\*\s*(.+?)(?:\n|$)", contenu
    )
    if version_trad_match:
        infos["version_trad"] = version_trad_match.group(1).strip()

    # Détecter si traduction intégrée (mot-clé dans le contenu)
    if re.search(r"int[ée]gr[ée]e", contenu, re.IGNORECASE):
        infos["is_integrated"] = True

    print(f"📊 Données extraites depuis Regex: {infos['titre_jeu']}")
    return infos


def trier_tags(tags):
    """Trie les tags par ordre alphabétique avec émoji"""
    tags_formatted = []
    for tag in tags:
        emoji_visuel = (str(tag.emoji) + " ") if tag.emoji else ""
        tags_formatted.append(f"{emoji_visuel}{tag.name}")
    return sorted(tags_formatted)


async def planifier_annonce(thread, tags_actuels, source=""):
    """Planifie l'envoi d'une annonce après un délai"""
    thread_id = thread.id
    if thread_id not in announcement_locks:
        announcement_locks[thread_id] = asyncio.Lock()
    
    async with announcement_locks[thread_id]:
        if thread_id in pending_announcements:
            pending_announcements[thread_id].cancel()
            print(f"⏱️ Annulation de l'annonce précédente : {thread.name}")
        
        async def envoyer_apres_delai():
            try:
                await asyncio.sleep(ANNOUNCE_DELAY + (random.random() * 2))
                thread_actuel = bot.get_channel(thread_id)
                if thread_actuel:
                    tags_finaux = trier_tags(thread_actuel.applied_tags)
                    if len(tags_finaux) > 0:
                        async with announcement_locks[thread_id]:
                            await envoyer_annonce(thread_actuel, tags_finaux)
                pending_announcements.pop(thread_id, None)
            except asyncio.CancelledError:
                pass
        
        task = asyncio.create_task(envoyer_apres_delai())
        pending_announcements[thread_id] = task


async def nettoyer_doublons_et_verifier_historique(channel, thread_id):
    """Vérifie l'historique et détecte les doublons"""
    deja_publie = False
    version_jeu_precedente = None
    version_trad_precedente = None
    dernier_msg_supprime = False
    
    messages = [msg async for msg in channel.history(limit=25)]
    if not messages:
        return (False, None, None, False)

    for msg in messages:
        if msg.author == bot.user and str(thread_id) in msg.content:
            if not deja_publie:
                try:
                    await msg.delete()
                    deja_publie = True
                    dernier_msg_supprime = True
                except:
                    pass
            
            contenu = msg.content
            vj_match = re.search(r"\*\*Version du jeu\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
            vt_match = re.search(r"\*\*Version de la traduction\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
            if vj_match:
                version_jeu_precedente = vj_match.group(1).strip()
            if vt_match:
                version_trad_precedente = vt_match.group(1).strip()
            break
    
    return (deja_publie, version_jeu_precedente, version_trad_precedente, dernier_msg_supprime)


# ✅ FONCTION MODIFIÉE : Priorité Supabase (published_posts), puis fallback métadonnées Discord
async def envoyer_annonce(thread, liste_tags_trads):
    """Envoie l'annonce dans le canal ANNOUNCE_CHANNEL_ID. Lit d'abord la BDD (moins d'appels Discord)."""
    channel_annonce = bot.get_channel(ANNOUNCE_CHANNEL_ID)
    if not channel_annonce:
        return

    try:
        # Message de départ (nécessaire pour l'image en annonce)
        message = thread.starter_message
        if not message:
            await asyncio.sleep(1.5)
            message = thread.starter_message or await thread.fetch_message(thread.id)

        # 1) Priorité : ligne published_posts par thread_id (source de vérité)
        loop = asyncio.get_event_loop()
        row = await loop.run_in_executor(None, fetch_post_by_thread_id_sync, thread.id)
        if row:
            infos = infos_from_row(row)
            print(f"✅ Données annonce depuis Supabase (thread_id={thread.id})")
        else:
            # 2) Fallback : métadonnées embed Discord (anciens posts)
            metadata = extraire_metadata_embed(message)
            infos = extraire_infos_post(message, metadata)

        titre_jeu = infos['titre_jeu']
        traducteur = infos['traducteur']
        version_jeu = infos['version_jeu']
        version_traduction = infos['version_trad']
        translation_type = infos.get('translation_type', 'Non spécifié')
        is_integrated = infos['is_integrated']

    except Exception as e:
        print(f"❌ Erreur lecture message starter: {e}")
        return

    # Vérification historique
    deja_publie, v_jeu_p, v_trad_p, dernier_msg_supprime = await nettoyer_doublons_et_verifier_historique(
        channel_annonce, thread.id
    )
    
    v_jeu_changee = v_jeu_p and v_jeu_p != version_jeu
    v_trad_changee = v_trad_p and v_trad_p != version_traduction
    
    if deja_publie and not (v_jeu_changee or v_trad_changee) and not dernier_msg_supprime:
        print(f"⭐️ Thread déjà annoncé et à jour : {titre_jeu}")
        return
    
    # Extraction de l'image
    image_url = None
    if message.attachments:
        image_url = message.attachments[0].url
    elif message.embeds:
        for emb in message.embeds:
            # Ignorer l'embed de métadonnées (couleur #2b2d31)
            if emb.color and emb.color.value == 2829617:
                continue
            if emb.image:
                image_url = emb.image.url
                break

    # Construction du message d'annonce
    is_update = deja_publie
    # ✅ Nouveau titre: si traducteur partenaire => "de <nom>", sinon pas de "de moi"
    is_partner = bool(traducteur) and traducteur.strip().casefold() != OWNER_TRANSLATOR_NAME.casefold()
    if is_update:
        prefixe = f"🔄 **Mise à jour d'une traduction de {traducteur}**" if is_partner else "🔄 **Mise à jour d'une traduction**"
    else:
        prefixe = f"🎮 **Nouvelle traduction de {traducteur}**" if is_partner else "🎮 **Nouvelle traduction**"
    
    msg_content = f"{prefixe}\n\n"
    msg_content += f"**Nom du jeu :** [{titre_jeu}]({thread.jump_url})\n"
    if traducteur:
        msg_content += f"**Traducteur :** {traducteur}\n"
    msg_content += f"**Version du jeu :** {version_jeu}\n"
    msg_content += f"**Version de la traduction :** {version_traduction}\n"

    # ✅ Type de traduction + intégration (affiché uniquement si renseigné)
    translation_type_clean = (translation_type or "").strip()
    if translation_type_clean and translation_type_clean.lower() not in ("non spécifié", "non specifie", "n/a", "na"):
        if is_integrated is None:
            msg_content += f"**Type de traduction :** {translation_type_clean}\n"
        else:
            integration_txt = "Intégrée" if is_integrated else "Non intégrée"
            msg_content += f"**Type de traduction :** {translation_type_clean} ({integration_txt})\n"
    
    msg_content += f"\n**État :** {', '.join(liste_tags_trads)}"
    msg_content += "\n\n**Bon jeu à vous** 😊"

    # Envoi du message
    if image_url:
        embed = discord.Embed(color=discord.Color.green()).set_image(url=image_url)
        await channel_annonce.send(content=msg_content, embed=embed)
    else:
        await channel_annonce.send(content=msg_content)
        
    print(f"✅ Annonce envoyée pour : {titre_jeu}")

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

# --- ÉVÉNEMENTS (inchangés) ---

@bot.event
async def on_ready():
    print(f'🤖 Bot Serveur 1 prêt : {bot.user}')

@bot.event
async def on_thread_create(thread):
    if ANNOUNCEMENTS_HANDLED_BY_PUBLISHER:
        return
    if thread.parent_id == FORUM_CHANNEL_ID:
        recent_threads[thread.id] = time.time()
        await asyncio.sleep(3 + random.random() * 2)
        thread_actuel = bot.get_channel(thread.id)
        if thread_actuel:
            trads = trier_tags(thread_actuel.applied_tags)
            if trads:
                await envoyer_annonce(thread_actuel, trads)

@bot.event
async def on_thread_update(before, after):
    if ANNOUNCEMENTS_HANDLED_BY_PUBLISHER:
        return
    if after.parent_id == FORUM_CHANNEL_ID:
        if after.id in recent_threads and (time.time() - recent_threads[after.id]) < 30:
            return
        trads_after = trier_tags(after.applied_tags)
        if trads_after and (set(trads_after) != set(trier_tags(before.applied_tags))):
            await planifier_annonce(after, trads_after, source="update")

@bot.event
async def on_message_edit(before, after):
    if ANNOUNCEMENTS_HANDLED_BY_PUBLISHER:
        return
    if isinstance(after.channel, discord.Thread) and after.channel.parent_id == FORUM_CHANNEL_ID and after.id == after.channel.id:
        if before.content != after.content:
            trads = trier_tags(after.channel.applied_tags)
            if trads:
                await planifier_annonce(after.channel, trads, source="edit")

if __name__ == "__main__":
    from discord.http import Route
    Route.BASE = "https://discord.com/api" 
    bot.run(TOKEN)
