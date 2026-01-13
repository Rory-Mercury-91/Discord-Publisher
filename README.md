# 🇫🇷 Discord Publisher - Système de Publication de Traductions

Application Electron moderne pour créer et gérer des publications de traductions de jeux sur Discord. Interface React/TypeScript avec gestion d'historique et édition de posts existants.

## 📋 Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Utilisation](#utilisation)
- [Build et Distribution](#build-et-distribution)
- [Scripts Python (Bots)](#scripts-python-bots)

---

## 🎯 Vue d'ensemble

**Discord Publisher** est une application de bureau (Electron) qui facilite la création et la gestion de publications Discord pour des traductions de jeux. Elle offre :

- ✨ Interface moderne React + TypeScript avec Vite
- 🎨 Templates personnalisables avec variables dynamiques
- 🖼️ Support d'images avec gestion drag & drop
- 📋 Historique des publications avec édition
- 🔄 Modification de posts Discord existants via API
- 💾 Stockage local sécurisé (localStorage + fichiers config)
- 🚀 Publication directe sur Discord

---

## ✨ Fonctionnalités

### 📝 Éditeur de Publications
- **Templates personnalisables** : Mes traductions, Partenaires, Autre
- **Variables dynamiques** : Nom du jeu, version, liens, traducteurs, etc.
- **Preview en temps réel** : Visualisation avec rendu Markdown/BBCode/émojis Discord
- **Gestion d'images** : Drag & drop, miniatures, définition d'image principale
- **Tags Discord** : Autocomplete avec les tags du forum
- **Thèmes clair/sombre** : Basculer entre modes jour ☀️ et nuit 🌙 avec persistance
- **Validation visuelle** : Champs manquants encadrés en rouge
- **Raccourcis clavier** :
  - `Ctrl+H` : Ouvrir l'historique
  - `Ctrl+T` : Basculer le thème
  - `Ctrl+Z` / `Ctrl+Y` : Undo/Redo dans Synopsis

### 📋 Historique et Édition
- **Liste complète** : Toutes vos publications avec détails (titre, date, tags, aperçu)
- **Actions rapides** :
  - 🔗 Ouvrir le post sur Discord
  - ✏️ Modifier le post existant (titre, contenu, tags, image)
  - 📋 Dupliquer pour créer un nouveau post similaire
  - 🗑️ Supprimer de l'historique local
- **Mode édition** : Badge visuel et bouton "Mettre à jour" au lieu de "Publier"

### ⚙️ Gestion Avancée
- **Modales de configuration** :
  - Templates personnalisés avec variables
  - Tags favoris
  - Instructions de templates
  - Liste de traducteurs pour autocomplete
- **UX optimisée des modales** :
  - Fermeture par touche Échap
  - Verrouillage du scroll en arrière-plan
  - Impossibilité de fermer en cliquant à l'extérieur (sécurité)
  - Boutons uniformisés : 🚪 Fermer, ❌ Annuler, ✅ Enregistrer, ➕ Ajouter
- **Import/Export** : Sauvegarde complète de la configuration
- **Réinitialisation** : Bouton 🔄 pour remettre l'app à zéro
- **Test de connexion API** : Vérification en un clic
- **Support images étendu** : AVIF, WebP, BMP, TIFF, SVG, ICO en plus de JPEG/PNG/GIF
- **Thèmes personnalisables** : Mode clair/sombre avec palette inspirée de Le Nexus

---

## 🏗️ Architecture

```
📦 Discord Publisher
├── 📁 frontend/                     # Application React + TypeScript
│   ├── src/
│   │   ├── components/             # Composants UI React
│   │   ├── state/                  # Context API (appContext.tsx)
│   │   ├── hooks/                  # Custom hooks
│   │   └── main.tsx                # Point d'entrée React
│   ├── vite.config.ts              # Configuration Vite
│   └── package.json
│
├── 📁 python/                       # Scripts Python (Bots Discord)
│   ├── bot_discord_server1.py      # Bot annonces serveur principal
│   ├── bot_discord_server2.py      # Bot rappels F95fr
│   ├── publisher_api.py            # API REST pour création/modification de posts
│   └── main_bots.py                # Launcher combiné pour les 2 bots
│
├── 📁 assets/                       # Ressources (icônes)
│   └── icon.ico                    # Icône de l'application
│
├── 📄 main.js                       # Electron main process
├── 📄 preload.js                    # Electron preload bridge (IPC sécurisé)
├── 📄 build-windows.ps1             # Script de build Windows
├── 📄 package.json                  # Configuration npm
├── 📄 requirements.txt              # Dépendances Python
└── 📄 render.yaml                   # Configuration Render.com (hébergement)
```

### Flux de Publication

```
[Interface Electron React]
    ↓ (IPC sécurisé via preload.js)
[Main Process]
    ↓ (HTTP POST/PATCH multipart/form-data)
[API Publisher Python]
    ↓ (Discord REST API)
[Forum Discord]
    ↓ (Webhook/Thread créé ou modifié)
[Serveur Discord]
```

---

## 🛠️ Installation

### Prérequis

**Application Electron :**
- Node.js 18+ et npm
- Windows 10/11 (pour le build .exe)

**Scripts Python (optionnels - pour les bots) :**
- Python 3.10+
- Compte Discord avec accès développeur
- Tokens de bot Discord

### Installation de l'Application

1. **Cloner le projet**
```bash
git clone <votre-repo>
cd Bot_Discord
```

2. **Installer les dépendances root**
```bash
npm install
```

3. **Installer les dépendances frontend**
```bash
npm --prefix frontend install
```

4. **Lancer en développement**
```bash
npm run dev
```

L'application s'ouvrira automatiquement avec hot-reload activé.

### Installation des Scripts Python (Optionnel)

Si vous souhaitez utiliser les bots Discord :

```bash
# Créer un environnement virtuel
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/Mac

# Installer les dépendances
pip install -r requirements.txt
```

### 🌐 Hébergement des Bots (Recommandé)

Pour un fonctionnement 24/7, il est recommandé d'héberger les bots sur un service cloud gratuit :

**Solution recommandée : [Render.com](https://render.com)** (gratuit)
- 2 services gratuits (750h/mois chacun)
- Déploiement Git automatique
- Support Python + WebSocket
- Configuration via `render.yaml` incluse

**Voir le guide complet** : `docs_perso/DEPLOIEMENT_RENDER.md` (disponible après clonage)

**Alternative :** [Fly.io](https://fly.io) (3 machines gratuites)

---

## ⚙️ Configuration

### �️ Configuration de l'Application Electron

La configuration de l'application se fait **entièrement via l'interface** :

1. **Lancer l'application** : `npm run dev`
2. **Cliquer sur "⚙️ Configuration"** dans le header
3. **Configurer** :
   - **Endpoint API Publisher** : URL de l'API Python (ex: `http://localhost:8080/api/forum-post`)
   - **Clé API (X-API-KEY)** : Clé secrète définie dans `.env` du script Python
4. **Tester la connexion** : Bouton "🧪 Tester la connexion"

La configuration est **sauvegardée localement** dans `publisher_config.json` (côté main process).

### 🐍 Configuration des Scripts Python

Créez un fichier `.env` à la racine du projet pour les scripts Python :

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

### Application Electron

#### Développement
```bash
# Lancer l'app en mode développement (avec hot-reload)
npm run dev
```

#### Production (sans build)
```bash
# Build le frontend puis lancer l'app
npm run build:frontend
npm start
```

### Workflow de Publication

1. **Ouvrir l'application**
2. **Sélectionner un template** : Mes traductions, Partenaire, ou Autre
3. **Remplir les variables** : Nom du jeu, version, liens, etc.
4. **Ajouter une image** (optionnel) : Drag & drop ou clic
5. **Prévisualiser** : Basculer entre vue brute et stylisée
6. **Publier** : Clic sur "🚀 Publier sur Discord"
7. **Consulter l'historique** : Clic sur "📋 Historique"

### Modifier une Publication Existante

1. **Ouvrir l'historique** : Bouton "📋 Historique"
2. **Cliquer sur "✏️ Modifier"** sur le post à éditer
3. **Modifier les champs** souhaités (titre, contenu, tags, image)
4. **Cliquer sur "✏️ Mettre à jour"**
5. **Confirmer** : Le post Discord sera mis à jour

⚠️ **Note** : Les images s'empilent sur Discord (limitation API). Supprimez l'ancienne manuellement si nécessaire.

---

## 📦 Build et Distribution

### Générer l'exécutable Windows

```bash
# Nettoie les caches, build le frontend, et génère le .exe
npm run build:win
```

Le script `build-windows.ps1` effectue automatiquement :
1. ✅ Nettoyage des caches (dist, release, electron cache, etc.)
2. ✅ Build du frontend React avec Vite
3. ✅ Packaging Electron en .exe avec electron-builder

L'exécutable sera dans le dossier `release/` :
- 📦 `PublicationGenerator Setup X.X.X.exe` (installateur)
- 📦 `PublicationGenerator X.X.X.exe` (portable)

### Distribution

L'exécutable est **autonome** et peut être distribué tel quel. Les utilisateurs doivent simplement :
1. Installer/exécuter l'application
2. Configurer l'endpoint API et la clé dans les paramètres

---

## 🐍 Scripts Python (Bots)

Les scripts Python sont **optionnels** et servent à automatiser la gestion Discord côté serveur.

### 1. API Publisher (`python/publisher_api.py`)

**Obligatoire pour l'application Electron.**

Serveur HTTP qui expose l'API REST pour créer/modifier des posts Discord.

**Endpoints** :
- `POST /api/forum-post` : Créer un nouveau post
- `PATCH /api/forum-post/{thread_id}/{message_id}` : Modifier un post existant

**Démarrage** :
```bash
python python/publisher_api.py
```

**Configuration** : Voir section Configuration `.env` ci-dessus.

### 2. Bot Serveur 1 (`python/bot_discord_server1.py`)

**Optionnel** - Automatisation d'annonces.

Surveille les forums de traductions et publie automatiquement des annonces formatées sur un canal dédié.

**Démarrage** :
```bash
python python/bot_discord_server1.py
```

### 3. Bot Serveur 2 (`python/bot_discord_server2.py`)

**Optionnel** - Rappels de publication F95fr.

Surveille les forums et envoie des notifications de rappel avant publication F95.

**Démarrage** :
```bash
python python/bot_discord_server2.py
```

### Démarrage en Production (Linux)

#### Avec screen
```bash
# API Publisher (obligatoire pour l'app)
screen -dmS api python python/publisher_api.py

# Bots optionnels
screen -dmS bot1 python python/bot_discord_server1.py
screen -dmS bot2 python python/bot_discord_server2.py

# Vérifier les sessions
screen -ls

# Se reconnecter à une session
screen -r api
```

#### Avec systemd

Créez un fichier service dans `/etc/systemd/system/` :

**publisher-api.service** :
```ini
[Unit]
Description=Discord Publisher API
After=network.target

[Service]
Type=simple
User=votre_user
WorkingDirectory=/chemin/vers/Bot_Discord
ExecStart=/usr/bin/python3 python/publisher_api.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Puis :
```bash
sudo systemctl daemon-reload
sudo systemctl enable publisher-api
sudo systemctl start publisher-api
sudo systemctl status publisher-api
```

---

## 📚 Structure des Données

### Configuration Locale (Electron)

**publisher_config.json** (main process) :
```json
{
  "apiUrl": "http://localhost:8080/api/forum-post",
  "apiKey": "votre_cle_api"
}
```

**localStorage** (renderer) :
- `customTemplates` : Templates personnalisés
- `savedTags` : Tags favoris
- `savedInstructions` : Instructions par template
- `savedTraductors` : Liste traducteurs
- `publishedPosts` : Historique des publications

### Format d'un Post Publié

```typescript
{
  id: "post_1234567890_abc123",
  timestamp: 1704067200000,
  title: "Mon jeu traduit",
  content: "Contenu Markdown/BBCode...",
  tags: "traduction, vn, français",
  template: "my",
  imagePath: "image_123_cover.png",
  threadId: "1234567890123456",
  messageId: "1234567890123457",
  discordUrl: "https://discord.com/channels/...",
  forumId: 1234567890
}
```

---

## 🔧 Développement

### Scripts npm disponibles

```bash
# Développement avec hot-reload
npm run dev

# Lancer Electron seul (sans build frontend)
npm start

# Build frontend uniquement
npm run build:frontend

# Tests TypeScript
npm run test

# Build exécutable Windows
npm run build:win
```

### Architecture Technique

**Frontend** :
- React 18 + TypeScript
- Vite (build tool)
- Context API pour state management
- Hooks personnalisés (useConfirm, useImageLoader, useToast)

**Electron** :
- Main process : IPC handlers, window management
- Preload : Bridge sécurisé avec contextIsolation
- Renderer : Application React

**Python** :
- aiohttp pour l'API REST
- discord.py pour les bots
- python-dotenv pour variables d'environnement

---

## 📝 Limitations Connues

1. **Images Discord** : Lors de la modification d'un post, les anciennes images ne peuvent pas être supprimées via l'API Discord. Elles s'empilent. Suppression manuelle nécessaire.

2. **Rate Limits Discord** : ~5 requêtes / 5 secondes. Avec une utilisation normale, aucun problème.

3. **Windows uniquement** : Le build automatisé cible Windows. Pour Linux/Mac, adapter `electron-builder` config.

---

## 🤝 Contribution

Les contributions sont bienvenues ! N'hésitez pas à :
- Ouvrir des issues pour signaler des bugs
- Proposer des améliorations
- Soumettre des pull requests

---

## 📄 Licence

MIT License - Libre d'utilisation et modification

---

## 🆘 Support

Pour toute question ou problème :
1. Vérifiez que l'API Publisher est bien lancée
2. Testez la connexion depuis l'app (⚙️ Configuration → 🧪 Tester)
3. Vérifiez les logs de l'API Python
4. Consultez la console développeur Electron (Ctrl+Shift+I)

3. **Rappel F95fr (optionnel)** :
   - Bot Serveur 2 détecte le tag "MAJ"
   - → Envoie une notification avec timestamp
---

## 🌐 Déploiement de l'API Python (Optionnel)

Si vous souhaitez héberger l'API Publisher sur un serveur distant :

### Railway.app

1. Créer un compte sur [Railway.app](https://railway.app)
2. Nouveau projet → Deploy from GitHub
3. Ajouter les variables d'environnement `.env`
4. Start Command : `python python/publisher_api.py`
5. Railway détecte automatiquement `requirements.txt`

### Docker

**Dockerfile** :
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY python/ ./python/
COPY .env .

CMD ["python", "python/publisher_api.py"]
```

**docker-compose.yml** :
```yaml
version: '3.8'
services:
  api:
    build: .
    command: python python/publisher_api.py
    env_file: .env
    ports:
      - "8080:8080"
    restart: always
```

Lancer : `docker-compose up -d`

---

**Bon développement ! 🚀🎮**