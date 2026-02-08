"""
🐝 Bot Discord - Serveur FRELON (Rappel publication F95)
Envoie des rappels de publication F95fr quand un thread est créé ou tagué "MAJ".
"""
import logging
import discord
import os
import asyncio
import datetime
import random
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger("frelon")

# Charger .env : _ignored/ prioritaire, puis racine python/
_python_dir = Path(__file__).resolve().parent.parent
load_dotenv(_python_dir / "_ignored" / ".env")
load_dotenv(_python_dir / ".env")

# ==================== CONFIGURATION ====================
TOKEN = os.getenv('FRELON_DISCORD_TOKEN')
FRELON_SEMI_AUTO_ID = int(os.getenv('FRELON_SEMI_AUTO_ID')) if os.getenv('FRELON_SEMI_AUTO_ID') else None
FRELON_AUTO_ID = int(os.getenv('FRELON_AUTO_ID')) if os.getenv('FRELON_AUTO_ID') else None
FRELON_NOTIFICATION_CHANNEL_ID = int(os.getenv('FRELON_NOTIFICATION_CHANNEL_ID')) if os.getenv('FRELON_NOTIFICATION_CHANNEL_ID') else None
DAYS_BEFORE_PUBLICATION = int(os.getenv('DAYS_BEFORE_PUBLICATION', '14'))

logger.info("Configuration chargée: FRELON_SEMI_AUTO_ID=%s, FRELON_AUTO_ID=%s, FRELON_NOTIFICATION_CHANNEL_ID=%s, DAYS_BEFORE_PUBLICATION=%s",
            FRELON_SEMI_AUTO_ID, FRELON_AUTO_ID, FRELON_NOTIFICATION_CHANNEL_ID, DAYS_BEFORE_PUBLICATION)

intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True

bot = discord.Client(intents=intents)


# ==================== NOTIFICATION F95FR ====================

def a_tag_maj(thread) -> bool:
    for tag in thread.applied_tags:
        if "mise à jour" in tag.name.lower() or "maj" in tag.name.lower():
            return True
    return False


async def envoyer_notification_f95(thread, is_update: bool = False):
    channel_notif = bot.get_channel(FRELON_NOTIFICATION_CHANNEL_ID)
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
        logger.info("✅ Notification F95fr: %s", thread.name)

    except Exception as e:
        logger.error("❌ Erreur notification: %s", e)


# ==================== ÉVÉNEMENTS ====================

@bot.event
async def on_ready():
    logger.info("🤖 Bot prêt: %s", bot.user)


@bot.event
async def on_thread_create(thread):
    logger.info("📝 Nouveau thread créé: %s (ID: %s, Parent: %s)", thread.name, thread.id, thread.parent_id)
    if thread.parent_id in [FRELON_SEMI_AUTO_ID, FRELON_AUTO_ID]:
        logger.info("✅ Thread dans un forum surveillé, envoi notification dans 5s...")
        await asyncio.sleep(5)
        thread_actuel = bot.get_channel(thread.id)
        if thread_actuel:
            is_maj = a_tag_maj(thread_actuel)
            logger.info("Envoi notification F95 (is_update=%s)", is_maj)
            await envoyer_notification_f95(thread_actuel, is_update=is_maj)
        else:
            logger.warning("⚠️ Thread introuvable après fetch")
    else:
        logger.info("Thread hors forums surveillés, ignoré")


@bot.event
async def on_thread_update(before, after):
    logger.info("🔄 Thread mis à jour: %s (ID: %s)", after.name, after.id)
    if after.parent_id in [FRELON_SEMI_AUTO_ID, FRELON_AUTO_ID]:
        has_maj_before = a_tag_maj(before)
        has_maj_after = a_tag_maj(after)
        logger.info("Tag MAJ: avant=%s, après=%s", has_maj_before, has_maj_after)
        if has_maj_after and not has_maj_before:
            logger.info("✅ Tag MAJ ajouté, envoi notification F95...")
            await envoyer_notification_f95(after, is_update=True)
        else:
            logger.info("Pas de changement de tag MAJ pertinent")
    else:
        logger.info("Thread hors forums surveillés, ignoré")


@bot.event
async def on_message_edit(before, after):
    if not isinstance(after.channel, discord.Thread):
        return

    if after.id == after.channel.id:  # Message de démarrage du thread
        logger.info("✏️ Message de thread édité: %s (ID: %s)", after.channel.name, after.id)
        if before.content != after.content:
            logger.info("Contenu modifié")
            if after.channel.parent_id in [FRELON_SEMI_AUTO_ID, FRELON_AUTO_ID]:
                if a_tag_maj(after.channel):
                    logger.info("✅ Thread avec tag MAJ, envoi notification F95...")
                    await envoyer_notification_f95(after.channel, is_update=True)
                else:
                    logger.info("Pas de tag MAJ, pas de notification")
            else:
                logger.info("Thread hors forums surveillés, ignoré")
        else:
            logger.info("Contenu identique, aucune action")


# ==================== LANCEMENT ====================

if __name__ == "__main__":
    bot.run(TOKEN)
