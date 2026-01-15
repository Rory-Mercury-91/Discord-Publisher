"""
Bot Discord - Serveur 1 : Annonces de traductions
Gère les annonces complètes de traductions sur le serveur principal
"""
import discord
from discord.ext import commands
import re
import os
import asyncio
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION SERVEUR 1 ---
TOKEN = os.getenv('DISCORD_TOKEN')
FORUM_CHANNEL_ID = int(os.getenv('FORUM_CHANNEL_ID'))
ANNOUNCE_CHANNEL_ID = int(os.getenv('ANNOUNCE_CHANNEL_ID'))
FORUM_PARTNER_ID = int(os.getenv('FORUM_PARTNER_ID')) if os.getenv('FORUM_PARTNER_ID') else None
ANNOUNCE_DELAY = 5

# Vérifications
if not TOKEN:
    raise ValueError("❌ DISCORD_TOKEN manquant")
if not FORUM_CHANNEL_ID:
    raise ValueError("❌ FORUM_CHANNEL_ID manquant")
if not ANNOUNCE_CHANNEL_ID:
    raise ValueError("❌ ANNOUNCE_CHANNEL_ID manquant")

# Permissions
intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents)

# Dictionnaires de gestion
pending_announcements = {}
recent_threads = {}
announcement_locks = {}


async def planifier_annonce(thread, tags_actuels, source=""):
    """Planifie l'envoi d'une annonce après un délai"""
    thread_id = thread.id
    
    if thread_id not in announcement_locks:
        announcement_locks[thread_id] = asyncio.Lock()
    
    async with announcement_locks[thread_id]:
        if thread_id in pending_announcements:
            pending_announcements[thread_id].cancel()
            print(f"⏱️ Annulation de l'annonce précédente pour : {thread.name} (source: {source})")
        
        async def envoyer_apres_delai():
            try:
                await asyncio.sleep(ANNOUNCE_DELAY)
                thread_actuel = bot.get_channel(thread_id)
                if thread_actuel:
                    tags_finaux = trier_tags(thread_actuel.applied_tags)
                    if len(tags_finaux) > 0:
                        async with announcement_locks[thread_id]:
                            await envoyer_annonce(thread_actuel, tags_finaux)
                if thread_id in pending_announcements:
                    del pending_announcements[thread_id]
            except asyncio.CancelledError:
                print(f"❌ Tâche annulée pour : {thread.name}")
        
        task = asyncio.create_task(envoyer_apres_delai())
        pending_announcements[thread_id] = task
        print(f"⏱️ Annonce planifiée dans {ANNOUNCE_DELAY}s pour : {thread.name} (source: {source})")


def trier_tags(tags):
    """Récupère les tags avec leurs emojis"""
    tags_formatted = []
    for tag in tags:
        emoji_visuel = (str(tag.emoji) + " ") if tag.emoji else ""
        tags_formatted.append(f"{emoji_visuel}{tag.name}")
    return sorted(tags_formatted)


