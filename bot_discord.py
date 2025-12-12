import discord
from discord.ext import commands
import re
import os
import asyncio
from dotenv import load_dotenv

# Charger les variables d'environnement depuis le fichier .env
load_dotenv()

# --- CONFIGURATION ---
TOKEN = os.getenv('DISCORD_TOKEN')
FORUM_CHANNEL_ID = os.getenv('FORUM_CHANNEL_ID')
ANNOUNCE_CHANNEL_ID = os.getenv('ANNOUNCE_CHANNEL_ID')

# Vérification des variables d'environnement
if not TOKEN:
    raise ValueError("❌ ERREUR : La variable DISCORD_TOKEN n'est pas définie !\n"
                     "Sur Railway : Allez dans Variables → Add Variable → DISCORD_TOKEN")

if not FORUM_CHANNEL_ID:
    raise ValueError("❌ ERREUR : La variable FORUM_CHANNEL_ID n'est pas définie !\n"
                     "Sur Railway : Allez dans Variables → Add Variable → FORUM_CHANNEL_ID = 1427703869844230317")

if not ANNOUNCE_CHANNEL_ID:
    raise ValueError("❌ ERREUR : La variable ANNOUNCE_CHANNEL_ID n'est pas définie !\n"
                     "Sur Railway : Allez dans Variables → Add Variable → ANNOUNCE_CHANNEL_ID = 1449148521084096695")

# Conversion en int après vérification
FORUM_CHANNEL_ID = int(FORUM_CHANNEL_ID)
ANNOUNCE_CHANNEL_ID = int(ANNOUNCE_CHANNEL_ID)

# Délai avant d'envoyer l'annonce (en secondes)
ANNOUNCE_DELAY = 5

# Permissions
intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents)

# Dictionnaire pour gérer les tâches en attente
pending_announcements = {}

# Dictionnaire pour suivre les threads récemment créés (éviter les doublons)
recent_threads = {}

# --- OUTILS ---

async def planifier_annonce(thread, tags_actuels, source=""):
    """
    Planifie l'envoi d'une annonce après un délai.
    Si une nouvelle modification arrive, annule l'ancienne tâche et repart de zéro.
    """
    thread_id = thread.id
    
    # Si une tâche est déjà en attente pour ce thread, on l'annule
    if thread_id in pending_announcements:
        pending_announcements[thread_id].cancel()
        print(f"⏱️ Annulation de l'annonce précédente pour : {thread.name} (source: {source})")
    
    # Fonction qui sera exécutée après le délai
    async def envoyer_apres_delai():
        try:
            await asyncio.sleep(ANNOUNCE_DELAY)
            # Après le délai, on récupère les tags actuels du thread
            thread_actuel = bot.get_channel(thread_id)
            if thread_actuel:
                tags_finaux = trier_tags(thread_actuel.applied_tags)
                if len(tags_finaux) > 0:
                    await envoyer_annonce(thread_actuel, tags_finaux)
            # On retire la tâche du dictionnaire
            if thread_id in pending_announcements:
                del pending_announcements[thread_id]
        except asyncio.CancelledError:
            # La tâche a été annulée, c'est normal
            print(f"❌ Tâche annulée pour : {thread.name}")
    
    # On crée et stocke la nouvelle tâche
    task = asyncio.create_task(envoyer_apres_delai())
    pending_announcements[thread_id] = task
    print(f"⏱️ Annonce planifiée dans {ANNOUNCE_DELAY}s pour : {thread.name} (source: {source})")

def trier_tags(tags):
    """ Récupère les tags avec leurs EMOJIS (Terminé, En cours, etc.) """
    tags_formatted = []
    for tag in tags:
        name = tag.name
        
        # Ajout de l'emoji si présent
        emoji_visuel = (str(tag.emoji) + " ") if tag.emoji else ""
        tags_formatted.append(f"{emoji_visuel}{name}")
    
    return sorted(tags_formatted)

