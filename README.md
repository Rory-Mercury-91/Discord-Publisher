# 🇫🇷 Système de Gestion de Traductions Discord

Système complet pour gérer et publier automatiquement des traductions de jeux sur Discord. Comprend 3 bots Discord indépendants et une interface web de génération de publications.

## 📋 Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Utilisation](#utilisation)
- [Déploiement](#déploiement)
- [Maintenance](#maintenance)

---

## 🎯 Vue d'ensemble

Le projet se compose de **4 composants principaux** :

### 1. **Bot Discord Serveur 1** (`bot_discord_server1.py`)
- 🎮 **Fonction** : Annonces complètes de traductions sur le serveur principal
- 📢 **Surveille** : Forums de traductions (personnelles + partenaires)
- ✅ **Actions** : Détecte les nouveaux threads, modifications de tags et contenu, puis publie des annonces formatées

### 2. **Bot Discord Serveur 2** (`bot_discord_server2.py`)
- 📅 **Fonction** : Rappels de publication F95fr
- 🔔 **Surveille** : Forums semi-automatiques et automatiques
- ⏰ **Actions** : Envoie des notifications de rappel avec timestamp pour les threads marqués "MAJ"

### 3. **API Publisher** (`publisher_api.py`)
- 🚀 **Fonction** : API REST pour créer des posts de forum Discord
- 🔌 **Endpoint** : `/api/forum-post` (POST)
- 🖼️ **Support** : Titre, contenu markdown, tags, images

### 4. **Interface Web** (`Publication_template_discord.html`)
- 🎨 **Fonction** : Générateur de publications avec templates personnalisables
- 💾 **Stockage** : Local (localStorage) - gestion de templates, tags, variables
- 📤 **Publication** : Directe sur Discord via l'API Publisher

---

## 🏗️ Architecture

```
📦 Projet
├── 🤖 bot_discord_server1.py    # Bot annonces serveur principal
├── 🤖 bot_discord_server2.py    # Bot rappels F95fr
├── 🌐 publisher_api.py          # API création de posts
├── 🎨 Publication_template_discord.html  # Interface web
├── 📄 requirements.txt          # Dépendances Python
├── 🔐 .env                      # Variables d'environnement
└── 📖 README.md                 # Ce fichier
```

### Flux de données

```
[Interface Web] 
    ↓ (HTTP POST avec image)
[API Publisher] 
    ↓ (Discord API)
[Serveur Discord 1]
    ↓ (Thread créé avec tags)
[Bot Serveur 1] 
    ↓ (Détection)
[Canal Annonces]
```

---

## 🛠️ Installation

### Prérequis

- Python 3.10+
- Compte Discord avec accès développeur
- Tokens de bot Discord (3 bots séparés recommandés)
- Serveurs Discord configurés avec forums

### Étapes

1. **Cloner le projet**
```bash
git clone <votre-repo>
cd <nom-projet>
```

2. **Installer les dépendances**
```bash
pip install -r requirements.txt
```

3. **Configurer les variables d'environnement**
```bash
cp .env.example .env
# Éditer .env avec vos valeurs
```

4. **Tester les composants**
```bash
# Test Bot Serveur 1
python bot_discord_server1.py

# Test Bot Serveur 2
python bot_discord_server2.py

# Test API Publisher
python publisher_api.py
```

---

## ⚙️ Configuration

### 📋 Fichier `.env`

Créez un fichier `.env` à la racine du projet avec les variables suivantes :

#### 🤖 Bot Serveur 1 - Annonces principales
```env
# Token du bot Discord principal
DISCORD_TOKEN=votre_token_bot_1

# ID du forum surveillé (traductions personnelles)
FORUM_CHANNEL_ID=1234567890123456789

# ID du canal où publier les annonces
ANNOUNCE_CHANNEL_ID=1234567890123456789

# ID du forum partenaires (optionnel)
FORUM_PARTNER_ID=1234567890123456789
```

#### 🤖 Bot Serveur 2 - Rappels F95fr
```env
# Token du bot Discord F95fr
DISCORD_TOKEN_F95=votre_token_bot_2

# ID du forum semi-automatique
FORUM_SEMI_AUTO_ID=1234567890123456789

# ID du forum automatique
FORUM_AUTO_ID=1234567890123456789

# ID du canal de notifications
NOTIFICATION_CHANNEL_F95_ID=1234567890123456789

# Nombre de jours avant publication (défaut: 14)
DAYS_BEFORE_PUBLICATION=14
```

#### 🌐 API Publisher - Création de posts
```env
# Token du bot Discord pour l'API
DISCORD_PUBLISHER_TOKEN=votre_token_bot_3

# Clé API pour sécuriser l'endpoint
PUBLISHER_API_KEY=votre_cle_secrete_aleatoire

# ID du forum "Mes traductions"
PUBLISHER_FORUM_MY_ID=1234567890123456789

# ID du forum "Partenaires"
PUBLISHER_FORUM_PARTNER_ID=1234567890123456789

# Port de l'API (défaut: 8080)
PORT=8080

# Origines CORS autorisées (* = toutes, ou liste séparée par virgules)
PUBLISHER_ALLOWED_ORIGINS=*
```

### 🔍 Comment obtenir les IDs Discord ?

1. Activez le **Mode Développeur** dans Discord :
   - Paramètres → Avancés → Mode développeur

2. Clic droit sur le canal/forum → **Copier l'identifiant**

### 🤖 Créer des bots Discord

1. Allez sur [Discord Developer Portal](https://discord.com/developers/applications)
2. Créez 3 applications (une par bot recommandé)
3. Pour chaque application :
   - Onglet **Bot** → Créer un bot
   - Copiez le **Token** (ne le partagez jamais !)
   - Activez les **Intents** : `MESSAGE CONTENT`, `GUILDS`
4. Onglet **OAuth2** → **URL Generator** :
   - Scopes : `bot`
   - Permissions : `Send Messages`, `Read Messages`, `Manage Threads`, `Attach Files`
5. Utilisez l'URL générée pour inviter chaque bot sur son serveur

---

## 🚀 Utilisation

### Démarrer les bots

#### Option 1 : Manuellement (développement)
```bash
# Terminal 1 - Bot Serveur 1
python bot_discord_server1.py

# Terminal 2 - Bot Serveur 2
python bot_discord_server2.py

# Terminal 3 - API Publisher
python publisher_api.py
```

#### Option 2 : Avec screen (production Linux)
```bash
# Bot Serveur 1
screen -dmS bot1 python bot_discord_server1.py

# Bot Serveur 2
screen -dmS bot2 python bot_discord_server2.py

# API Publisher
screen -dmS api python publisher_api.py

# Vérifier les sessions
screen -ls

# Se reconnecter à une session
screen -r bot1
```

#### Option 3 : Avec systemd (production Linux)

Créez 3 fichiers service dans `/etc/systemd/system/` :

**bot1.service** :
```ini
[Unit]
Description=Bot Discord Serveur 1
After=network.target

[Service]
Type=simple
User=votre_user
WorkingDirectory=/chemin/vers/projet
ExecStart=/usr/bin/python3 bot_discord_server1.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Puis :
```bash
sudo systemctl daemon-reload
sudo systemctl enable bot1 bot2 api
sudo systemctl start bot1 bot2 api
sudo systemctl status bot1
```

### Utiliser l'interface web

1. **Ouvrir** `Publication_template_discord.html` dans un navigateur

2. **Configuration initiale** :
   - Cliquez sur "⚙️ Configuration Discord"
   - Entrez l'URL de l'API : `http://votre-serveur:8080/api/forum-post`
   - Entrez votre clé API (celle définie dans `.env`)
   - Cliquez sur "💾 Sauvegarder API/clé"

3. **Gérer les templates** :
   - Cliquez sur "✏️ Gérer les templates"
   - Modifiez ou créez de nouveaux templates
   - Utilisez `[Name_game]`, `[Game_version]`, etc. comme variables

4. **Gérer les tags** :
   - Cliquez sur "🏷️ Gérer les tags"
   - Ajoutez des tags avec leur nom et ID Discord
   - Associez-les à un template

5. **Créer une publication** :
   - Sélectionnez un template
   - Remplissez les champs
   - Ajoutez des images (la première est principale)
   - Sélectionnez des tags
   - Prévisualisez avec "👁️ Aperçu"
   - Publiez avec "🚀 Publier sur Discord"

### Workflow complet

1. **Publication via interface web** :
   - L'utilisateur crée un post dans l'interface
   - → Envoi vers l'API Publisher
   - → Création du thread Discord avec tags et image
   
2. **Détection par Bot Serveur 1** :
   - Le bot détecte le nouveau thread
   - → Extrait les informations (titre, versions, traducteur, synopsis)
   - → Publie une annonce formatée dans le canal dédié

3. **Rappel F95fr (optionnel)** :
   - Bot Serveur 2 détecte le tag "MAJ"
   - → Envoie une notification avec timestamp
   - → Rappel X jours avant publication

---

## 🌐 Déploiement

### Railway.app (recommandé pour l'API)

1. **Créer un compte** sur [Railway.app](https://railway.app)

2. **Nouveau projet** → **Deploy from GitHub**

3. **Ajouter les variables d'environnement** :
   - Allez dans Variables
   - Ajoutez toutes les variables du fichier `.env`

4. **Configuration du service** :
   - Start Command : `python publisher_api.py`
   - Port : Railway attribue automatiquement `PORT`

5. **Déployer** : Railway détecte automatiquement `requirements.txt`

### Heroku

1. **Installer Heroku CLI**
```bash
heroku login
heroku create votre-app-publisher
```

2. **Configurer les variables**
```bash
heroku config:set DISCORD_PUBLISHER_TOKEN=xxx
heroku config:set PUBLISHER_API_KEY=xxx
# ... toutes les autres
```

3. **Créer un Procfile**
```
web: python publisher_api.py
```

4. **Déployer**
```bash
git push heroku main
```

### VPS (serveur dédié)

Utilisez **systemd** (voir section Utilisation) ou **Docker** :

**Dockerfile** :
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "publisher_api.py"]
```

**docker-compose.yml** :
```yaml
version: '3.8'
services:
  bot1:
    build: .
    command: python bot_discord_server1.py
    env_file: .env
    restart: always

  bot2:
    build: .
    command: python bot_discord_server2.py
    env_file: .env
    restart: always

  api:
    build: .
    command: python publisher_api.py
    env_file: .env
    ports:
      - "8080:8080"
    restart: always
```

Lancer avec :
```bash
docker-compose up -d
```

---

## 🔧 Maintenance

### Logs et debugging

#### Vérifier les logs
```bash
# Screen
screen -r bot1
# Ctrl+A puis D pour détacher

# Systemd
sudo journalctl -u bot1 -f

# Docker
docker-compose logs -f bot1
```

#### Messages de debug

Les bots affichent des messages avec emojis :
- ✅ Succès
- ❌ Erreur
- ⭐️ Information
- 🔄 Mise à jour
- 📅 Notification
- 🗑️ Suppression

### Problèmes courants

#### Bot ne démarre pas
```
❌ DISCORD_TOKEN manquant
```
→ Vérifiez que `.env` contient bien le token

#### Pas d'annonce publiée
1. Vérifiez que le bot a les permissions sur le canal
2. Vérifiez que `ANNOUNCE_CHANNEL_ID` est correct
3. Regardez les logs : le bot détecte-t-il le thread ?

#### API Publisher erreur 401
→ Vérifiez que `X-API-KEY` dans l'interface web correspond à `PUBLISHER_API_KEY` dans `.env`

#### Tags non appliqués
→ Vérifiez que les IDs de tags dans l'interface web correspondent aux vrais IDs Discord (mode développeur)

### Sauvegardes

L'interface web stocke tout en **localStorage** du navigateur. Pour sauvegarder :

1. Cliquez sur "📤 Exporter la configuration"
2. Sauvegardez le JSON généré
3. Pour restaurer : "📥 Importer une configuration"

---

## 📊 Fonctionnalités avancées

### Variables personnalisées

Ajoutez vos propres variables dans l'interface web :
1. "➕ Ajouter une variable personnalisée"
2. Définissez nom, label et type
3. Utilisez `[nom_variable]` dans vos templates

### Templates multiples

Créez différents templates pour différents types de traductions :
- Traductions personnelles
- Traductions partenaires
- Publications F95fr
- Mises à jour rapides

### Gestion des traducteurs

Sauvegardez vos traducteurs fréquents :
1. Remplissez le champ "Traducteur"
2. Cliquez sur 💾
3. Rechargez rapidement avec 📂

### Instructions réutilisables

Sauvegardez des instructions d'installation standards :
1. Rédigez vos instructions
2. Cliquez sur 💾 dans le champ Instructions
3. Rechargez avec 📂

---

## 🤝 Contribution

Les contributions sont bienvenues ! Pour contribuer :

1. Forkez le projet
2. Créez une branche (`git checkout -b feature/amelioration`)
3. Committez vos changements (`git commit -am 'Ajout fonctionnalité'`)
4. Pushez (`git push origin feature/amelioration`)
5. Créez une Pull Request

---

## 📜 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

---

## 🙏 Support

Pour toute question ou problème :
- Ouvrez une **Issue** sur GitHub
- Consultez les **logs** des bots
- Vérifiez la **configuration** dans `.env`

---

## 🔄 Mises à jour

### v2.0 - Restructuration complète
- ✅ Séparation en 3 fichiers Python distincts
- ✅ Bot Serveur 1 : Annonces principales
- ✅ Bot Serveur 2 : Rappels F95fr
- ✅ API Publisher : Création de posts
- ✅ Documentation complète

### v1.0 - Version initiale
- Bot Discord unifié
- Interface web de génération
- API Publisher basique

---

## 📞 Contact

Pour toute question technique ou suggestion d'amélioration, n'hésitez pas à ouvrir une issue sur GitHub.

**Bon courage avec vos traductions ! 🎮🇫🇷**