async def nettoyer_doublons_et_verifier_historique(channel, thread_id):
    """
    Vérifie l'historique et supprime les doublons récents
    Retourne : (deja_publie, version_jeu_precedente, version_trad_precedente, dernier_msg_supprime)
    """
    deja_publie = False
    version_jeu_precedente = None
    version_trad_precedente = None
    dernier_msg_supprime = False
    
    messages = [msg async for msg in channel.history(limit=50)]
    if not messages:
        return (False, None, None, False)

    # Vérification dernier message
    dernier_msg = messages[0]
    if dernier_msg.author == bot.user and str(thread_id) in dernier_msg.content:
        await dernier_msg.delete()
        deja_publie = True
        dernier_msg_supprime = True
        
        # Extraire versions
        contenu = dernier_msg.content
        version_jeu_match = re.search(r"\*\*Version du jeu\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
        version_trad_match = re.search(r"\*\*Version de la traduction\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
        if version_jeu_match:
            version_jeu_precedente = version_jeu_match.group(1).strip()
        if version_trad_match:
            version_trad_precedente = version_trad_match.group(1).strip()
    
    # Recherche dans l'historique
    if not deja_publie:
        for msg in messages:
            if msg.author == bot.user and str(thread_id) in msg.content:
                deja_publie = True
                contenu = msg.content
                version_jeu_match = re.search(r"\*\*Version du jeu\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
                version_trad_match = re.search(r"\*\*Version de la traduction\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
                if version_jeu_match:
                    version_jeu_precedente = version_jeu_match.group(1).strip()
                if version_trad_match:
                    version_trad_precedente = version_trad_match.group(1).strip()
                break
    
    return (deja_publie, version_jeu_precedente, version_trad_precedente, dernier_msg_supprime)


async def envoyer_annonce(thread, liste_tags_trads):
    """Envoie l'annonce dans le canal dédié"""
    channel_annonce = bot.get_channel(ANNOUNCE_CHANNEL_ID)
    if not channel_annonce:
        return

    try:
        message = await thread.fetch_message(thread.id)
        contenu = message.content
    except discord.NotFound:
        return

    # Extraction du traducteur
    traducteur = None
    trad_match = re.search(r"(?:\*\*\s*)?Traducteur\s*:\s*(?:\*\*\s*)?(.+?)(?:\n|$)", contenu, re.IGNORECASE)
    if trad_match:
        traducteur = trad_match.group(1).strip()
        if traducteur.lower() in ["(traducteur)", "(nom)", "", "n/a", "na", "aucun"]:
            traducteur = None

    # Extraction titre du jeu
    titre_jeu = thread.name
    titre_match_message = re.search(r"TRADUCTION FR DISPONIBLE POUR\s*:\s*\*\*(.+?)\*\*", contenu, re.IGNORECASE)
    if titre_match_message:
        titre_jeu = titre_match_message.group(1).strip()
    else:
        titre_match = re.search(r"\*\*Titre du jeu\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
        if titre_match:
            titre_extrait = titre_match.group(1).strip()
            if titre_extrait.lower() not in ["(titre du jeu)", "(titre)", ""]:
                titre_jeu = titre_extrait
    
    # Version du jeu
    version_jeu_match = re.search(r"\*\*Version du jeu\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
    if version_jeu_match:
        version_jeu = version_jeu_match.group(1).strip()
    else:
        version_titre_match = re.search(r"\[([^\]]+)\]", thread.name)
        version_jeu = version_titre_match.group(1).strip() if version_titre_match else "Non spécifiée"
    
    # Version traduite
    version_trad_match = re.search(r"\*\*Version traduite\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
    version_traduction = version_trad_match.group(1).strip() if version_trad_match else "Non spécifiée"
    
    # Vérification doublons et versions
    deja_publie, version_jeu_precedente, version_trad_precedente, dernier_msg_supprime = \
        await nettoyer_doublons_et_verifier_historique(channel_annonce, thread.id)
    
    version_jeu_changee = version_jeu_precedente and version_jeu_precedente != version_jeu
    version_trad_changee = version_trad_precedente and version_trad_precedente != version_traduction
    version_changee = version_jeu_changee or version_trad_changee
    
    is_update = deja_publie
    
    if dernier_msg_supprime:
        is_update = True
        if version_changee:
            print(f"🔄 Changement de version : {titre_jeu}")
        else:
            print(f"🔄 Modification : {titre_jeu}")
    elif version_changee:
        is_update = True
        messages = [msg async for msg in channel_annonce.history(limit=50)]
        for msg in messages:
            if msg.author == bot.user and str(thread.id) in msg.content:
                await msg.delete()
                print(f"🗑️ Ancienne annonce supprimée : {thread.name}")
                break
        print(f"🔄 Changement de version : {titre_jeu}")
    elif deja_publie and not version_changee:
        print(f"⭐️ Thread déjà annoncé, ignoré : {titre_jeu}")
        return
    
    # Lien du jeu
    lien_jeu_match = re.search(r"\*\*Lien du jeu \(VO\)\s*:\*\*\s*\[.+?\]\((.+?)\)", contenu)
    lien_jeu = lien_jeu_match.group(1).strip() if lien_jeu_match else None

    # État de la traduction
    etat_txt = ", ".join(liste_tags_trads) if liste_tags_trads else "Non spécifié"

    # Extraction image
    image_url = None
    if message.attachments:
        for attachment in message.attachments:
            if attachment.content_type and attachment.content_type.startswith('image'):
                image_url = attachment.url
                break
    if not image_url and message.embeds:
        for emb in message.embeds:
            if emb.image:
                image_url = emb.image.url
                break
            elif emb.thumbnail:
                image_url = emb.thumbnail.url
                break

    # Construction message
    if traducteur:
        prefixe = f"🔄 **Mise à jour d'une traduction de {traducteur}**" if is_update else f"🎮 **Publication d'une nouvelle traduction de {traducteur}**"
    else:
        prefixe = "🔄 **Mise à jour d'une de mes traduction**" if is_update else "🎮 **Publication d'une de mes nouvelle traduction**"
    
    msg_content = f"{prefixe}\n\n"
    msg_content += f"**Nom du jeu :** [{titre_jeu}]({thread.jump_url})\n"
    if traducteur:
        msg_content += f"**Traducteur :** {traducteur}\n"
    msg_content += f"**Version du jeu :** {version_jeu}\n"
    msg_content += f"**Version de la traduction :** {version_traduction}\n"
    msg_content += f"**État :** {etat_txt}"

    # Envoi
    if image_url:
        embed = discord.Embed(color=discord.Color.green())
        embed.set_image(url=image_url)
        await channel_annonce.send(content=msg_content, embed=embed)
    else:
        await channel_annonce.send(content=msg_content)
        
    print(f"✅ Annonce envoyée : {titre_jeu}")


@bot.event
async def on_ready():
    print(f'🤖 Bot Serveur 1 prêt : {bot.user}')
    print(f'📊 Forum surveillé : {FORUM_CHANNEL_ID}')
    if FORUM_PARTNER_ID:
        print(f'📊 Forum partenaires : {FORUM_PARTNER_ID}')


@bot.event
async def on_thread_create(thread):
    """Détecte la création d'un nouveau thread"""
    if thread.parent_id == FORUM_CHANNEL_ID or (FORUM_PARTNER_ID and thread.parent_id == FORUM_PARTNER_ID):
        import time
        recent_threads[thread.id] = time.time()
        
        await asyncio.sleep(2)
        
        thread_actuel = bot.get_channel(thread.id)
        if not thread_actuel:
            print(f"❌ Thread introuvable : {thread.id}")
            return
        
        trads = trier_tags(thread_actuel.applied_tags)
        if len(trads) > 0:
            print(f"🆕 Nouveau thread : {thread_actuel.name} - tags : {trads}")
            await envoyer_annonce(thread_actuel, trads)
        else:
            print(f"⭐️ Nouveau thread sans tags : {thread_actuel.name}")


@bot.event
async def on_thread_update(before, after):
    """Détecte les modifications des tags"""
    if after.parent_id == FORUM_CHANNEL_ID or (FORUM_PARTNER_ID and after.parent_id == FORUM_PARTNER_ID):
        import time
        if after.id in recent_threads:
            temps_ecoule = time.time() - recent_threads[after.id]
            if temps_ecoule < 30:
                print(f"⭐️ Thread récent ({temps_ecoule:.1f}s), ignoré : {after.name}")
                return
            else:
                del recent_threads[after.id]

        trads_after = trier_tags(after.applied_tags)
        trads_before = trier_tags(before.applied_tags)

        if len(trads_after) == 0:
            print(f"❌ Pas de tags : {after.name}")
            return

        tags_ajoutes = set(trads_after) - set(trads_before)
        
        if len(tags_ajoutes) > 0:
            print(f"✅ Tags ajoutés : {after.name} - {tags_ajoutes}")
            await planifier_annonce(after, trads_after, source="thread_update")
        else:
            print(f"⭐️ Tags retirés uniquement : {after.name}")


@bot.event
async def on_message_edit(before, after):
    """Détecte les modifications du contenu"""
    if not isinstance(after.channel, discord.Thread):
        return
    
    if after.id != after.channel.id:
        return
    
    if before.content == after.content:
        return
    
    if after.channel.parent_id == FORUM_CHANNEL_ID or (FORUM_PARTNER_ID and after.channel.parent_id == FORUM_PARTNER_ID):
        import time
        if after.channel.id in recent_threads:
            temps_ecoule = time.time() - recent_threads[after.channel.id]
            if temps_ecoule < 30:
                print(f"⭐️ Thread récent ({temps_ecoule:.1f}s), édition ignorée : {after.channel.name}")
                return
        
        trads = trier_tags(after.channel.applied_tags)
        
        if len(trads) > 0:
            print(f"📝 Modification contenu : {after.channel.name}")
            await planifier_annonce(after.channel, trads, source="message_edit")


if __name__ == "__main__":
    print("=" * 50)
    print("Bot Discord Serveur 1 - Démarrage")
    print("=" * 50)
    bot.run(TOKEN)
