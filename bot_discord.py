import discord
from discord.ext import commands
import re
import os
import asyncio
import datetime
from dotenv import load_dotenv

# Charger les variables d'environnement depuis le fichier .env
load_dotenv()

# --- CONFIGURATION ---
TOKEN = os.getenv('DISCORD_TOKEN')

# Discord 1 : Annonces de traductions (existant)
FORUM_CHANNEL_ID = os.getenv('FORUM_CHANNEL_ID')
ANNOUNCE_CHANNEL_ID = os.getenv('ANNOUNCE_CHANNEL_ID')
FORUM_PARTNER_ID = os.getenv('FORUM_PARTNER_ID')  # Forum "Traductions partenaires" (optionnel)

# Discord 2 : Rappels F95fr (nouveau)
FORUM_SEMI_AUTO_ID = os.getenv('FORUM_SEMI_AUTO_ID')
FORUM_AUTO_ID = os.getenv('FORUM_AUTO_ID')
NOTIFICATION_CHANNEL_F95_ID = os.getenv('NOTIFICATION_CHANNEL_F95_ID')
DAYS_BEFORE_PUBLICATION = int(os.getenv('DAYS_BEFORE_PUBLICATION', '14'))

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
FORUM_PARTNER_ID = int(FORUM_PARTNER_ID) if FORUM_PARTNER_ID else None

# Conversion pour Discord 2 (optionnel, ne génère pas d'erreur si absent)
if FORUM_SEMI_AUTO_ID:
    FORUM_SEMI_AUTO_ID = int(FORUM_SEMI_AUTO_ID)
if FORUM_AUTO_ID:
    FORUM_AUTO_ID = int(FORUM_AUTO_ID)
if NOTIFICATION_CHANNEL_F95_ID:
    NOTIFICATION_CHANNEL_F95_ID = int(NOTIFICATION_CHANNEL_F95_ID)

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

# Dictionnaire de verrous pour éviter les annonces simultanées
announcement_locks = {}

# --- OUTILS ---

async def planifier_annonce(thread, tags_actuels, source=""):
    """
    Planifie l'envoi d'une annonce après un délai.
    Si une nouvelle modification arrive, annule l'ancienne tâche et repart de zéro.
    """
    thread_id = thread.id
    
    # Créer un verrou pour ce thread s'il n'existe pas
    if thread_id not in announcement_locks:
        announcement_locks[thread_id] = asyncio.Lock()
    
    # Acquérir le verrou pour éviter les annonces simultanées
    async with announcement_locks[thread_id]:
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
                        # Vérifier qu'on n'est pas déjà en train d'envoyer
                        async with announcement_locks[thread_id]:
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

def a_tag_maj(thread):
    """Vérifie si le thread a le tag 'MAJ' (insensible à la casse)"""
    for tag in thread.applied_tags:
        if tag.name.upper() == "MAJ":
            return True
    return False