async def nettoyer_doublons_et_verifier_historique(channel, thread_id):
    """
    1. Cherche si ce jeu a déjà été annoncé (pour savoir si c'est une MAJ).
    2. Supprime le message précédent s'il est tout récent (Anti-spam modifications rapides).
    Retourne : True si le jeu a déjà été annoncé dans le passé, False sinon.
    """
    deja_publie = False
    
    # On scanne les 50 derniers messages du salon annonce
    messages = [msg async for msg in channel.history(limit=50)]
    
    if not messages:
        return False

    # Vérification Anti-Spam (Le tout dernier message concerne-t-il ce jeu ?)
    dernier_msg = messages[0]
    if dernier_msg.author == bot.user and str(thread_id) in dernier_msg.content:
        # Oui, c'est le même jeu, on supprime pour remplacer par la nouvelle version
        await dernier_msg.delete()
        deja_publie = True # On considère que c'est une mise à jour
    
    # Si on n'a pas trouvé dans le dernier message, on cherche dans l'historique plus vieux
    if not deja_publie:
        for msg in messages:
            if msg.author == bot.user and str(thread_id) in msg.content:
                deja_publie = True
                break
    
    return deja_publie

async def envoyer_annonce(thread, liste_tags_trads):
    # 1. Vérif canal
    channel_annonce = bot.get_channel(ANNOUNCE_CHANNEL_ID)
    if not channel_annonce: return

    # 2. On détermine si c'est une UPDATE ou une NOUVELLE TRADUCTION
    is_update = await nettoyer_doublons_et_verifier_historique(channel_annonce, thread.id)

    # 3. Lire le contenu du message
    try:
        message = await thread.fetch_message(thread.id)
        contenu = message.content
    except discord.NotFound:
        return

    # 4. Extraction des informations avec regex
    # Titre du jeu (déjà dans thread.name, mais on peut aussi l'extraire)
    titre_match = re.search(r"\*\*Titre du jeu\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
    titre_jeu = titre_match.group(1).strip() if titre_match else thread.name
    
    # Version du jeu (d'abord chercher dans le contenu, sinon extraire du titre)
    version_jeu_match = re.search(r"\*\*Version du jeu\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
    if version_jeu_match:
        version_jeu = version_jeu_match.group(1).strip()
    else:
        # Extraire depuis le titre : "Nom du jeu [v1.0 SE] [Auteur]"
        version_titre_match = re.search(r"\[([^\]]+)\]", thread.name)
        version_jeu = version_titre_match.group(1).strip() if version_titre_match else "Non spécifiée"
    
    # Version traduite
    version_trad_match = re.search(r"\*\*Version traduite\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
    version_traduction = version_trad_match.group(1).strip() if version_trad_match else "Non spécifiée"
    
    # Lien du jeu (VO)
    lien_jeu_match = re.search(r"\*\*Lien du jeu \(VO\)\s*:\*\*\s*\[.+?\]\((.+?)\)", contenu)
    lien_jeu = lien_jeu_match.group(1).strip() if lien_jeu_match else None

    # 5. État de la traduction (tags)
    etat_txt = ", ".join(liste_tags_trads) if liste_tags_trads else "Non spécifié"

    # 6. Extraction de l'image
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

    # 7. Construction du message d'annonce
    prefixe = "🔄 **Mise à jour d'une traduction**" if is_update else "🎮 **Publication d'une nouvelle traduction**"
    
    msg_content = f"{prefixe}\n\n"
    msg_content += f"**Nom du jeu :** {titre_jeu}\n"
    msg_content += f"**Version du jeu :** {version_jeu}\n"
    msg_content += f"**Version de la traduction :** {version_traduction}\n"
    msg_content += f"**État :** {etat_txt}\n"
    msg_content += f"**Lien :** {thread.jump_url}"

    # 8. Envoi du message
    if image_url:
        embed = discord.Embed(color=discord.Color.green())
        embed.set_image(url=image_url)
        await channel_annonce.send(content=msg_content, embed=embed)
    else:
        await channel_annonce.send(content=msg_content)
        
    print(f"Annonce envoyée ({prefixe}) : {titre_jeu}")


# --- ÉVÉNEMENTS ---

@bot.event
async def on_ready():
    print(f'Bot prêt : {bot.user}')

@bot.event
async def on_thread_create(thread):
    """Détecte la création d'un nouveau thread"""
    if thread.parent_id != FORUM_CHANNEL_ID: return
    
    # Marquer ce thread comme récemment créé (pour éviter les doublons avec on_thread_update)
    # On utilise un délai plus long (30 secondes) pour être sûr
    import time
    recent_threads[thread.id] = time.time()
    
    # Attendre un peu pour que Discord finisse de créer le thread
    await asyncio.sleep(1)
    
    # Récupérer le thread à jour avec tous ses tags
    thread_actuel = bot.get_channel(thread.id)
    if not thread_actuel:
        return
    
    trads = trier_tags(thread_actuel.applied_tags)
    # On envoie l'annonce seulement si des tags sont présents
    if len(trads) > 0:
        print(f"🆕 Nouveau thread créé : {thread_actuel.name}")
        await planifier_annonce(thread_actuel, trads, source="thread_create")

@bot.event
async def on_thread_update(before, after):
    """Détecte les modifications des tags d'un thread"""
    if after.parent_id != FORUM_CHANNEL_ID: return
    
    # Ignorer les mises à jour dans les 30 premières secondes après création (éviter doublons)
    import time
    if after.id in recent_threads:
        temps_ecoule = time.time() - recent_threads[after.id]
        if temps_ecoule < 30:
            print(f"⏭️ Thread récent ({temps_ecoule:.1f}s), on_thread_update ignoré pour : {after.name}")
            return
        else:
            # Nettoyer le dictionnaire après 30 secondes
            del recent_threads[after.id]

    trads_after = trier_tags(after.applied_tags)
    trads_before = trier_tags(before.applied_tags)

    # Si aucun tag actuellement, on ne fait rien
    if len(trads_after) == 0:
        print(f"❌ Pas de tags sur : {after.name} - Annonce ignorée")
        return

    # Vérifier si des tags ont été AJOUTÉS (pas seulement retirés)
    tags_ajoutes = set(trads_after) - set(trads_before)
    
    if len(tags_ajoutes) > 0:
        # Des tags ont été ajoutés, on planifie l'annonce
        print(f"✅ Tags ajoutés sur {after.name} : {tags_ajoutes}")
        await planifier_annonce(after, trads_after, source="thread_update")
    else:
        # Seulement des tags retirés, on ignore
        print(f"⏭️ Tags retirés uniquement sur {after.name} - Annonce ignorée")

@bot.event
async def on_message_edit(before, after):
    """Détecte les modifications du contenu du premier message d'un thread"""
    # Vérifier si c'est un message dans un thread du forum
    if not isinstance(after.channel, discord.Thread):
        return
    
    if after.channel.parent_id != FORUM_CHANNEL_ID:
        return
    
    # Vérifier si c'est le premier message du thread (ID du message = ID du thread)
    if after.id != after.channel.id:
        return
    
    # Vérifier si le contenu a vraiment changé
    if before.content == after.content:
        return
    
    # Ignorer les modifications dans les 30 premières secondes après création (éviter doublons)
    import time
    if after.channel.id in recent_threads:
        temps_ecoule = time.time() - recent_threads[after.channel.id]
        if temps_ecoule < 30:
            print(f"⏭️ Thread récent ({temps_ecoule:.1f}s), on_message_edit ignoré pour : {after.channel.name}")
            return
    
    # Récupérer les tags actuels
    trads = trier_tags(after.channel.applied_tags)
    
    # Si il y a des tags, on planifie l'annonce
    if len(trads) > 0:
        print(f"📝 Modification du contenu détectée pour : {after.channel.name}")
        await planifier_annonce(after.channel, trads, source="message_edit")

bot.run(TOKEN)
