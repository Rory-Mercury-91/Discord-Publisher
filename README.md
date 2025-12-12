# Bot Discord - Annonces de Traductions

Bot Discord qui surveille un forum de traductions de jeux et envoie automatiquement des annonces dans un canal dédié.

## 🚀 Fonctionnalités

- Détection automatique des nouveaux threads dans le forum
- Détection des modifications du contenu des posts (pas seulement les tags)
- Annonces avec distinction "Nouvelle traduction" vs "Mise à jour"
- Extraction automatique du titre du jeu, version du jeu et version de la traduction
- Affichage des tags (Terminé, En cours) avec emojis
- Affichage de l'image du jeu
- Anti-spam : supprime les doublons récents
- Lien direct vers le thread du forum

## 📦 Installation locale

1. Clone le repo
2. Installe les dépendances :
```bash
pip install -r requirements.txt
```

3. Crée un fichier `.env` à partir de `.env.example` :
```bash
copy .env.example .env
```

4. Remplis le fichier `.env` avec tes vraies valeurs :
```env
DISCORD_TOKEN=ton_token_discord
FORUM_CHANNEL_ID=1427703869844230317
ANNOUNCE_CHANNEL_ID=1449148521084096695
```

5. Lance le bot :
```bash
python bot_discord.py
```

## 🌐 Déploiement sur Railway.app

### Étape 1 : Préparer GitHub
1. Va sur https://github.com/Rory-Mercury-91/Stockage
2. Supprime tous les fichiers existants (ou crée un nouveau repo)
3. Upload tous les fichiers de ce dossier SAUF le fichier `.env`

### Étape 2 : Configurer Railway
1. Va sur [railway.app](https://railway.app) et connecte-toi avec GitHub
2. Clique sur "New Project" → "Deploy from GitHub repo"
3. Sélectionne ton repo `Stockage`
4. Dans "Variables", ajoute ces 3 variables :
   - `DISCORD_TOKEN` = ton token Discord
   - `FORUM_CHANNEL_ID` = 1427703869844230317
   - `ANNOUNCE_CHANNEL_ID` = 1449148521084096695
5. Railway va automatiquement détecter le `Procfile` et lancer ton bot ! 🚀

### Étape 3 : Vérifier que ça marche
- Va dans les "Logs" de Railway
- Tu devrais voir : "Bot prêt : [nom de ton bot]"

## ⚙️ Configuration

Les variables d'environnement nécessaires :
- `DISCORD_TOKEN` : Token de ton bot Discord
- `FORUM_CHANNEL_ID` : ID du canal forum à surveiller (1427703869844230317)
- `ANNOUNCE_CHANNEL_ID` : ID du canal où envoyer les annonces (1449148521084096695)

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
- Nom du jeu (titre du thread)
- Version du jeu (extraite du titre ou du contenu)
- Version de la traduction
- État (basé sur les tags : Terminé, En cours)
- Lien vers le thread
- Image du post (si présente)

### Déclenchement des annonces

Le bot envoie une annonce dans les cas suivants :
- ✅ Lors de la création d'un nouveau thread **avec des tags**
- ✅ Lors de l'**ajout** d'un tag (pas lors du retrait)
- ✅ Lors de la modification du contenu du premier message du thread

**Important** : Le bot attend **5 secondes** après une modification avant d'envoyer l'annonce. Si vous faites plusieurs modifications rapidement, une seule annonce sera envoyée avec l'état final.

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
├── .env.example       # Modèle de configuration
├── .gitignore         # Fichiers à ignorer par Git
└── README.md          # Ce fichier
```

## 🐛 Dépannage

**Le bot ne démarre pas sur Railway :**
- Vérifie que les 3 variables d'environnement sont bien configurées
- Regarde les logs pour voir l'erreur exacte

**Le bot ne répond pas aux threads :**
- Vérifie que les IDs des canaux sont corrects
- Vérifie que le bot a les permissions nécessaires sur Discord

**Erreur "Invalid Token" :**
- Ton token Discord est incorrect ou a expiré
- Génère un nouveau token sur le Discord Developer Portal
