"""
Bot Discord - Serveur 2 : Rappels F95fr
Gère les notifications de rappel pour les publications F95fr
"""
import discord
from discord.ext import commands
import os
import asyncio
import datetime
import random
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION SERVEUR 2 CONSERVÉE ---
TOKEN = os.getenv('DISCORD_TOKEN_F95')
FORUM_SEMI_AUTO_ID = int(os.getenv('FORUM_SEMI_AUTO_ID')) if os.getenv('FORUM_SEMI_AUTO_ID') else None
FORUM_AUTO_ID = int(os.getenv('FORUM_AUTO_ID')) if os.getenv('FORUM_AUTO_ID') else None
NOTIFICATION_CHANNEL_F95_ID = int(os.getenv('NOTIFICATION_CHANNEL_F95_ID')) if os.getenv('NOTIFICATION_CHANNEL_F95_ID') else None
DAYS_BEFORE_PUBLICATION = int(os.getenv('DAYS_BEFORE_PUBLICATION', '14'))

intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents)

# --- LOGIQUE DE DÉTECTION ---

def a_tag_maj(thread):
    """Vérifie si le tag 'Mise à jour' ou 'MAJ' est présent"""
    for tag in thread.applied_tags:
        if "mise à jour" in tag.name.lower() or "maj" in tag.name.lower():
            return True
    return False

# --- ENVOI DE NOTIFICATION (OPTIMISÉ ANTI-429) ---

async def envoyer_notification_f95(thread):
    """Envoie un rappel pour la publication F95fr"""
    channel_notif = bot.get_channel(NOTIFICATION_CHANNEL_F95_ID)
    if not channel_notif:
        print("❌ Canal de notification F95 non trouvé")
        return

    try:
        # Ajout d'un petit jitter pour ne pas percuter l'autre bot
        await asyncio.sleep(random.random() * 3)

        # Utilisation du cache starter_message
        message = thread.starter_message
        if not message:
            await asyncio.sleep(1.5)
            message = thread.starter_message or await thread.fetch_message(thread.id)
            
        # Calcul de la date (Ta logique originale)
        date_creation = thread.created_at
        date_publication = date_creation + datetime.timedelta(days=DAYS_BEFORE_PUBLICATION)
        timestamp_discord = int(date_publication.timestamp())

        msg_content = (
            f"🔔 **Rappel Publication F95fr**\n"
            f"Le thread **{thread.name}** a été mis à jour.\n"
            f"📅 À publier le : <t:{timestamp_discord}:D> (<t:{timestamp_discord}:R>)\n"
            f"🔗 Lien : {thread.jump_url}"
        )

        await channel_notif.send(content=msg_content)
        print(f"✅ Notification F95 envoyée pour : {thread.name}")
        
    except Exception as e:
        print(f"❌ Erreur notification F95 : {e}")

# --- ÉVÉNEMENTS ---

@bot.event
async def on_ready():
    print(f'🤖 Bot Serveur 2 prêt : {bot.user}')

@bot.event
async def on_thread_create(thread):
    # On attend un peu que les tags soient bien appliqués par l'utilisateur/système
    if thread.parent_id in [FORUM_SEMI_AUTO_ID, FORUM_AUTO_ID]:
        await asyncio.sleep(5 + random.random() * 2)
        thread_actuel = bot.get_channel(thread.id)
        if thread_actuel and a_tag_maj(thread_actuel):
            await envoyer_notification_f95(thread_actuel)

@bot.event
async def on_thread_update(before, after):
    if after.parent_id in [FORUM_SEMI_AUTO_ID, FORUM_AUTO_ID]:
        # Si le tag MAJ vient d'être ajouté
        if a_tag_maj(after) and not a_tag_maj(before):
            print(f"✅ Tag MAJ détecté sur : {after.name}")
            await envoyer_notification_f95(after)

@bot.event
async def on_message_edit(before, after):
    """Détecte les modifs sur le premier message du thread"""
    if not isinstance(after.channel, discord.Thread):
        return
    
    if after.id == after.channel.id: # C'est le message de départ
        if before.content != after.content:
            if after.channel.parent_id in [FORUM_SEMI_AUTO_ID, FORUM_AUTO_ID]:
                if a_tag_maj(after.channel):
                    await envoyer_notification_f95(after.channel)

if __name__ == "__main__":
    # On force l'URL officielle ici pour ignorer le proxy
    from discord.http import Route
    Route.BASE = "https://discord.com/api"
    bot.run(TOKEN)