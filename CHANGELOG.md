# Changelog

Tous les changements notables de ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---
## [1.0.2] - 2026-01-13

### ✨ Ajouté

#### 🌐 Hébergement et Déploiement
- **Configuration Render.com** : Fichier `render.yaml` pour déploiement automatique
  - Service 1 : Background Worker pour les 2 bots Discord combinés (750h/mois gratuit)
  - Service 2 : Web Service pour l'API Publisher (750h/mois gratuit)
  - Variables d'environnement configurables via dashboard
- **Launcher de bots combiné** : `python/main_bots.py`
  - Lance `bot_discord_server1.py` et `bot_discord_server2.py` en parallèle
  - Gestion d'erreurs optimisée
  - Optimisé pour hébergement cloud (Render.com / Fly.io)
- **Documentation d'hébergement** : Guide complet de déploiement sur Render.com
  - Configuration des services
  - Variables d'environnement
  - Vérification et debugging
  - Astuces pour optimiser le plan gratuit

### 🔄 Modifié

#### 🔒 Sécurité et Gestion des Fichiers
- **`.gitignore` amélioré** :
  - Exclusion renforcée des fichiers sensibles (`.env.local`, `.env.*.local`, `*.env`)
  - Exclusion des tokens (`*_token.txt`, `*_key.txt`)
  - Exclusion des fichiers d'exemple (`*.example`)
- **Organisation de la documentation** :
  - Fichiers de documentation déplacés dans `docs_perso/` (non versionné)
  - `.env.example` → `docs_perso/.env.example`
  - Guide de déploiement disponible localement uniquement

#### 📖 Documentation
- **README.md mis à jour** :
  - Section hébergement des bots avec recommandations
  - Architecture mise à jour avec `main_bots.py` et `render.yaml`
  - Lien vers le guide de déploiement Render.com

### 📦 Fichiers ajoutés

- `python/main_bots.py` - Launcher combiné pour les 2 bots Discord
- `render.yaml` - Configuration de déploiement Render.com
- `docs_perso/.env.example` - Template des variables d'environnement (non versionné)
- `docs_perso/DEPLOIEMENT_RENDER.md` - Guide complet de déploiement (non versionné)

---
## [1.0.2] - 2026-01-13

### ✨ Ajouté

#### 🌐 Hébergement et Déploiement
- **Configuration Render.com** : Fichier `render.yaml` pour déploiement automatique
  - Service 1 : Background Worker pour les 2 bots Discord combinés (750h/mois gratuit)
  - Service 2 : Web Service pour l'API Publisher (750h/mois gratuit)
  - Variables d'environnement configurables via dashboard
- **Launcher de bots combiné** : `python/main_bots.py`
  - Lance `bot_discord_server1.py` et `bot_discord_server2.py` en parallèle
  - Gestion d'erreurs optimisée
  - Optimisé pour hébergement cloud (Render.com / Fly.io)
- **Documentation d'hébergement** : Guide complet de déploiement sur Render.com
  - Configuration des services
  - Variables d'environnement
  - Vérification et debugging
  - Astuces pour optimiser le plan gratuit

### 🔄 Modifié

#### 🔒 Sécurité et Gestion des Fichiers
- **`.gitignore` amélioré** :
  - Exclusion renforcée des fichiers sensibles (`.env.local`, `.env.*.local`, `*.env`)
  - Exclusion des tokens (`*_token.txt`, `*_key.txt`)
  - Exclusion des fichiers d'exemple (`*.example`)
- **Organisation de la documentation** :
  - Fichiers de documentation déplacés dans `docs_perso/` (non versionné)
  - `.env.example` → `docs_perso/.env.example`
  - Guide de déploiement disponible localement uniquement

#### 📖 Documentation
- **README.md mis à jour** :
  - Section hébergement des bots avec recommandations
  - Architecture mise à jour avec `main_bots.py` et `render.yaml`
  - Lien vers le guide de déploiement Render.com

### 📦 Fichiers ajoutés

- `python/main_bots.py` - Launcher combiné pour les 2 bots Discord
- `render.yaml` - Configuration de déploiement Render.com
- `docs_perso/.env.example` - Template des variables d'environnement (non versionné)
- `docs_perso/DEPLOIEMENT_RENDER.md` - Guide complet de déploiement (non versionné)

---