async def nettoyer_doublons_et_verifier_historique(channel, thread_id):
    """
    1. Cherche si ce jeu a déjà été annoncé (pour savoir si c'est une MAJ).
    2. Supprime le message précédent s'il est tout récent (Anti-spam modifications rapides).
    3. Extrait la version précédente pour détecter les changements de version.
    Retourne : (deja_publie, version_jeu_precedente, version_trad_precedente, dernier_msg_supprime)
    """
    deja_publie = False
    version_jeu_precedente = None
    version_trad_precedente = None
    dernier_msg_supprime = False
    
    # On scanne les 50 derniers messages du salon annonce
    messages = [msg async for msg in channel.history(limit=50)]
    
    if not messages:
        return (False, None, None, False)

    # Vérification Anti-Spam (Le tout dernier message concerne-t-il ce jeu ?)
    dernier_msg = messages[0]
    if dernier_msg.author == bot.user and str(thread_id) in dernier_msg.content:
        # Oui, c'est le même jeu, on supprime pour remplacer par la nouvelle version
        await dernier_msg.delete()
        deja_publie = True
        dernier_msg_supprime = True
        # Extraire les versions du message précédent
        contenu_precedent = dernier_msg.content
        version_jeu_match = re.search(r"\*\*Version du jeu\s*:\*\*\s*(.+?)(?:\n|$)", contenu_precedent)
        version_trad_match = re.search(r"\*\*Version de la traduction\s*:\*\*\s*(.+?)(?:\n|$)", contenu_precedent)
        if version_jeu_match:
            version_jeu_precedente = version_jeu_match.group(1).strip()
        if version_trad_match:
            version_trad_precedente = version_trad_match.group(1).strip()
    
    # Si on n'a pas trouvé dans le dernier message, on cherche dans l'historique plus vieux
    if not deja_publie:
        for msg in messages:
            if msg.author == bot.user and str(thread_id) in msg.content:
                deja_publie = True
                # Extraire les versions du message précédent
                contenu_precedent = msg.content
                version_jeu_match = re.search(r"\*\*Version du jeu\s*:\*\*\s*(.+?)(?:\n|$)", contenu_precedent)
                version_trad_match = re.search(r"\*\*Version de la traduction\s*:\*\*\s*(.+?)(?:\n|$)", contenu_precedent)
                if version_jeu_match:
                    version_jeu_precedente = version_jeu_match.group(1).strip()
                if version_trad_match:
                    version_trad_precedente = version_trad_match.group(1).strip()
                break
    
    return (deja_publie, version_jeu_precedente, version_trad_precedente, dernier_msg_supprime)

