# Bot Discord - Annonces de Traductions

Bot Discord qui surveille des salons de type **Forum** et envoie automatiquement des notifications dans des canaux dédiés.

## 🚀 Deux fonctionnalités distinctes

### 1️⃣ Discord Principal : Annonces de traductions complètes
**Objectif :** Annoncer les nouvelles traductions et mises à jour avec tous les détails

**Fonctionnement :**
- Détecte les nouveaux threads dans le forum avec tags
- Détecte les modifications du contenu
- Envoie une annonce complète avec :
  - Titre du jeu (cliquable)
  - Version du jeu et de la traduction
  - État (Terminé, En cours)
  - Image du jeu
- Distinction "Nouvelle traduction" vs "Mise à jour"
- Anti-spam : supprime les doublons récents

**Exemple de notification :**
```
🎮 Publication d'une nouvelle traduction

Nom du jeu : [Step Bi Step](lien)
Version du jeu : v1.0 SE
Version de la traduction : v1.0 SE
État : ✅ Terminé

[Image du jeu]
```

### 2️⃣ Discord F95fr : Rappels de publication
**Objectif :** Notifier qu'une traduction doit être ajoutée sur F95fr dans 14 jours

**Fonctionnement :**
- Surveille 2 forums (Traduction Semi-Auto et Traduction Auto)
- Envoie une notification lors de la création d'un thread
- **Envoie une notification lors de la modification du premier post**
- Format simple avec timestamp Discord dynamique
- Le compte à rebours se met à jour automatiquement
- **Anti-spam :** Supprime l'ancienne notification lors d'une modification

**Exemple de notification :**
```
Pseudo : A7up Red
Traduction Semi-Auto :
King's Revolt v0.1.1 dans 14 jours
```

Le timestamp Discord affiche automatiquement le temps restant : "dans 14 jours" → "dans 7 jours" → "dans 1 jour" → "il y a 1 jour"

**Note :** Si le premier post est modifié, l'ancienne notification est supprimée et une nouvelle est envoyée (évite les doublons).

## 📦 Installation locale

1. Clone le repo
2. Installe les dépendances :
```bash
pip install -r requirements.txt
```

3. Crée un fichier `.env` à la racine du projet :
```env
# Token du bot Discord
DISCORD_TOKEN=ton_token_discord

# Discord Principal : Annonces complètes
FORUM_CHANNEL_ID=id_du_forum_traductions
ANNOUNCE_CHANNEL_ID=id_salon_annonces

# Discord F95fr : Rappels de publication (optionnel)
FORUM_SEMI_AUTO_ID=id_forum_semi_auto
FORUM_AUTO_ID=id_forum_auto
NOTIFICATION_CHANNEL_F95_ID=id_salon_rappels
DAYS_BEFORE_PUBLICATION=14
```

4. Lance le bot :
```bash
python bot_discord.py
```

## 🌐 Déploiement sur Railway.app

### 💰 Coûts Railway
Railway offre un plan gratuit avec :
- **Essai gratuit** : 30 jours avec **5$ de crédits**
- **Après l'essai** : **1$ par mois** de crédits inclus
- Limites : jusqu'à 0.5 GB RAM, 1 vCPU par service, 0.5 GB de stockage

Ce bot consomme très peu de ressources, le plan gratuit est donc largement suffisant ! 🎉

### Étape 1 : Préparer ton repo GitHub
1. Crée un nouveau repo GitHub (ou utilise un repo existant)
2. Upload tous les fichiers de ce projet **SAUF le fichier `.env`**
   - ⚠️ **IMPORTANT** : Ne jamais commit le fichier `.env` (il contient ton token Discord secret)
   - Les fichiers nécessaires : `bot_discord.py`, `requirements.txt`, `Procfile`, `README.md`

