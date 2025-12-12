import discord
from discord.ext import commands
import re
import os
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

# Permissions
intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents)

# --- OUTILS ---

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
    if thread.parent_id != FORUM_CHANNEL_ID: return
    await discord.utils.sleep_until(discord.utils.utcnow()) 
    
    trads = trier_tags(thread.applied_tags)
    if len(trads) > 0:
        await envoyer_annonce(thread, trads)

@bot.event
async def on_thread_update(before, after):
    if after.parent_id != FORUM_CHANNEL_ID: return

    trads_after = trier_tags(after.applied_tags)
    trads_before = trier_tags(before.applied_tags)

    # Si aucun tag de traduction actuellement, on ne fait rien (on attend que vous en mettiez un)
    if len(trads_after) == 0:
        return

    # On déclenche SEULEMENT si les tags ont changé
    # OU si c'est la première fois qu'on met des tags (0 avant -> X après)
    if trads_before != trads_after:
        await envoyer_annonce(after, trads_after)

bot.run(TOKEN)