async def envoyer_annonce(thread, liste_tags_trads):
    # 1. Vérif canal
    channel_annonce = bot.get_channel(ANNOUNCE_CHANNEL_ID)
    if not channel_annonce: return

    # 2. Lire le contenu du message
    try:
        message = await thread.fetch_message(thread.id)
        contenu = message.content
    except discord.NotFound:
        return

    # 2bis. (Optionnel) Extraire le nom du traducteur depuis le post
    # Cherche par exemple : "**Traducteur :** Rory Mercury 91" ou "Traducteur : Rory Mercury 91"
    traducteur = None
    trad_match = re.search(r"(?:\*\*\s*)?Traducteur\s*:\s*(?:\*\*\s*)?(.+?)(?:\n|$)", contenu, re.IGNORECASE)
    if trad_match:
        traducteur = trad_match.group(1).strip()
        # Nettoyage léger (évite les placeholders)
        if traducteur.lower() in ["(traducteur)", "(nom)", "", "n/a", "na", "aucun"]:
            traducteur = None

    # 3. Extraction des informations avec regex
    # Titre du jeu : chercher d'abord dans le message (après "TRADUCTION FR DISPONIBLE POUR")
    titre_jeu = thread.name  # Par défaut, utiliser le nom du thread
    
    # Chercher le titre dans le message : "TRADUCTION FR DISPONIBLE POUR : **TITRE**"
    titre_match_message = re.search(r"TRADUCTION FR DISPONIBLE POUR\s*:\s*\*\*(.+?)\*\*", contenu, re.IGNORECASE)
    if titre_match_message:
        titre_jeu = titre_match_message.group(1).strip()
    else:
        # Sinon, chercher dans "Titre du jeu :"
        titre_match = re.search(r"\*\*Titre du jeu\s*:\*\*\s*(.+?)(?:\n|$)", contenu)
        if titre_match:
            titre_extrait = titre_match.group(1).strip()
            # Si c'est juste "(Titre du jeu)" comme placeholder, utiliser le nom du thread
            if titre_extrait.lower() in ["(titre du jeu)", "(titre)", ""]:
                titre_jeu = thread.name
            else:
                titre_jeu = titre_extrait
    
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
    
    # 4. On détermine si c'est une UPDATE ou une NOUVELLE TRADUCTION
    # Et on vérifie si la version a changé
    deja_publie, version_jeu_precedente, version_trad_precedente, dernier_msg_supprime = await nettoyer_doublons_et_verifier_historique(channel_annonce, thread.id)
    
    # Vérifier si la version a changé (seulement si on a une version précédente)
    version_jeu_changee = False
    version_trad_changee = False
    if version_jeu_precedente:
        version_jeu_changee = version_jeu_precedente != version_jeu
    if version_trad_precedente:
        version_trad_changee = version_trad_precedente != version_traduction
    
    version_changee = version_jeu_changee or version_trad_changee
    
    # Logique d'envoi :
    # - Si le dernier message a été supprimé (anti-spam), on envoie toujours
    # - Si la version a changé, on envoie toujours (mise à jour)
    # - Si déjà publié avec la même version et message ancien, on n'envoie pas (évite les doublons)
    is_update = deja_publie
    
    if dernier_msg_supprime:
        # Le dernier message a été supprimé (anti-spam), on envoie toujours
        is_update = True
        if version_changee:
            print(f"🔄 Changement de version détecté pour {titre_jeu} : {version_jeu_precedente} → {version_jeu} (jeu) / {version_trad_precedente} → {version_traduction} (trad)")
        else:
            print(f"🔄 Modification détectée pour {titre_jeu} (même version)")
    elif version_changee:
        # La version a changé, on envoie toujours (mise à jour)
        is_update = True
        # Supprimer l'ancien message si présent
        messages = [msg async for msg in channel_annonce.history(limit=50)]
        for msg in messages:
            if msg.author == bot.user and str(thread.id) in msg.content:
                await msg.delete()
                print(f"🗑️ Ancienne annonce supprimée (changement de version) : {thread.name}")
                break
        print(f"🔄 Changement de version détecté pour {titre_jeu} : {version_jeu_precedente} → {version_jeu} (jeu) / {version_trad_precedente} → {version_traduction} (trad)")
    elif deja_publie and not version_changee:
        # Déjà publié avec la même version et message ancien, on n'envoie pas (évite les doublons)
        print(f"⏭️ Thread déjà annoncé avec la même version, notification ignorée : {titre_jeu}")
        return
    
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
    if traducteur:
        prefixe = "🔄 **Mise à jour d'une traduction de " + traducteur + "**" if is_update else "🎮 **Publication d'une nouvelle traduction de " + traducteur + "**"
    else:
        prefixe = "🔄 **Mise à jour d'une de mes traduction**" if is_update else "🎮 **Publication d'une de mes nouvelle traduction**"
    
    msg_content = f"{prefixe}\n\n"
    msg_content += f"**Nom du jeu :** [{titre_jeu}]({thread.jump_url})\n"
    if traducteur:
        msg_content += f"**Traducteur :** {traducteur}\n"
    msg_content += f"**Version du jeu :** {version_jeu}\n"
    msg_content += f"**Version de la traduction :** {version_traduction}\n"
    msg_content += f"**État :** {etat_txt}"

    # 8. Envoi du message
    if image_url:
        embed = discord.Embed(color=discord.Color.green())
        embed.set_image(url=image_url)
        await channel_annonce.send(content=msg_content, embed=embed)
    else:
        await channel_annonce.send(content=msg_content)
        
    print(f"Annonce envoyée ({prefixe}) : {titre_jeu}")