### Étape 2 : Configurer Railway
1. Va sur [railway.app](https://railway.app) et connecte-toi avec GitHub
2. Clique sur "New Project" → "Deploy from GitHub repo"
3. Sélectionne ton repo GitHub
4. Dans l'onglet "Variables", ajoute les variables d'environnement :

**Obligatoires (Discord Principal) :**
- `DISCORD_TOKEN` = ton token Discord
- `FORUM_CHANNEL_ID` = ID du forum à surveiller
- `ANNOUNCE_CHANNEL_ID` = ID du salon d'annonces

**Optionnelles (Discord F95fr) :**
- `FORUM_SEMI_AUTO_ID` = 1330273160456568955
- `FORUM_AUTO_ID` = 1331302157844221984
- `NOTIFICATION_CHANNEL_F95_ID` = 1376218427890339861
- `DAYS_BEFORE_PUBLICATION` = 14

5. Railway va automatiquement détecter le `Procfile` et déployer ton bot ! 🚀

### Étape 3 : Vérifier que ça marche
- Va dans l'onglet "Logs" de ton projet Railway
- Tu devrais voir : "Bot prêt : [nom de ton bot]"
- Le bot devrait maintenant surveiller le forum et envoyer des annonces automatiquement

## ⚙️ Configuration

### Variables d'environnement

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `DISCORD_TOKEN` | ✅ Oui | Token du bot Discord |
| `FORUM_CHANNEL_ID` | ✅ Oui | Forum Discord Principal (annonces complètes) |
| `ANNOUNCE_CHANNEL_ID` | ✅ Oui | Salon pour les annonces complètes |
| `FORUM_SEMI_AUTO_ID` | ⚠️ Optionnel | Forum Semi-Auto (rappels F95fr) |
| `FORUM_AUTO_ID` | ⚠️ Optionnel | Forum Auto (rappels F95fr) |
| `NOTIFICATION_CHANNEL_F95_ID` | ⚠️ Optionnel | Salon pour les rappels F95fr |
| `DAYS_BEFORE_PUBLICATION` | ⚠️ Optionnel | Délai avant publication (défaut: 14) |

**Comment obtenir les IDs :**
1. Active le "Mode développeur" dans Discord (Paramètres → Avancés → Mode développeur)
2. Clic droit sur le salon/forum → "Copier l'identifiant"

### Inviter le bot sur plusieurs Discord

**Important :** Le bot doit être présent sur les deux serveurs Discord pour fonctionner.

1. [Discord Developer Portal](https://discord.com/developers/applications) → Ton bot
2. OAuth2 → URL Generator
3. Cocher : `bot`
4. Permissions : `View Channels`, `Send Messages`, `Read Message History`, `Manage Messages`
5. Copier l'URL et inviter sur chaque serveur Discord

## 📋 Format attendu des posts

### Titre du thread
Format recommandé : `Nom du jeu [Version] [Auteur]`
Exemple : `Step Bi Step [v1.0 SE] [Dumb Koala Games]`

### Contenu du post
Le bot extrait automatiquement les informations des posts qui suivent ce format :

```
### :computer: Infos du Jeu & Liens de Téléchargement :
* **Titre du jeu :** [Nom du jeu]
* **Version du jeu :** [Version] (optionnel, sinon extrait du titre)
* **Version traduite :** [Version de la traduction]
* **Lien du jeu (VO) :** [Lien vers le jeu]
* **Lien de la Traduction 1 :** [Lien]
* **Lien de la Traduction 2 (Backup) :** [Lien]
```

Le bot génère alors une annonce avec :
- Nom du jeu (titre du thread, cliquable vers le thread)
- Version du jeu (extraite du titre ou du contenu)
- Version de la traduction
- État (basé sur les tags : Terminé, En cours)
- Image du post (si présente)

### Déclenchement des annonces

Le bot envoie une annonce dans les cas suivants :
- ✅ Lors de la création d'un nouveau thread **avec des tags**
- ✅ Lors de l'**ajout** d'un tag (pas lors du retrait)
- ✅ Lors de la modification du contenu du premier message du thread

**Important** : Le bot attend **5 secondes** après une modification avant d'envoyer l'annonce. Si vous faites plusieurs modifications rapidement, une seule annonce sera envoyée avec l'état final.

## 🚀 Déploiement rapide

### 1. Push le code
```bash
git add .
git commit -m "Configuration bot Discord"
git push
```

### 2. Variables Railway
Sur Railway, ajouter les variables obligatoires + optionnelles si besoin.

### 3. Inviter le bot
Inviter le bot sur les deux serveurs Discord (Principal + F95fr).

### 4. Tester
- **Discord Principal :** Créer un thread avec tags → Annonce complète
- **Discord F95fr :** Créer un thread → Notification simple avec compte à rebours

### 📝 Comment poster correctement une traduction

#### 1️⃣ **Créer le thread**
- **Titre** : `Nom du jeu [Version] [Auteur]`
  - Exemple : `Step Bi Step [v1.0 SE] [Dumb Koala Games]`

#### 2️⃣ **Rédiger le contenu**
Utilisez ce format dans le premier message :

```
### :computer: Infos du Jeu & Liens de Téléchargement :
* **Titre du jeu :** Step Bi Step
* **Version du jeu :** v1.0 SE (optionnel si déjà dans le titre)
* **Version traduite :** v1.0 SE (la dernière version stable)
* **Lien du jeu (VO) :** [Accès au jeu original](https://example.com)
* **Lien de la Traduction 1 :** [LewdCorner](https://example.com)
* **Lien de la Traduction 2 (Backup) :** [Proton Drive](https://example.com)
```

#### 3️⃣ **Ajouter une image**
Joignez une image du jeu (bannière, logo, etc.)

#### 4️⃣ **Ajouter le tag "En cours"**
Dès que vous ajoutez ce tag, le bot enverra une annonce après 5 secondes.

#### 5️⃣ **Mettre à jour la traduction**
- Modifiez le contenu (version traduite, liens, etc.)
- Le bot détecte automatiquement et envoie une mise à jour après 5 secondes

#### 6️⃣ **Marquer comme terminé**
Quand la traduction est complète :
1. Retirez le tag "En cours" (pas d'annonce)
2. Ajoutez le tag "Terminé" (annonce envoyée après 5 secondes)

**Astuce** : Vous pouvez faire toutes vos modifications (contenu + tags) en 5 secondes, et le bot n'enverra qu'une seule annonce avec l'état final ! 🎯

### ⚙️ Logique des annonces

| Situation | Tag avant | Tag après | Annonce ? |
|-----------|-----------|-----------|-----------|
| Nouveau thread | Aucun | En cours | ✅ Oui |
| Modification contenu | En cours | En cours | ✅ Oui |
| Retrait tag | En cours | Aucun | ❌ Non |
| Ajout tag | Aucun | Terminé | ✅ Oui |
| Changement tag | En cours | Terminé | ✅ Oui |
| Modification contenu | Terminé | Terminé | ✅ Oui |

## 🔒 Sécurité

⚠️ **IMPORTANT** : Ne commit JAMAIS ton fichier `.env` ou ton token Discord !
Le fichier `.gitignore` est configuré pour protéger tes secrets.

## 📝 Structure du projet

```
Bot_Discord/
├── bot_discord.py      # Code principal du bot
├── requirements.txt    # Dépendances Python
├── Procfile           # Configuration pour Railway
├── .env               # Tes secrets (NE PAS COMMIT)
├── .gitignore         # Fichiers à ignorer par Git
└── README.md          # Ce fichier
```

## 🐛 Dépannage

**Le bot ne démarre pas :**
- Vérifier les 3 variables obligatoires sur Railway
- Consulter les logs Railway

**Pas de notifications :**
- Vérifier que le bot est invité sur les deux Discord
- Vérifier les IDs des forums/salons (Mode développeur)
- Vérifier les permissions du bot

**Token invalide :**
- Régénérer le token sur Discord Developer Portal