## [1.0.1] - 2026-01-12

### ✨ Ajouté

#### 🎨 UX et Interface
- **Système de thèmes** : Basculer entre mode clair ☀️ et mode sombre 🌙 avec bouton dédié
  - Persistance du choix dans localStorage
  - Thème sombre inspiré de Le Nexus (couleurs riches et contrastées)
  - Adaptation automatique de tous les composants (inputs, selects, modales)
- **Validation visuelle** : Encadrement rouge du titre du post s'il est vide (aide à repérer les champs manquants)
- **Raccourcis clavier** :
  - `Ctrl+H` : Ouvrir l'historique des publications
  - `Ctrl+T` : Basculer entre thème clair/sombre
  - `Ctrl+Z` / `Ctrl+Y` : Undo/Redo dans le textarea Synopsis (historique de 50 états)
- **Icône Discord SVG** sur le bouton "Publier sur Discord" (remplace l'emoji 🚀)
- **Support formats d'images étendus** : AVIF, WebP, BMP, TIFF, SVG en plus de JPEG/PNG/GIF
- **Fonction de réinitialisation** : Bouton 🔄 dans la configuration pour remettre l'application à zéro (supprime localStorage et toutes les images)
- **Émojis sur tous les boutons** : Interface plus visuelle et cohérente
  - 🚪 Fermer - Ferme la modale
  - ❌ Annuler - Annule l'édition en cours
  - ✅ Enregistrer - Sauvegarde les modifications
  - ➕ Ajouter - Ajoute un nouvel élément
  - 📋 Copier le contenu - Copie le contenu d'un post pour créer un nouveau post
  - ✏️ Modifier - Charge un post pour modification
  - 🗑️ Supprimer - Supprime un élément

#### 🔒 UX des Modales
- **Fermeture par touche Échap** : Hook `useEscapeKey` pour toutes les modales
- **Verrouillage du scroll** : Hook `useModalScrollLock` empêche le scroll en arrière-plan
- **Sécurité anti-fermeture accidentelle** : Impossible de fermer en cliquant à l'extérieur de la modale
- **Hooks réutilisables** : `useEscapeKey.ts` et `useModalScrollLock.ts` pour cohérence

### 🔄 Modifié

#### 🎨 Interface et Cohérence
- **Palette de couleurs améliorée** : Application du thème de Le Nexus pour un rendu plus professionnel
  - Background: `#0f172a` → `#1e293b` (plus chaleureux)
  - Bordures solides `#334155` au lieu de transparentes
  - Accent indigo plus vif `#6366f1`
  - Couleurs success/error plus douces
- **Labels plus lisibles** : Assombrissement dans le thème clair (`#475569`)
- **Champs de saisie uniformisés** : Tous les inputs, selects et champs de recherche utilisent les mêmes styles
- **Placeholders cohérents** : Couleur adaptative selon le thème via variable CSS `--placeholder`
- **Select amélioré** : Option par défaut affichée en gris (couleur placeholder)
- **Suppression du titre "📝 Variables"** : Redondant car toutes les variables font partie du contenu par défaut

#### 📝 Templates
- **Variables corrigées** : Uniformisation des noms de variables dans les templates par défaut
  - `[Name_game]` → `[game_name]`
  - `[Game_version]` → `[game_version]`
  - `[Translate_version]` → `[translate_version]`
  - `[Game_link]` → `[game_link]`
  - `[Translate_link]` → `[translate_link]`
  - `[traductor]` → `[translator]`

#### 🎯 Boutons
- **Uniformisation complète** : Tous les boutons suivent la même logique
  - "🚪 Fermer" pour fermer les modales (plus de confusion avec Annuler)
  - "❌ Annuler" uniquement pour annuler une édition en cours
  - "✅ Enregistrer" sans émojis dupliqués (déjà ajouté par le système)
- **Clarification "Dupliquer"** : Renommé en "📋 Copier le contenu" pour clarifier qu'on copie le contenu, pas l'ID

#### 👁️ Preview
- **Espacement des titres** : Réduction drastique de l'espace sous les titres Markdown pour correspondre au rendu Discord
  - ### (h3) : 16px, marge bottom -4px
  - ## (h2) : 20px, marge bottom -6px
  - # (h1) : 24px, marge bottom -4px
  - Line-height réduit à 1.2 pour un rendu compact

#### 🖼️ Images
- **Support MIME types étendus** : Mapping complet pour AVIF, WebP, TIFF, SVG, ICO, BMP
- **Attribut accept étendu** : Input file accepte explicitement tous les formats modernes

### 🐛 Corrigé

- **Émojis dupliqués** : Retrait des émojis dans les messages `showToast` car le `ToastProvider` les ajoute automatiquement
  - ✅/❌/⚠️/ℹ️ ajoutés automatiquement selon le type (success/error/warning/info)
- **Double bouton Fermer** : Correction dans TemplatesModal (Annuler vs Fermer)
- **Section "Soutenez le Traducteur"** : Vérification de la présence dans le template "Mes traductions"

### 📦 Fichiers ajoutés

- `frontend/src/hooks/useEscapeKey.ts` - Hook de détection touche Échap
- `frontend/src/hooks/useModalScrollLock.ts` - Hook de verrouillage scroll
- `frontend/src/hooks/useUndoRedo.ts` - Hook pour gérer l'historique undo/redo
- `frontend/src/assets/discord-icon.svg` - Icône Discord officielle
- `docs_perso/roadmap.md` - Feuille de route des améliorations futures (non versionné)

---

## [1.0.0] - 2026-01-12

### 🎉 Première release officielle

Application Electron complète pour la gestion et publication de traductions Discord.

### ✨ Fonctionnalités principales

#### 🖥️ Application Electron
- **Application desktop native** avec Electron 25
- **Interface React 18 + TypeScript** avec Vite pour le build
- **IPC sécurisé** via preload.js avec contextIsolation
- **Hot-reload en développement** avec concurrently et wait-on
- **Build automatisé Windows** (.exe) avec electron-builder
- **Script de build** PowerShell avec nettoyage des caches

#### 📋 Gestion d'historique
- **Historique complet** de toutes les publications avec localStorage
- **Modification de posts Discord existants** via PATCH API
- **Mode édition** avec badge visuel et bouton "Mettre à jour"
- **Actions sur les posts** :
  - 🔗 Ouvrir sur Discord (lien direct)
  - ✏️ Modifier le post existant (titre, contenu, tags, image)
  - 📋 Dupliquer pour créer un nouveau post similaire
  - 🗑️ Supprimer de l'historique local
- **Affichage enrichi** : date, template, tags, aperçu du contenu

#### 🎨 Interface utilisateur
- **Design moderne** avec palette de couleurs sombre professionnelle
- **Templates personnalisables** avec types : Mes traductions, Partenaires, Autre
- **Variables dynamiques** avec support text et textarea
- **Preview en temps réel** avec rendu Markdown, BBCode et émojis Discord
- **Gestion d'images** améliorée :
  - Drag & drop sur toute la zone
  - Miniatures avec badge "⭐ Principale"
  - Définition de l'image principale par clic
- **Tags Discord** avec autocomplete
- **Boutons stylisés** pour sélection de template (remplacement des radio buttons)
- **Toasts notifications** pour feedback utilisateur
- **Modales de configuration** :
  - ⚙️ Configuration API
  - ✏️ Gestion des templates
  - 🏷️ Gestion des tags
  - 📝 Instructions de templates
  - 👥 Traducteurs (autocomplete)

#### 🔧 Backend et API
- **API Publisher** (`python/publisher_api.py`) :
  - `POST /api/forum-post` : Créer un nouveau post
  - `PATCH /api/forum-post/{thread_id}/{message_id}` : Modifier un post existant
  - Support multipart/form-data avec images
  - CORS configurables
  - Authentification par clé API (X-API-KEY)
- **Modification Discord** :
  - Mise à jour du titre du thread
  - Mise à jour des tags
  - Mise à jour du contenu du message
  - Ajout d'images (limitation Discord : empilement)

#### 📁 Structure et organisation
- **Dossier `python/`** : Scripts Python (bots + API) séparés
- **Dossier `frontend/`** : Application React TypeScript
- **Dossier `assets/`** : Ressources (icône .ico)
- **Composants React** modulaires :
  - `ContentEditor` : Éditeur principal avec mode édition
  - `HistoryModal` : Interface CRUD de l'historique
  - `ConfigModal`, `TemplatesModal`, `TagsModal`, etc.
  - `ToastProvider` : Système de notifications
  - `ConfirmModal` : Dialogues de confirmation
- **State management** avec React Context API (`appContext.tsx`)
- **Custom hooks** : `useConfirm`, `useImageLoader`, `useToast`

#### 🛠️ Outils de développement
- **Scripts npm** :
  - `npm run dev` : Développement avec hot-reload
  - `npm run build:frontend` : Build React seul
  - `npm run build:win` : Build exécutable Windows complet
  - `npm run test` : Vérification TypeScript
- **Script PowerShell** `build-windows.ps1` :
  - Nettoyage automatique des caches Electron
  - Build frontend + packaging
  - Affichage de progression avec emojis
- **Configuration TypeScript** stricte avec Vite

#### 📖 Documentation
- **README.md** complet et à jour :
  - Architecture détaillée
  - Guide d'installation
  - Guide d'utilisation
  - Structure des données
  - Scripts de développement
  - Déploiement
- **CHANGELOG.md** (ce fichier)

### 🔄 Modifié

#### Interface
- **Templates** : Remplacement des radio buttons par des boutons stylisés
- **Badge image principale** : "⭐ MAIN" → "⭐ Principale" (français)
- **Preview buttons** : Hauteur et style cohérents (32px)
- **Émojis Discord** : Dictionnaire étendu avec 200+ émojis
- **Conversion BBCode/Markdown** : Support amélioré pour Discord

#### Architecture
- **Configuration API** : Stockage sécurisé côté main process (`publisher_config.json`)
- **Historique** : localStorage côté renderer avec synchronisation
- **IPC handlers** : Support POST et PATCH dynamique
- **Format des posts** : Ajout de `threadId`, `messageId`, `discordUrl` pour édition

#### Scripts Python
- **Déplacement** : `bot_discord_server*.py` et `publisher_api.py` → `python/`
- **API Publisher** : Ajout endpoints PATCH pour modification
- **CORS** : Méthode PATCH ajoutée aux headers

### 🗑️ Supprimé

#### Fichiers obsolètes
- `Publication_template_discord.html` (interface HTML legacy)
- `styles.css` (styles de l'ancien HTML)
- `TEST_IMAGES_FS.md` et `TEST_VALIDATION.md` (docs de test)
- `IMPLEMENTATION_STATUS.md` (suivi de développement terminé)
- `GUIDE_HISTORIQUE.md` (intégré dans README)
- `README_ELECTRON.md` (fusionné dans README principal)
- `frontend/README.md` (redondant)
- `frontend/src/App.css` (intégré dans index.css)

#### Code
- **Fallback HTML** dans main.js (plus nécessaire)
- **Doublons d'émojis** dans ContentEditor (star, fire, joystick, battery)

### 🐛 Corrigé

- **TypeScript** : Toutes les erreurs de compilation résolues
- **ToastProvider** : Utilisation correcte de `showToast` au lieu de `addToast`
- **Fonctions historique** : Déclaration avant utilisation dans `appContext.tsx`
- **Propriétés dupliquées** : Nettoyage de l'objet `discordEmojis`

### 🔒 Sécurité

- **IPC contextIsolation** : Bridge sécurisé entre renderer et main process
- **Configuration API** : Clé stockée côté main, jamais exposée au renderer
- **CORS** : Configuration des origines autorisées dans l'API Python
- **Validation** : Vérification des champs obligatoires avant publication

### 📦 Dépendances

#### JavaScript/TypeScript
- `electron` ^25.0.0
- `react` ^18.2.0
- `typescript` ^5.x
- `vite` ^5.4.21
- `electron-builder` ^24.6.0
- `concurrently` ^8.2.2
- `wait-on` ^7.2.0
- `cross-env` ^7.0.3

#### Python
- `discord.py` >=2.3.0
- `aiohttp` >=3.8
- `python-dotenv` >=1.0.0

---

**Première version stable - Prête pour la production ! 🚀**

## Légende

- ✨ **Ajouté** : Nouvelles fonctionnalités
- 🔄 **Modifié** : Changements dans les fonctionnalités existantes
- 🗑️ **Supprimé** : Fonctionnalités retirées
- 🐛 **Corrigé** : Corrections de bugs
- 🔒 **Sécurité** : Correctifs de sécurité
- 📦 **Dépendances** : Mises à jour de dépendances