# ✨ NOUVELLE FONCTION : Notification pour F95fr
async def envoyer_notification_f95(thread):
    """Envoie une notification simple pour rappel de publication F95fr avec anti-spam"""
    if not NOTIFICATION_CHANNEL_F95_ID:
        return  # Pas configuré, on ne fait rien
    
    channel = bot.get_channel(NOTIFICATION_CHANNEL_F95_ID)
    if not channel:
        print(f"❌ Salon de notification F95 introuvable")
        return
    
    # Attendre que le thread soit complètement créé
    await asyncio.sleep(2)
    
    # Anti-spam : Supprimer l'ancienne notification si elle existe
    messages = [msg async for msg in channel.history(limit=50)]
    for msg in messages:
        if msg.author == bot.user and str(thread.id) in msg.content:
            # Trouvé une ancienne notification pour ce thread, on la supprime
            await msg.delete()
            print(f"🗑️ Ancienne notification F95 supprimée pour : {thread.name}")
            break
    
    # Calculer le timestamp Discord pour la date de publication
    date_publication = datetime.datetime.now() + datetime.timedelta(days=DAYS_BEFORE_PUBLICATION)
    timestamp = int(date_publication.timestamp())
    
    # Récupérer le nom du forum parent
    forum = bot.get_channel(thread.parent_id)
    nom_forum = forum.name if forum else "Forum"
    
    # Récupérer l'auteur du thread
    try:
        owner = await bot.fetch_user(thread.owner_id) if thread.owner_id else None
        pseudo = owner.name if owner else "Inconnu"
    except:
        pseudo = "Inconnu"
    
    # Construction du message simple (on ajoute l'ID du thread pour l'anti-spam)
    message = f"**Pseudo :** {pseudo}\n"
    message += f"**{nom_forum} :**\n"
    message += f"[{thread.name}]({thread.jump_url}) <t:{timestamp}:R>"
    
    await channel.send(message)
    print(f"📅 Notification F95 envoyée : {thread.name}")


# --- ÉVÉNEMENTS ---

@bot.event
async def on_ready():
    print(f'Bot prêt : {bot.user}')
    print(f'📊 Discord 1 - Forum surveillé : {FORUM_CHANNEL_ID}')
    if FORUM_PARTNER_ID:
        print(f'📊 Discord 1 - Forum partenaires surveillé : {FORUM_PARTNER_ID}')
    if FORUM_SEMI_AUTO_ID:
        print(f'📊 Discord 2 - Forum Semi-Auto surveillé : {FORUM_SEMI_AUTO_ID}')
    if FORUM_AUTO_ID:
        print(f'📊 Discord 2 - Forum Auto surveillé : {FORUM_AUTO_ID}')

@bot.event
async def on_thread_create(thread):
    """Détecte la création d'un nouveau thread"""
    
    # Discord 1 : Annonces de traductions (existant)
    if thread.parent_id == FORUM_CHANNEL_ID or (FORUM_PARTNER_ID and thread.parent_id == FORUM_PARTNER_ID):
        # Marquer ce thread comme récemment créé (pour éviter COMPLÈTEMENT les autres événements)
        import time
        recent_threads[thread.id] = time.time()
        
        # Attendre 2 secondes pour que Discord finisse de créer le thread avec tous ses tags
        await asyncio.sleep(2)
        
        # Récupérer le thread à jour avec tous ses tags
        thread_actuel = bot.get_channel(thread.id)
        if not thread_actuel:
            print(f"❌ Thread introuvable : {thread.id}")
            return
        
        trads = trier_tags(thread_actuel.applied_tags)
        # On envoie l'annonce seulement si des tags sont présents
        if len(trads) > 0:
            print(f"🆕 Nouveau thread créé : {thread_actuel.name} avec tags : {trads}")
            # Envoyer directement sans délai pour les nouveaux threads
            await envoyer_annonce(thread_actuel, trads)
        else:
            print(f"⏭️ Nouveau thread sans tags : {thread_actuel.name}")
    
    # Discord 2 : Rappels F95fr (nouveau) - Forum Semi-Auto
    elif FORUM_SEMI_AUTO_ID and thread.parent_id == FORUM_SEMI_AUTO_ID:
        # Attendre que le thread soit complètement créé avec tous ses tags
        await asyncio.sleep(2)
        thread_actuel = bot.get_channel(thread.id)
        if thread_actuel and a_tag_maj(thread_actuel):
            print(f"📅 Nouveau thread F95 Semi-Auto détecté avec tag MAJ : {thread_actuel.name}")
            await envoyer_notification_f95(thread_actuel)
        else:
            print(f"⏭️ Nouveau thread F95 Semi-Auto sans tag MAJ : {thread.name}")
    
    # Discord 2 : Rappels F95fr (nouveau) - Forum Auto
    elif FORUM_AUTO_ID and thread.parent_id == FORUM_AUTO_ID:
        # Attendre que le thread soit complètement créé avec tous ses tags
        await asyncio.sleep(2)
        thread_actuel = bot.get_channel(thread.id)
        if thread_actuel and a_tag_maj(thread_actuel):
            print(f"📅 Nouveau thread F95 Auto détecté avec tag MAJ : {thread_actuel.name}")
            await envoyer_notification_f95(thread_actuel)
        else:
            print(f"⏭️ Nouveau thread F95 Auto sans tag MAJ : {thread.name}")

