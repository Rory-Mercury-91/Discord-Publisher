import discord
from discord.ext import commands
import re
import os
import asyncio
import random
import time
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION ORIGINALE CONSERVÉE ---
TOKEN = os.getenv('DISCORD_TOKEN')
FORUM_CHANNEL_ID = int(os.getenv('FORUM_CHANNEL_ID'))
ANNOUNCE_CHANNEL_ID = int(os.getenv('ANNOUNCE_CHANNEL_ID'))
FORUM_PARTNER_ID = int(os.getenv('FORUM_PARTNER_ID')) if os.getenv('FORUM_PARTNER_ID') else None
ANNOUNCE_DELAY = 5

intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents)

pending_announcements = {}
recent_threads = {}
announcement_locks = {}

# --- LOGIQUE DE TRI ET PLANIFICATION ---

def trier_tags(tags):
    tags_formatted = []
    for tag in tags:
        emoji_visuel = (str(tag.emoji) + " ") if tag.emoji else ""
        tags_formatted.append(f"{emoji_visuel}{tag.name}")
    return sorted(tags_formatted)

async def planifier_annonce(thread, tags_actuels, source=""):
    thread_id = thread.id
    if thread_id not in announcement_locks:
        announcement_locks[thread_id] = asyncio.Lock()
    
    async with announcement_locks[thread_id]:
        if thread_id in pending_announcements:
            pending_announcements[thread_id].cancel()
            print(f"⏱️ Annulation de l'annonce précédente : {thread.name}")
        
        async def envoyer_apres_delai():
            try:
                # Ajout de Jitter pour éviter les conflits d'API entre tes bots
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

# --- GESTION DE L'HISTORIQUE (OPTIMISÉE) ---

