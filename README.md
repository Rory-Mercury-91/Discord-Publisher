# 🎮 Publication Generator - Discord Bot Manager

Application Tauri moderne pour créer et gérer des publications de traductions de jeux sur Discord. Interface React/TypeScript avec gestion d'historique et édition de posts existants.

---

## 📋 Table des Matières

1. [Présentation](#-présentation)
2. [Fonctionnalités](#-fonctionnalités-principales)
3. [Architecture du Projet](#-architecture-du-projet)
4. [Technologies Utilisées](#-technologies-utilisées)
5. [Installation](#-installation)
6. [Configuration](#️-configuration)
7. [Utilisation](#-utilisation)
8. [Build Production](#-build-production)
9. [Scripts Python (Bots)](#-scripts-python-bots)
10. [Dépannage](#-dépannage)

---

## 🎯 Présentation

**Discord Publisher** est une application de bureau (Tauri) qui facilite la création et la gestion de publications Discord pour des traductions de jeux. Elle offre :

- ✨ Interface moderne React 18 + TypeScript 5 + Vite 7
- 🎨 Templates personnalisables avec système de brouillons (autosave 30s)
- 🖼️ Support d'images avec compression automatique (>8MB → 80% JPEG)
- 📋 Historique paginé (20/page) avec lazy loading et recherche avancée
- 🔄 Modification de posts Discord existants via API
- 💾 Stockage local sécurisé (localStorage + fichiers)
- ⚡ Performance optimisée (debounce 300ms, Intersection Observer)
- ⌨️ Raccourcis clavier (Ctrl+S, Ctrl+H, Ctrl+T, Ctrl+Z/Y)
- 🚀 Publication directe sur Discord avec retry automatique
- 🤖 Lancement automatique des bots Python au démarrage
- 🌐 API REST locale (Python aiohttp) avec configuration UI dynamique

---

## ✨ Fonctionnalités Principales

### 🎨 Gestion de Templates
- **Templates personnalisés** avec variables dynamiques (`{{titre}}`, `{{version}}`, etc.)
- **Brouillons automatiques** : Sauvegarde toutes les 30 secondes
- **Support Markdown** : Gras, italique, listes, liens, code
- **Variables personnalisées** : Créez vos propres champs de formulaire
- **Export/Import** : Partagez vos templates avec d'autres utilisateurs
- **Historique des modifications** : Restaurez une version précédente

### 📝 Édition de Contenu
- **Éditeur WYSIWYG** : Prévisualisation en temps réel du Markdown
- **Insertion de variables** : Un clic pour insérer `{{variable}}`
- **Undo/Redo** : Ctrl+Z / Ctrl+Y (historique de 50 actions)
- **Drag & Drop** : Glissez-déposez vos images
- **Compression automatique** : Réduction intelligente des images >8MB
- **Multi-images** : Plusieurs images par publication
- **Tags sauvegardés** : Liste réutilisable de tags
- **Thèmes clair/sombre** : Basculer entre modes jour ☀️ et nuit 🌙 avec persistance

### 📋 Historique & Recherche
- **Historique paginé** : Affichage par lots de 20 publications
- **Recherche avancée** : Titre, contenu, tags, type de publication
- **Lazy loading** : Chargement optimisé avec Intersection Observer
- **Édition de posts** : Modifiez vos posts Discord publiés
- **Actions rapides** :
  - 🔗 Ouvrir le post sur Discord
  - ✏️ Modifier le post existant (titre, contenu, tags, image)
  - 📋 Dupliquer pour créer un nouveau post similaire
  - 🗑️ Supprimer de l'historique local

### 🚀 Publication Discord
- **Publication directe** : Créez des threads de forum Discord en un clic
- **Retry automatique** : Ré-essai intelligent en cas d'échec réseau
- **Statut en temps réel** : Badge de connexion API
- **Configuration UI** : Plus besoin de fichier .env, tout se configure dans l'interface
- **Multi-serveurs** : Configurez plusieurs bots Discord (optionnel)

### 🤖 Bots Discord Automatiques
- **Bot Serveur 1** : Publication automatique sur votre serveur principal
- **Bot Serveur 2 (F95)** : Publication différée avec système de cooldown
- **Lancement auto** : Les bots démarrent avec l'application
- **Configuration UI** : Tokens et IDs configurables dans l'interface

### ⌨️ Raccourcis Clavier
- `Ctrl+H` : Ouvrir l'historique
- `Ctrl+T` : Basculer le thème
- `Ctrl+Z` / `Ctrl+Y` : Undo/Redo dans Synopsis
- `Ctrl+S` : Sauvegarder le template (dans TemplatesModal)
- `?` : Ouvrir l'aide des raccourcis
- `Échap` : Fermer la modale active

---

## 🏗 Architecture du Projet

```
Bot_Discord/
├── 📁 frontend/                     # Application React + TypeScript
│   ├── 📁 src/
│   │   ├── 📁 components/          # Composants React
│   │   ├── 📁 hooks/               # Hooks personnalisés
│   │   ├── 📁 state/               # Context API (appContext.tsx)
│   │   ├── 📁 lib/                 # API Tauri (tauri-api.ts)
│   │   ├── App.tsx                 # Composant racine
│   │   └── main.tsx                # Point d'entrée
│   ├── index.html                  # Template HTML
│   ├── package.json                # Dépendances frontend
│   └── vite.config.ts              # Configuration Vite
├── 📁 src-tauri/                    # Backend Rust + Tauri
│   ├── 📁 src/
│   │   ├── lib.rs                  # Commandes Tauri (IPC)
│   │   └── main.rs                 # Point d'entrée Rust
│   ├── Cargo.toml                  # Dépendances Rust
│   └── tauri.conf.json             # Configuration Tauri
├── 📁 python/                       # Scripts Python
│   ├── publisher_api.py            # API REST locale (aiohttp)
│   ├── bot_discord_server1.py      # Bot serveur principal
│   ├── bot_discord_server2.py      # Bot F95 avec cooldown
│   └── main_bots.py                # Lanceur multi-bots
├── 📁 python-portable/              # Python 3.11.9 portable bundlé
├── 📁 images/                       # Images uploadées (runtime)
├── package.json                     # Scripts NPM root
└── README.md                        # Cette doc

Architecture:
┌─────────────────────────┐
│   React + TypeScript    │ ← Frontend (Vite)
│   (Interface utilisateur)│
└────────────┬────────────┘
            │ Tauri IPC (invoke)
┌────────────▼────────────┐
│      Rust Backend       │ ← Tauri (lib.rs)
│  - Gestion images       │
│  - Lancement Python     │
│  - Dialogues fichiers   │
└────────────┬────────────┘
            │ spawn()
┌────────────▼────────────┐
│   Python Processes      │
│  - publisher_api.py     │ ← API REST (aiohttp)
│  - bot_discord_*.py     │ ← Bots Discord
└────────────┬────────────┘
            │ HTTP/WebSocket
┌────────────▼────────────┐
│      Discord API        │
└─────────────────────────┘
```

### Flux de Publication

```
[Interface Tauri React]
    ↓ (Tauri IPC Commands)
[Rust Backend]
    ↓ (HTTP POST/PATCH multipart/form-data)
[API Publisher Python]
    ↓ (Discord REST API)
[Forum Discord]
    ↓ (Thread créé ou modifié)
[Serveur Discord]
```

---

## 🛠️ Technologies Utilisées

**Frontend :**
- React 18.2.0 + TypeScript 5.4.2
- Vite 7.3.1 (build ultra-rapide)
- CSS Modules + Variables CSS (dark theme)

**Backend :**
- Tauri 2.9.5 (Rust 1.92.0)
- Python 3.11.9 portable (aiohttp, discord.py)

**API :**
- aiohttp 3.13.3 (serveur async Python)
- discord.py 2.6.4 (interactions Discord)

**Outils :**
- Git (version control)
- PowerShell (scripts de build)

---

## 🚀 Installation

### Prérequis

- **Windows 10/11** (64-bit)
- **Node.js 18+** et npm (pour le frontend)
- **Rust 1.75+** (pour Tauri) : https://rustup.rs/
- **Git** (optionnel, pour cloner le repo)

> **Note** : Python 3.11.9 est **bundlé** dans `python-portable/`, pas besoin d'installation séparée !

### Étapes d'installation

1. **Cloner le dépôt**
```bash
git clone <votre-repo>
cd Bot_Discord
```

2. **Installer les dépendances frontend**
```bash
cd frontend
npm install
cd ..
```

3. **Installer Tauri CLI** (si pas déjà fait)
```bash
npm install
```

4. **Vérifier que Rust est installé**
```bash
rustc --version  # Devrait afficher v1.92.0 ou supérieur
cargo --version
```

---

## ⚙️ Configuration

### 1. Configuration Discord (Interface UI)

L'application utilise maintenant une **configuration UI** ! Plus besoin de fichier `.env`.

1. Lancez l'application : `npm run dev`
2. Cliquez sur **⚙️ Configuration** en haut à droite
3. Section **🌐 API Publisher Discord** :
   - **Token Publisher** : Token du bot Discord principal
   - **API Key** : Clé d'authentification API (générez-la avec `python -c "import secrets; print(secrets.token_hex(16))"`)
   - **Forum "Mes traductions"** : ID du channel forum pour vos traductions
   - **Forum "Partenaire"** : ID du channel forum partenaire
4. (Optionnel) Section **🤖 Bots Discord** :
   - Configurez les bots supplémentaires si vous en avez
5. Cliquez sur **💾 Sauvegarder et appliquer**

> **Vérification** : Le badge devrait afficher **"✓ Connecté"** en vert.

### 2. Obtenir les IDs Discord

Pour récupérer les IDs de channels/forums Discord :
1. Activez le **Mode Développeur** dans Discord (Paramètres → Avancé → Mode développeur)
2. Clic droit sur un channel → **Copier l'identifiant**

### 3. Créer des bots Discord

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

## 🎮 Utilisation

### Lancer en mode développement

```bash
npm run dev
```

Cela démarre :
- Le frontend React (Vite dev server dans Tauri)
- Le backend Rust (Tauri)
- Les processus Python automatiquement (API + bots)

### Créer une publication

1. Sélectionnez un **template** (ou créez-en un nouveau)
2. Remplissez les **variables** (titre, version, traducteur, etc.)
3. Choisissez le **type de publication** (Mes traductions / Partenaire)
4. Ajoutez des **images** (drag & drop ou bouton 📷)
5. Prévisualisez le résultat dans le panneau de droite
6. Cliquez sur **🚀 Publier sur Discord**

### Éditer un post existant

1. Ouvrez l'**📋 Historique** (Ctrl+H)
2. Cherchez la publication à modifier
3. Cliquez sur **✏️ Modifier**
4. Effectuez vos modifications
5. Cliquez sur **💾 Enregistrer les modifications**

⚠️ **Note** : Les images s'empilent sur Discord (limitation API). Supprimez l'ancienne manuellement si nécessaire.

---

## 📦 Build Production

### Build NSIS Installer (Windows)

```bash
npm run build
```

Cela génère un **installeur NSIS** dans `src-tauri/target/release/bundle/nsis/`.

Contenu bundlé :
- ✅ Binaire Tauri (exe)
- ✅ Python 3.11.9 portable complet
- ✅ Scripts Python (API + bots)
- ✅ Dépendances Python (discord.py, aiohttp, etc.)
- ✅ Frontend compilé

**Pas besoin de fichier .env** : La configuration se fait directement dans l'interface !

### Options de build (tauri.conf.json)

Le fichier `src-tauri/tauri.conf.json` contient :
- **Icône de l'application** : `icons/icon.ico`
- **Nom de l'application** : `PublicationGenerator`
- **Version** : `1.0.0`
- **Ressources bundlées** : `python/`, `python-portable/`

### Distribution

L'exécutable est **autonome** et peut être distribué tel quel. Les utilisateurs doivent simplement :
1. Installer/exécuter l'application
2. Configurer les tokens et IDs dans l'interface ⚙️

---

## 🐍 Scripts Python (Bots)

Les scripts Python sont **optionnels** et servent à automatiser la gestion Discord côté serveur.

### 1. API Publisher (`python/publisher_api.py`)

**Obligatoire pour l'application Tauri.**

Serveur HTTP qui expose l'API REST pour créer/modifier des posts Discord.

**Endpoints** :
- `POST /api/forum-post` : Créer un nouveau post
- `PATCH /api/forum-post/{thread_id}/{message_id}` : Modifier un post existant

**Démarrage automatique** : Lancé par Tauri au démarrage de l'application.

**Configuration** : Via l'interface UI (⚙️ Configuration).

### 2. Bot Serveur 1 (`python/bot_discord_server1.py`)

**Optionnel** - Automatisation d'annonces.

Surveille les forums de traductions et publie automatiquement des annonces formatées sur un canal dédié.

**Démarrage automatique** : Lancé par Tauri si configuré dans l'interface.

### 3. Bot Serveur 2 (`python/bot_discord_server2.py`)

**Optionnel** - Rappels de publication F95fr.

Surveille les forums et envoie des notifications de rappel avant publication F95.

**Démarrage automatique** : Lancé par Tauri si configuré dans l'interface.

### Démarrage Manuel (Développement)

Si vous souhaitez tester les bots indépendamment :

```bash
# API Publisher
python python/publisher_api.py

# Bot Serveur 1
python python/bot_discord_server1.py

# Bot Serveur 2
python python/bot_discord_server2.py

# Lancer tous les bots ensemble
python python/main_bots.py
```

---

## 🔧 Dépannage

### L'API ne se connecte pas

1. Vérifiez le badge de statut dans **⚙️ Configuration**
2. Si **"✗ Déconnecté"** :
   - Vérifiez que le token Publisher est correct
   - Cliquez sur **🔄** pour rafraîchir le statut
   - Consultez les logs dans **🛠 Mode Debug**
   - Vérifiez que `python-portable/python.exe` existe

### Les bots ne démarrent pas

1. Vérifiez que `python-portable/python.exe` existe
2. Vérifiez les logs Tauri dans la console DevTools (F12 dans l'app)
3. Fichier de debug : `tauri_debug.log` à la racine du projet
4. Vérifiez que les dépendances Python sont installées dans `python-portable/`

### Images trop grandes

L'application compresse automatiquement les images >8MB en JPEG 80%. Si vous avez des problèmes :
- Utilisez des images <10MB
- Format recommandé : PNG, JPG, WEBP
- Résolution maximale : 4096x4096
- Formats supportés : JPEG, PNG, GIF, AVIF, WebP, BMP, TIFF, SVG, ICO

### Problèmes de compilation Rust

Si `npm run dev` échoue avec des erreurs Rust :
```bash
# Mettre à jour Rust
rustup update

# Nettoyer le cache Cargo
cd src-tauri
cargo clean
cargo build
```

### Réinitialiser l'application

Si l'application est dans un état instable :
1. Ouvrez **⚙️ Configuration**
2. Cliquez sur **🔄 Réinitialiser l'application**
3. Confirmez (⚠️ supprime TOUTES les données)

### Erreurs de communication Tauri

Si les commandes IPC échouent :
1. Vérifiez que Tauri CLI est à jour : `npm install @tauri-apps/cli@latest`
2. Redémarrez l'application
3. Consultez les logs de la console DevTools (F12)

---

## 📜 Scripts NPM Disponibles

```bash
npm run dev          # Lance Tauri en mode développement
npm run build        # Build production (génère l'installeur NSIS)
npm run test         # Type-check TypeScript + build frontend
```

---

## 📚 Structure des Données

### Configuration Locale (Tauri)

**localStorage** (frontend) :
- `customTemplates` : Templates personnalisés
- `savedTags` : Tags favoris
- `savedInstructions` : Instructions par template
- `savedTraductors` : Liste traducteurs
- `publishedPosts` : Historique des publications
- `apiConfig` : Configuration de l'API (tokens, IDs)

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

## 🔒 Sécurité

- **Tokens sécurisés** : Stockés dans localStorage (chiffré par Tauri)
- **IPC sécurisé** : Communication frontend-backend via Tauri commands
- **Pas de fichier .env** : Configuration UI évite l'exposition de secrets
- **Validation** : Toutes les entrées utilisateur sont validées

---

## 📋 Limitations Connues

1. **Images Discord** : Lors de la modification d'un post, les anciennes images ne peuvent pas être supprimées via l'API Discord. Elles s'empilent. Suppression manuelle nécessaire.

2. **Rate Limits Discord** : ~5 requêtes / 5 secondes. Avec une utilisation normale, aucun problème.

3. **Windows uniquement** : Le build automatisé cible Windows. Pour Linux/Mac, adapter `tauri.conf.json`.

4. **Python bundlé** : Python 3.11.9 portable est nécessaire pour Windows. Sur Linux/Mac, utilisez Python système.

---

## 🤝 Contribution

Projet personnel. Pas de contributions externes pour le moment.

---

## 📞 Support

Pour toute question ou problème :
1. Consultez le fichier `MIGRATION_TAURI.md` pour les détails techniques
2. Vérifiez les logs dans **🛠 Mode Debug**
3. Consultez `errors.log` à la racine du projet
4. Ouvrez la console DevTools (F12) pour les erreurs frontend

---

## 🌐 Déploiement de l'API Python (Optionnel)

Si vous souhaitez héberger l'API Publisher sur un serveur distant (non recommandé, l'app fonctionne en local) :

### Sur VPS Linux

```bash
# Installation
git clone <votre-repo>
cd Bot_Discord/python
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Lancement avec screen
screen -dmS api python publisher_api.py

# Ou avec systemd (voir section précédente)
```

### Avec Docker

**Dockerfile** :
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY python/ ./python/

CMD ["python", "python/publisher_api.py"]
```

**docker-compose.yml** :
```yaml
version: '3.8'
services:
  api:
    build: .
    command: python python/publisher_api.py
    environment:
      - PORT=8080
    ports:
      - "8080:8080"
    restart: always
```

Lancer : `docker-compose up -d`

---

## 📄 Licence

Propriétaire - Rory Mercury 91

---

**Version actuelle :** 1.0.0 (Tauri 2.9.5)

**Dernière mise à jour :** Janvier 2026

---

**Bon développement ! 🚀🎮**