@bot.event
async def on_thread_update(before, after):
    """Détecte les modifications des tags d'un thread"""
    
    # Discord 1 : Annonces de traductions
    if after.parent_id == FORUM_CHANNEL_ID:
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
    
    # Discord 2 : Rappels F95fr - Forum Semi-Auto
    elif FORUM_SEMI_AUTO_ID and after.parent_id == FORUM_SEMI_AUTO_ID:
        # Vérifier si le tag MAJ a été ajouté ou si le thread a maintenant le tag MAJ
        if a_tag_maj(after):
            # Vérifier si le tag MAJ vient d'être ajouté (n'était pas présent avant)
            if not a_tag_maj(before):
                print(f"✅ Tag MAJ ajouté sur thread F95 Semi-Auto : {after.name}")
            await envoyer_notification_f95(after)
        else:
            print(f"⏭️ Modification tags F95 Semi-Auto sans tag MAJ : {after.name}")
    
    # Discord 2 : Rappels F95fr - Forum Auto
    elif FORUM_AUTO_ID and after.parent_id == FORUM_AUTO_ID:
        # Vérifier si le tag MAJ a été ajouté ou si le thread a maintenant le tag MAJ
        if a_tag_maj(after):
            # Vérifier si le tag MAJ vient d'être ajouté (n'était pas présent avant)
            if not a_tag_maj(before):
                print(f"✅ Tag MAJ ajouté sur thread F95 Auto : {after.name}")
            await envoyer_notification_f95(after)
        else:
            print(f"⏭️ Modification tags F95 Auto sans tag MAJ : {after.name}")

@bot.event
async def on_message_edit(before, after):
    """Détecte les modifications du contenu du premier message d'un thread"""
    # Vérifier si c'est un message dans un thread du forum
    if not isinstance(after.channel, discord.Thread):
        return
    
    # Vérifier si c'est le premier message du thread (ID du message = ID du thread)
    if after.id != after.channel.id:
        return
    
    # Vérifier si le contenu a vraiment changé
    if before.content == after.content:
        return
    
    # Discord 1 : Annonces de traductions
    if after.channel.parent_id == FORUM_CHANNEL_ID:
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
    
    # Discord 2 : Rappels F95fr - Forum Semi-Auto
    elif FORUM_SEMI_AUTO_ID and after.channel.parent_id == FORUM_SEMI_AUTO_ID:
        if a_tag_maj(after.channel):
            print(f"📝 Modification F95 Semi-Auto détectée avec tag MAJ : {after.channel.name}")
            await envoyer_notification_f95(after.channel)
        else:
            print(f"⏭️ Modification F95 Semi-Auto sans tag MAJ : {after.channel.name}")
    
    # Discord 2 : Rappels F95fr - Forum Auto
    elif FORUM_AUTO_ID and after.channel.parent_id == FORUM_AUTO_ID:
        if a_tag_maj(after.channel):
            print(f"📝 Modification F95 Auto détectée avec tag MAJ : {after.channel.name}")
            await envoyer_notification_f95(after.channel)
        else:
            print(f"⏭️ Modification F95 Auto sans tag MAJ : {after.channel.name}")

bot.run(TOKEN)
