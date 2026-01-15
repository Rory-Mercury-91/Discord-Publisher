"""
Bot Discord - Serveur 2 : Rappels F95fr
Gère les notifications de rappel pour les publications F95fr
"""
import discord
from discord.ext import commands
import os
import asyncio
import datetime
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION SERVEUR 2 ---
TOKEN = os.getenv('DISCORD_TOKEN_F95')
FORUM_SEMI_AUTO_ID = int(os.getenv('FORUM_SEMI_AUTO_ID')) if os.getenv('FORUM_SEMI_AUTO_ID') else None
FORUM_AUTO_ID = int(os.getenv('FORUM_AUTO_ID')) if os.getenv('FORUM_AUTO_ID') else None
NOTIFICATION_CHANNEL_F95_ID = int(os.getenv('NOTIFICATION_CHANNEL_F95_ID')) if os.getenv('NOTIFICATION_CHANNEL_F95_ID') else None
DAYS_BEFORE_PUBLICATION = int(os.getenv('DAYS_BEFORE_PUBLICATION', '14'))

# Vérifications
if not TOKEN:
    raise ValueError("❌ DISCORD_TOKEN_F95 manquant")
if not NOTIFICATION_CHANNEL_F95_ID:
    raise ValueError("❌ NOTIFICATION_CHANNEL_F95_ID manquant")
if not FORUM_SEMI_AUTO_ID and not FORUM_AUTO_ID:
    raise ValueError("❌ Au moins un forum (SEMI_AUTO ou AUTO) doit être configuré")

# Permissions
intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents)


def a_tag_maj(thread):
    """Vérifie si le thread a le tag 'MAJ'"""
    for tag in thread.applied_tags:
        if tag.name.upper() == "MAJ":
            return True
    return False


async def envoyer_notification_f95(thread):
    """Envoie une notification simple pour rappel de publication F95fr avec anti-spam"""
    if not NOTIFICATION_CHANNEL_F95_ID:
        return
    
    channel = bot.get_channel(NOTIFICATION_CHANNEL_F95_ID)
    if not channel:
        print(f"❌ Salon de notification F95 introuvable")
        return
    
    await asyncio.sleep(2)
    
    # Anti-spam : Supprimer l'ancienne notification
    messages = [msg async for msg in channel.history(limit=50)]
    for msg in messages:
        if msg.author == bot.user and str(thread.id) in msg.content:
            try:
                await msg.delete()
                print(f"🗑️ Ancienne notification F95 supprimée : {thread.name}")
            except discord.errors.NotFound:
                # Le message n'existe plus, on ignore l'erreur
                pass
            except Exception as e:
                print(f"Erreur lors de la suppression du message: {e}")
            break
    
    # Calculer timestamp Discord
    date_publication = datetime.datetime.now() + datetime.timedelta(days=DAYS_BEFORE_PUBLICATION)
    timestamp = int(date_publication.timestamp())
    
    # Récupérer nom du forum
    forum = bot.get_channel(thread.parent_id)
    nom_forum = forum.name if forum else "Forum"
    
    # Récupérer auteur
    try:
        owner = await bot.fetch_user(thread.owner_id) if thread.owner_id else None
        pseudo = owner.name if owner else "Inconnu"
    except:
        pseudo = "Inconnu"
    
    # Construction message
    message = f"**Pseudo :** {pseudo}\n"
    message += f"**{nom_forum} :**\n"
    message += f"[{thread.name}]({thread.jump_url}) <t:{timestamp}:R>"
    
    await channel.send(message)
    print(f"📅 Notification F95 envoyée : {thread.name}")


@bot.event
async def on_ready():
    print(f'🤖 Bot Serveur 2 (F95fr) prêt : {bot.user}')
    if FORUM_SEMI_AUTO_ID:
        print(f'📊 Forum Semi-Auto : {FORUM_SEMI_AUTO_ID}')
    if FORUM_AUTO_ID:
        print(f'📊 Forum Auto : {FORUM_AUTO_ID}')
    print(f'📢 Canal notifications : {NOTIFICATION_CHANNEL_F95_ID}')
    print(f'⏰ Délai avant publication : {DAYS_BEFORE_PUBLICATION} jours')


@bot.event
async def on_thread_create(thread):
    """Détecte la création d'un nouveau thread"""
    # Forum Semi-Auto
    if FORUM_SEMI_AUTO_ID and thread.parent_id == FORUM_SEMI_AUTO_ID:
        await asyncio.sleep(2)
        thread_actuel = bot.get_channel(thread.id)
        if thread_actuel and a_tag_maj(thread_actuel):
            print(f"📅 Nouveau thread F95 Semi-Auto avec tag MAJ : {thread_actuel.name}")
            await envoyer_notification_f95(thread_actuel)
        else:
            print(f"⭐️ Nouveau thread F95 Semi-Auto sans tag MAJ : {thread.name}")
    
    # Forum Auto
    elif FORUM_AUTO_ID and thread.parent_id == FORUM_AUTO_ID:
        await asyncio.sleep(2)
        thread_actuel = bot.get_channel(thread.id)
        if thread_actuel and a_tag_maj(thread_actuel):
            print(f"📅 Nouveau thread F95 Auto avec tag MAJ : {thread_actuel.name}")
            await envoyer_notification_f95(thread_actuel)
        else:
            print(f"⭐️ Nouveau thread F95 Auto sans tag MAJ : {thread.name}")


@bot.event
async def on_thread_update(before, after):
    """Détecte les modifications des tags"""
    # Forum Semi-Auto
    if FORUM_SEMI_AUTO_ID and after.parent_id == FORUM_SEMI_AUTO_ID:
        if a_tag_maj(after):
            if not a_tag_maj(before):
                print(f"✅ Tag MAJ ajouté (Semi-Auto) : {after.name}")
            await envoyer_notification_f95(after)
        else:
            print(f"⭐️ Modification tags Semi-Auto sans MAJ : {after.name}")
    
    # Forum Auto
    elif FORUM_AUTO_ID and after.parent_id == FORUM_AUTO_ID:
        if a_tag_maj(after):
            if not a_tag_maj(before):
                print(f"✅ Tag MAJ ajouté (Auto) : {after.name}")
            await envoyer_notification_f95(after)
        else:
            print(f"⭐️ Modification tags Auto sans MAJ : {after.name}")


@bot.event
async def on_message_edit(before, after):
    """Détecte les modifications du contenu"""
    if not isinstance(after.channel, discord.Thread):
        return
    
    if after.id != after.channel.id:
        return
    
    if before.content == after.content:
        return
    
    # Forum Semi-Auto
    if FORUM_SEMI_AUTO_ID and after.channel.parent_id == FORUM_SEMI_AUTO_ID:
        if a_tag_maj(after.channel):
            print(f"📝 Modification F95 Semi-Auto avec tag MAJ : {after.channel.name}")
            await envoyer_notification_f95(after.channel)
        else:
            print(f"⭐️ Modification F95 Semi-Auto sans tag MAJ : {after.channel.name}")
    
    # Forum Auto
    elif FORUM_AUTO_ID and after.channel.parent_id == FORUM_AUTO_ID:
        if a_tag_maj(after.channel):
            print(f"📝 Modification F95 Auto avec tag MAJ : {after.channel.name}")
            await envoyer_notification_f95(after.channel)
        else:
            print(f"⭐️ Modification F95 Auto sans tag MAJ : {after.channel.name}")


if __name__ == "__main__":
    print("=" * 50)
    print("Bot Discord Serveur 2 - Démarrage")
    print("=" * 50)
    bot.run(TOKEN)