async def nettoyer_doublons_et_verifier_historique(channel, thread_id):
    deja_publie = False
    version_jeu_precedente = None
    version_trad_precedente = None
    dernier_msg_supprime = False
    
    # On réduit la limite à 25 pour économiser les requêtes API
    messages = [msg async for msg in channel.history(limit=25)]
    if not messages: return (False, None, None, False)

    for msg in messages:
        if msg.author == bot.user and str(thread_id) in msg.content:
            if not deja_publie:
                try:
                    await msg.delete()
                    deja_publie = True
                    dernier_msg_supprime = True
                except: pass
            
            contenu = msg.content
            vj_match = re.search(r"\*\*Version du jeu\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
            vt_match = re.search(r"\*\*Version de la traduction\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
            if vj_match: version_jeu_precedente = vj_match.group(1).strip()
            if vt_match: version_trad_precedente = vt_match.group(1).strip()
            break
    
    return (deja_publie, version_jeu_precedente, version_trad_precedente, dernier_msg_supprime)

# --- FONCTION D'ENVOI (LA CORRECTION EST ICI) ---

async def envoyer_annonce(thread, liste_tags_trads):
    channel_annonce = bot.get_channel(ANNOUNCE_CHANNEL_ID)
    if not channel_annonce: return

    try:
        # CORRECTION : Utilisation du cache (starter_message) pour éviter l'erreur 429
        message = thread.starter_message
        if not message:
            # Si le thread est tout neuf, on attend 1.5s que Discord synchronise
            await asyncio.sleep(1.5)
            message = thread.starter_message or await thread.fetch_message(thread.id)
        
        contenu = message.content
    except Exception as e:
        print(f"❌ Erreur lecture message starter: {e}")
        return

    # --- TOUTE TA LOGIQUE D'EXTRACTION ORIGINALE ---
    traducteur = None
    trad_match = re.search(r"(?:\*\*\s*)?Traducteur\s*:\s*(?:\*\*\s*)?(.+?)(?:\n|$)", contenu, re.IGNORECASE)
    if trad_match:
        traducteur = trad_match.group(1).strip()
        if traducteur.lower() in ["(traducteur)", "(nom)", "", "n/a", "na", "aucun"]:
            traducteur = None

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
    
    version_jeu_match = re.search(r"\*\*Version du jeu\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
    if version_jeu_match:
        version_jeu = version_jeu_match.group(1).strip()
    else:
        version_titre_match = re.search(r"\[([^\]]+)\]", thread.name)
        version_jeu = version_titre_match.group(1).strip() if version_titre_match else "Non spécifiée"
    
    version_trad_match = re.search(r"\*\*Version traduite\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
    version_traduction = version_trad_match.group(1).strip() if version_trad_match else "Non spécifiée"
    
    deja_publie, v_jeu_p, v_trad_p, dernier_msg_supprime = await nettoyer_doublons_et_verifier_historique(channel_annonce, thread.id)
    
    v_jeu_changee = v_jeu_p and v_jeu_p != version_jeu
    v_trad_changee = v_trad_p and v_trad_p != version_traduction
    
    if deja_publie and not (v_jeu_changee or v_trad_changee) and not dernier_msg_supprime:
        print(f"⭐️ Thread déjà annoncé et à jour : {titre_jeu}")
        return
    
    # Extraction image
    image_url = None
    if message.attachments:
        image_url = message.attachments[0].url
    elif message.embeds:
        for emb in message.embeds:
            if emb.image: image_url = emb.image.url; break

    # Construction du message final
    is_update = deja_publie
    prefixe = f"🔄 **Mise à jour d'une traduction de {traducteur or 'moi'}**" if is_update else f"🎮 **Nouvelle traduction de {traducteur or 'moi'}**"
    
    msg_content = f"{prefixe}\n\n"
    msg_content += f"**Nom du jeu :** [{titre_jeu}]({thread.jump_url})\n"
    if traducteur: msg_content += f"**Traducteur :** {traducteur}\n"
    msg_content += f"**Version du jeu :** {version_jeu}\n"
    msg_content += f"**Version de la traduction :** {version_traduction}\n"
    msg_content += f"**État :** {', '.join(liste_tags_trads)}"

    if image_url:
        embed = discord.Embed(color=discord.Color.green()).set_image(url=image_url)
        await channel_annonce.send(content=msg_content, embed=embed)
    else:
        await channel_annonce.send(content=msg_content)
        
    print(f"✅ Annonce envoyée pour : {titre_jeu}")

# --- ÉVÉNEMENTS (ON_READY, ON_THREAD...) ---

@bot.event
async def on_ready():
    print(f'🤖 Bot Serveur 1 prêt : {bot.user}')

@bot.event
async def on_thread_create(thread):
    if thread.parent_id == FORUM_CHANNEL_ID or (FORUM_PARTNER_ID and thread.parent_id == FORUM_PARTNER_ID):
        recent_threads[thread.id] = time.time()
        # On attend un peu plus pour laisser le temps au message de se créer
        await asyncio.sleep(3 + random.random() * 2)
        thread_actuel = bot.get_channel(thread.id)
        if thread_actuel:
            trads = trier_tags(thread_actuel.applied_tags)
            if trads: await envoyer_annonce(thread_actuel, trads)

@bot.event
async def on_thread_update(before, after):
    if after.parent_id == FORUM_CHANNEL_ID or (FORUM_PARTNER_ID and after.parent_id == FORUM_PARTNER_ID):
        if after.id in recent_threads and (time.time() - recent_threads[after.id]) < 30:
            return
        trads_after = trier_tags(after.applied_tags)
        if trads_after and (set(trads_after) != set(trier_tags(before.applied_tags))):
            await planifier_annonce(after, trads_after, source="update")

@bot.event
async def on_message_edit(before, after):
    if isinstance(after.channel, discord.Thread) and after.id == after.channel.id:
        if before.content != after.content:
            trads = trier_tags(after.channel.applied_tags)
            if trads: await planifier_annonce(after.channel, trads, source="edit")

if __name__ == "__main__":
    # On force l'URL officielle ici pour ignorer le proxy
    from discord.http import Route
    Route.BASE = "https://discord.com/api" 
    bot.run(TOKEN)