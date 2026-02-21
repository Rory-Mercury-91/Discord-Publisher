# 🚀 Guide de Maintenance : Bot Discord & API (Oracle Cloud)

Ce guide regroupe toutes les informations pour maintenir, mettre à jour et dépanner tes bots Discord hébergés sur ton instance Ubuntu Oracle Cloud.

---

## 📂 Structure du Projet sur le Serveur

- **Répertoire :** `/home/ubuntu/mon_projet/`
- **Environnement virtuel Python :** `/home/ubuntu/mon_projet/venv/`
- **Scripts Python :** `/home/ubuntu/mon_projet/scripts/`
- **Fichiers sensibles (ignorés par Git) :** `_ignored/` — contient `.env`, clés SSH, etc.
- **Logs :** `logs/bot.log` (rotation 5 Mo, 3 backups) — accessible via l'app ou `/api/logs`

Le fichier `.env` est chargé depuis `_ignored/.env` en priorité, sinon depuis la racine `python/`.

### 🐍 Modules Python (`scripts/`)

| Fichier | Rôle |
|---------|------|
| `main_bots.py` | **Point d'entrée** — orchestre le démarrage de tous les bots et du serveur web |
| `bot_frelon.py` | **Bot Frelon** — rappels de publication F95fr sur création/MAJ de thread |
| `publisher_bot.py` | **Bot Publisher** — instanciation du bot + démarrage des tâches planifiées |
| `bot_lifecycle.py` | Gestion retry/backoff exponentiel des bots Discord |
| `config.py` | Configuration centrale (variables d'environnement, instance unique `config`) |
| `content_parser.py` | Parsing et normalisation du contenu texte des posts Discord (regex pures) |
| `discord_api.py` | Wrappers REST bas niveau vers l'API Discord (GET, POST, PATCH, DELETE) |
| `forum_manager.py` | Logique métier : création, mise à jour, suppression et re-routage de posts |
| `http_handlers.py` | Handlers HTTP aiohttp + `make_app()` — point d'entrée REST |
| `announcements.py` | Envoi des annonces Discord (nouvelle publication, MAJ, suppression) |
| `api_key_auth.py` | Validation et cache des clés API individuelles (Supabase + TTL mémoire) |
| `supabase_client.py` | Client Supabase + toutes les opérations CRUD |
| `scheduled_tasks.py` | Tâches planifiées (contrôle versions, nettoyage messages, sync jeux) |
| `slash_commands.py` | Commandes slash Discord (`/generer-cle`, `/check_versions`, `/cleanup_empty_messages`, `/check_help`) |
| `version_checker.py` | Contrôle des versions F95 via l'API checker.php + système anti-doublon |

---

## 📌 Scripts PowerShell (Outils d'Administration)

Des scripts PowerShell sont disponibles dans le dossier **`outils_serveur/`** pour gérer le serveur sans SSH manuel.

### 🎯 Lancer le Menu Principal

```powershell
.\outils_serveur\0_SSH_Menu.ps1
```

**Options disponibles :**
- **[1]** Terminal SSH normal
- **[2]** Voir les logs en temps réel
- **[3]** Statut du service discord-bots
- **[4]** Redémarrer le service
- **[5]** Tester l'API Publisher
- **[6]** Vérifier le pare-feu (iptables)
- **[7]** Corriger le pare-feu (port 8080)
- **[8]** Nettoyer les règles iptables dupliquées
- **[12]** Bloquer une IP malveillante
- **[13]** Lister les IP bloquées
- **[14]** Débloquer une IP
- **[15]** Analyser les logs (compter les IP)
- **[16]** Bloquer plusieurs IP d'un coup

### 🔗 Créer un Raccourci Bureau (Recommandé)

1. **Clic droit sur le Bureau** → Nouveau → Raccourci
2. **Cible :**
   ```
   powershell.exe -ExecutionPolicy Bypass -File "D:\Projet GitHub\Discord Publisher\outils_serveur\0_SSH_Menu.ps1"
   ```
3. **Nom :** `⚙️ Gestion Serveur Ubuntu`

---

## 📌 Connexion SSH Manuelle (Optionnel)

```powershell
ssh -i "D:\Projet GitHub\Discord Publisher\python\_ignored\ssh-key-2026-02-07.key" ubuntu@138.2.182.125
```

---

## 🛠️ Procédure de Mise à Jour du Code

### 1. 📤 Transférer les Fichiers avec WinSCP

**WinSCP** est l'outil recommandé : [https://winscp.net/](https://winscp.net/)

**Configuration :**
- **Protocole :** SFTP | **Hôte :** `138.2.182.125` | **Port :** `22` | **Utilisateur :** `ubuntu`
- **Clé privée :** Avancé → SSH → Authentification → sélectionne ta clé `.ppk`

**Fichiers à transférer :**
- Scripts Python → `/home/ubuntu/mon_projet/scripts/`
- `.env` mis à jour → `/home/ubuntu/mon_projet/_ignored/`
- `requirements.txt` → `/home/ubuntu/mon_projet/`

⚠️ **IMPORTANT :** Ne jamais écraser le dossier `venv/` sur le serveur !

---

### 2. 🐍 Installer les Nouvelles Dépendances (Si besoin)

Si tu as modifié `requirements.txt` :

```bash
cd ~/mon_projet
source venv/bin/activate
pip install -r requirements.txt
```

---

### 3. 🔄 Redémarrer le Service

**Via le Menu PowerShell :** option **[4]**

**En SSH manuel :**
```bash
sudo systemctl restart discord-bots
```

---

### 4. ✅ Vérifier que Tout Fonctionne

**Via le Menu PowerShell :** option **[2]** Voir les logs en temps réel

Les logs doivent montrer le démarrage des deux bots + le serveur REST :
```
[orchestrator] TOUS LES BOTS SONT OPERATIONNELS
[orchestrator]   Bot Frelon   : ...
[orchestrator]   PublisherBot : ...
[orchestrator]   API REST     : http://0.0.0.0:8080
```

---

## ⚙️ Démarrage Automatique (systemd)

Le service `discord-bots` démarre automatiquement au boot et redémarre en cas de crash.

| Action | Commande SSH |
|--------|-------------|
| Démarrer les bots | `sudo systemctl start discord-bots` |
| Arrêter les bots | `sudo systemctl stop discord-bots` |
| Redémarrer les bots | `sudo systemctl restart discord-bots` |
| Voir le statut | `sudo systemctl status discord-bots` |
| Voir les logs en direct | `sudo journalctl -u discord-bots -f` |

---

## 🌐 Configuration Réseau & API

**URL de l'API :** `http://138.2.182.125:8080`

### Routes disponibles

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/` ou `/api/status` | Health check + état rate limit Discord |
| GET | `/api/publisher/health` | Alias health check |
| POST | `/api/configure` | Mise à jour config en mémoire |
| POST | `/api/forum-post` | Créer un post dans le forum |
| POST | `/api/forum-post/update` | Mettre à jour un post (avec re-routage auto) |
| POST | `/api/forum-post/delete` | Supprimer un post + annonce |
| GET | `/api/history` | Historique des posts (Supabase) |
| GET | `/api/jeux` | Liste des jeux (cache Supabase → fallback API f95fr) |
| POST | `/api/account/delete` | Suppression de compte utilisateur |

### Rappel des Ports Oracle

Si tu dois ouvrir un nouveau port :
1. **Console Oracle Cloud :** Réseau → VCN → Security Lists → Ingress Rules
2. **Pare-feu Linux :** Menu PowerShell → [7] Corriger le pare-feu

---

## 🔑 Système de Clés API Individuelles

Chaque traducteur possède sa propre clé API générée via la commande slash `/generer-cle`.

**Fonctionnement :**
- La clé brute est générée en `tr_<32 hex chars>` et envoyée en MP Discord
- Seul le hash SHA-256 est stocké dans Supabase (table `api_keys`)
- Un cache mémoire TTL (5 min par défaut) évite les allers-retours Supabase
- L'ancienne clé est automatiquement révoquée à chaque renouvellement

**Clé legacy :** L'ancienne clé partagée (`PUBLISHER_API_KEY` dans `.env`) est encore supportée mais dépréciée — les utilisateurs reçoivent un avertissement pour migrer.

---

## 🤖 Commandes Slash Discord

| Commande | Description | Accès |
|----------|-------------|-------|
| `/generer-cle` | Génère ou renouvelle la clé API personnelle | Rôle Traducteur |
| `/check_versions` | Lance manuellement le contrôle des versions F95 | Rôle Traducteur |
| `/cleanup_empty_messages` | Supprime les messages vides dans les threads | Rôle Traducteur |
| `/check_help` | Affiche l'aide des commandes disponibles | Rôle Traducteur |

---

## 📅 Tâches Planifiées Automatiques

| Tâche | Fréquence | Heure (Europe/Paris) |
|-------|-----------|----------------------|
| Contrôle versions F95 | Quotidien | Configurable via `VERSION_CHECK_HOUR:VERSION_CHECK_MINUTE` |
| Nettoyage messages vides | Quotidien | Configurable via `CLEANUP_EMPTY_MESSAGES_HOUR:CLEANUP_EMPTY_MESSAGES_MINUTE` |
| Synchronisation jeux f95fr | Toutes les 2h | À `:30` (ex: 00:30, 02:30, 04:30…) |

---

## 🛡️ Sécurité : Blocage d'IP Malveillantes

### Détecter les Attaques

Les logs incluent désormais l'UUID utilisateur pour distinguer trafic légitime et attaques :
```
[REQUEST] 86.246.87.222 | abc-123-uuid | abc12345... | GET /health   ← Utilisateur légitime
[REQUEST] 204.76.203.210 | NULL | NOKEY | GET /../.env               ← Attaquant
```

### Bloquer / Gérer les IP

**Via le Menu PowerShell :**
- `[12]` Bloquer une IP | `[13]` Lister les IP bloquées | `[14]` Débloquer une IP
- `[15]` Analyser les logs (Top 20 IP, tentatives CONNECT, path traversal)
- `[16]` Bloquer plusieurs IP d'un coup

**En SSH manuel :**
```bash
sudo iptables -I INPUT 1 -s 204.76.203.210 -j DROP
sudo netfilter-persistent save
```

**Regex pour extraire les IP manuellement :**
```regex
\b(?:\d{1,3}\.){3}\d{1,3}\b
```

---

## 🔋 Diagnostic et Dépannage

### 🚨 Erreurs Courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| `ModuleNotFoundError` | Bibliothèque Python manquante | `pip install -r requirements.txt` puis redémarre |
| `401 Unauthorized` | Clé API incorrecte | Vérifier que la clé dans l'app correspond à celle en Supabase |
| `Connection Timeout` | Port bloqué | Menu → [6] Vérifier le pare-feu, puis [7] Corriger |
| `Connection reset` | Règle iptables dans le mauvais ordre | Menu → [8] Nettoyer les règles iptables |
| `Session is closed` | Session HTTP Discord fermée | Redémarrage automatique avec backoff — surveiller les logs |
| Bot Frelon absent au démarrage | `FRELON_DISCORD_TOKEN` manquant | Vérifier le `.env` dans `_ignored/` |
| Publisher Bot non démarré | `PUBLISHER_DISCORD_TOKEN` absent | Configurer via `/api/configure` ou `.env` (délai max 180s) |

---

## ⚠️ Points de Vigilance

- **Fichier `.env` :** Doit être dans `_ignored/.env` (recommandé) ou `python/.env`
  - Variables clés : `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, tokens Discord, `TRANSLATOR_ROLE_ID`, `PUBLISHER_FORUM_TRAD_ID`, `PUBLISHER_ANNOUNCE_CHANNEL_ID`, `PUBLISHER_MAJ_NOTIFICATION_CHANNEL_ID`
- **iptables :** Après un reboot, vérifier les règles avec le script [6] du menu
- **Espace disque :** Si les logs prennent trop de place : `sudo journalctl --vacuum-time=7d`
- **Ne jamais écraser `venv/`** lors des transferts WinSCP

---

## 💡 Workflow Recommandé pour une Mise à Jour

1. **Modifie le code** localement dans Cursor
2. **Ouvre WinSCP** et glisse-dépose les fichiers modifiés dans `/home/ubuntu/mon_projet/scripts/`
3. **Lance le menu PowerShell** : `.\outils_serveur\0_SSH_Menu.ps1`
4. **Choisis [4]** Redémarrer le service
5. **Choisis [2]** Voir les logs pour vérifier le démarrage
6. **Teste l'API** depuis l'application Tauri

✅ C'est tout ! 🎉

---

## 📞 Résumé Ultra-Rapide

| Besoin | Action |
|--------|--------|
| **Gérer le serveur** | Lance `.\outils_serveur\0_SSH_Menu.ps1` |
| **Transférer les fichiers** | WinSCP → `/home/ubuntu/mon_projet/scripts/` |
| **Redémarrer les bots** | Menu → [4] |
| **Voir les logs** | Menu → [2] |
| **Tester l'API** | Menu → [5] |
| **Problème de connexion** | Menu → [6] puis [7] ou [8] |
| **Bloquer une IP malveillante** | Menu → [12] |
| **Voir les IP bloquées** | Menu → [13] |
| **Analyser les logs (IP suspectes)** | Menu → [15] |
| **Bloquer plusieurs IP** | Menu → [16] |

**Tu éteins ton PC ?** Aucun souci : les bots tournent sur le serveur Oracle Cloud, pas sur ton PC ! 🚀
