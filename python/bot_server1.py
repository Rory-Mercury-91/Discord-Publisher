import discord
from discord.ext import commands
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
    # Valeurs par défaut
    infos = {
        'titre_jeu': message.channel.name if hasattr(message, 'channel') else 'Jeu inconnu',
        'traducteur': None,
        'version_jeu': 'Non spécifiée',
        'version_trad': 'Non spécifiée',
        'translation_type': 'Non spécifié',
        'is_integrated': False
    }
    
    # ✅ PRIORITÉ 1 : Métadonnées structurées
    if metadata:
        infos['titre_jeu'] = metadata.get('game_name', infos['titre_jeu'])
        infos['traducteur'] = metadata.get('traductor') or None
        infos['version_jeu'] = metadata.get('game_version', infos['version_jeu'])
        infos['version_trad'] = metadata.get('translate_version', infos['version_trad'])
        infos['translation_type'] = metadata.get('translation_type', infos['translation_type'])
        infos['is_integrated'] = metadata.get('is_integrated', False)
        
        print(f"📊 Données extraites depuis métadonnées: {infos['titre_jeu']}")
        return infos
    
    # ✅ PRIORITÉ 2 : Parsing Regex (fallback pour les anciens posts)
    contenu = message.content
    
    # Traducteur
    trad_match = re.search(r"(?:\*\*\s*)?Traducteur\s*:\s*(?:\*\*\s*)?(.+?)(?:\n|$)", contenu, re.IGNORECASE)
    if trad_match:
        traducteur = trad_match.group(1).strip()
        if traducteur.lower() not in ["(traducteur)", "(nom)", "", "n/a", "na", "aucun"]:
            infos['traducteur'] = traducteur
    
    # Titre du jeu
    titre_match_message = re.search(r"TRADUCTION FR DISPONIBLE POUR\s*:\s*\*\*(.+?)\*\*", contenu, re.IGNORECASE)
    if titre_match_message:
        infos['titre_jeu'] = titre_match_message.group(1).strip()
    else:
        titre_match = re.search(r"\*\*Titre du jeu\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
        if titre_match:
            titre_extrait = titre_match.group(1).strip()
            if titre_extrait.lower() not in ["(titre du jeu)", "(titre)", ""]:
                infos['titre_jeu'] = titre_extrait
    
    # Version du jeu
    version_jeu_match = re.search(r"\*\*Version du jeu\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
    if version_jeu_match:
        infos['version_jeu'] = version_jeu_match.group(1).strip()
    else:
        version_titre_match = re.search(r"\[([^\]]+)\]", message.channel.name)
        if version_titre_match:
            infos['version_jeu'] = version_titre_match.group(1).strip()
    
    # Version de la traduction
    version_trad_match = re.search(r"\*\*Version traduite\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
    if version_trad_match:
        infos['version_trad'] = version_trad_match.group(1).strip()
    
    # Détecter si traduction intégrée (mot-clé dans le contenu)
    if re.search(r"int[ée]gr[ée]e", contenu, re.IGNORECASE):
        infos['is_integrated'] = True
    
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


# ✅ FONCTION MODIFIÉE : Utilisation des métadonnées structurées
async def envoyer_annonce(thread, liste_tags_trads):
    """Envoie l'annonce dans le canal ANNOUNCE_CHANNEL_ID"""
    channel_annonce = bot.get_channel(ANNOUNCE_CHANNEL_ID)
    if not channel_annonce:
        return

    try:
        # Récupération du message de départ
        message = thread.starter_message
        if not message:
            await asyncio.sleep(1.5)
            message = thread.starter_message or await thread.fetch_message(thread.id)
        
        # ✅ NOUVEAU : Extraire les métadonnées de l'embed
        metadata = extraire_metadata_embed(message)
        
        # ✅ Extraction des informations (priorité aux métadonnées)
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

    # Envoi du message
    if image_url:
        embed = discord.Embed(color=discord.Color.green()).set_image(url=image_url)
        await channel_annonce.send(content=msg_content, embed=embed)
    else:
        await channel_annonce.send(content=msg_content)
        
    print(f"✅ Annonce envoyée pour : {titre_jeu}")


# --- ÉVÉNEMENTS (inchangés) ---

@bot.event
async def on_ready():
    print(f'🤖 Bot Serveur 1 prêt : {bot.user}')

@bot.event
async def on_thread_create(thread):
    if thread.parent_id == FORUM_CHANNEL_ID or (FORUM_PARTNER_ID and thread.parent_id == FORUM_PARTNER_ID):
        recent_threads[thread.id] = time.time()
        await asyncio.sleep(3 + random.random() * 2)
        thread_actuel = bot.get_channel(thread.id)
        if thread_actuel:
            trads = trier_tags(thread_actuel.applied_tags)
            if trads:
                await envoyer_annonce(thread_actuel, trads)

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
            if trads:
                await planifier_annonce(after.channel, trads, source="edit")

if __name__ == "__main__":
    from discord.http import Route
    Route.BASE = "https://discord.com/api" 
    bot.run(TOKEN)
