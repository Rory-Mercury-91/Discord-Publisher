# ðŸš€ Guide de Maintenance : Bot Discord & API (Oracle Cloud)

Ce guide regroupe toutes les informations pour maintenir, mettre Ã  jour et dÃ©panner tes bots Discord hÃ©bergÃ©s sur ton instance Ubuntu Oracle Cloud.

---

## ðŸ“‚ Scripts PowerShell (Outils d'Administration)

Des scripts PowerShell sont disponibles dans le dossier **`outils_serveur/`** pour te faciliter la gestion du serveur sans taper de commandes SSH manuellement.

### ðŸŽ¯ Lancer le Menu Principal

Lance le menu interactif qui donne accÃ¨s Ã  toutes les fonctions :

```powershell
.\outils_serveur\0_SSH_Menu.ps1
```

**Options disponibles :**
- **[1]** Terminal SSH normal
- **[2]** Voir les logs en temps rÃ©el
- **[3]** Statut du service discord-bots
- **[4]** RedÃ©marrer le service
- **[5]** Tester l'API Publisher
- **[6]** VÃ©rifier le pare-feu (iptables)
- **[7]** Corriger le pare-feu (port 8080)
- **[8]** Nettoyer les rÃ¨gles iptables dupliquÃ©es

### ðŸ”— CrÃ©er un Raccourci Bureau (RecommandÃ©)

Pour accÃ©der rapidement au menu, crÃ©e un raccourci sur le bureau :

1. **Clic droit sur le Bureau** â†’ Nouveau â†’ Raccourci
2. **Cible :**
   ```
   powershell.exe -ExecutionPolicy Bypass -File "D:\Projet GitHub\Discord Publisher\outils_serveur\0_SSH_Menu.ps1"
   ```
3. **Nom :** `âš™ï¸ Gestion Serveur Ubuntu`
4. **IcÃ´ne :** Personnalise si tu veux (PropriÃ©tÃ©s â†’ Changer d'icÃ´ne)

Double-clic sur ce raccourci pour ouvrir le menu instantanÃ©ment ! ðŸŽ¯

---

## ðŸ”Œ Connexion SSH Manuelle (Optionnel)

Si tu prÃ©fÃ¨res te connecter manuellement sans les scripts :

```powershell
ssh -i "D:\Projet GitHub\Discord Publisher\python\_ignored\ssh-key-2026-02-07.key" ubuntu@138.2.182.125
```

**Raccourci** (si ta clÃ© SSH est configurÃ©e dans `~/.ssh/config`) :
```powershell
ssh ubuntu@138.2.182.125
```

**Note :** Les scripts PowerShell font Ã§a automatiquement et bien plus encore !

---

## ðŸ“ Structure du Projet sur le Serveur

- **RÃ©pertoire :** `/home/ubuntu/mon_projet/`
- **Environnement virtuel Python :** `/home/ubuntu/mon_projet/venv/`
- **Scripts Python :** `scripts/main_bots.py`, `scripts/publisher_api.py`, `scripts/bot_frelon.py`
- **Fichiers sensibles (ignorÃ©s par Git) :** `_ignored/` â€” contient `.env`, clÃ©s SSH, etc.
- **Logs :** `logs/bot.log` (rotation 5 Mo, 3 backups) â€” accessible via l'app (Voir les logs) ou `/api/logs`

Le fichier `.env` est chargÃ© depuis `_ignored/.env` en prioritÃ©, sinon depuis la racine `python/`.

---

## ðŸ› ï¸ ProcÃ©dure de Mise Ã  Jour du Code

### 1. ðŸ“¤ TransfÃ©rer les Fichiers avec WinSCP

**WinSCP** est l'outil recommandÃ© pour transfÃ©rer tes fichiers modifiÃ©s sur le serveur.

#### Installation de WinSCP
1. TÃ©lÃ©charge **WinSCP** : [https://winscp.net/](https://winscp.net/)
2. Installe-le sur ton PC Windows

#### Configuration de la Connexion
1. **Ouvre WinSCP**
2. **Protocole :** SFTP
3. **HÃ´te :** `138.2.182.125`
4. **Port :** `22`
5. **Utilisateur :** `ubuntu`
6. **ClÃ© privÃ©e :** Clique sur "AvancÃ©" â†’ SSH â†’ Authentification â†’ Parcourir
   - SÃ©lectionne ta clÃ© `.ppk` (si tu n'en as pas, convertis ton fichier `.key` avec PuTTYgen)
7. **Enregistre** la session pour ne pas tout refaire Ã  chaque fois !

#### TransfÃ©rer les Fichiers ModifiÃ©s
1. **Ã€ gauche :** Ton PC (navigue vers `D:\Projet GitHub\Discord Publisher\`)
2. **Ã€ droite :** Le serveur (navigue vers `/home/ubuntu/mon_projet/`)
3. **Glisse-dÃ©pose** les fichiers modifiÃ©s :
   - Scripts Python â†’ `/home/ubuntu/mon_projet/scripts/`
   - `.env` mis Ã  jour â†’ `/home/ubuntu/mon_projet/_ignored/`
   - `requirements.txt` â†’ `/home/ubuntu/mon_projet/`

âš ï¸ **IMPORTANT :** Ne jamais Ã©craser le dossier `venv/` sur le serveur !

---

### 2. ðŸ Installer les Nouvelles DÃ©pendances (Si besoin)

Si tu as modifiÃ© `requirements.txt`, connecte-toi au serveur et installe les nouvelles dÃ©pendances :

```bash
cd ~/mon_projet
source venv/bin/activate
pip install -r requirements.txt
```

Tu peux faire Ã§a en lanÃ§ant le script **`SSH_Terminal.ps1`** depuis le menu !

---

### 3. ðŸ”„ RedÃ©marrer le Service

AprÃ¨s avoir transfÃ©rÃ© les fichiers, redÃ©marre le service pour appliquer les changements :

**Via le Menu PowerShell :**
```powershell
.\outils_serveur\0_SSH_Menu.ps1
â†’ Choisis [4] RedÃ©marrer le service
```

**En SSH manuel :**
```bash
sudo systemctl restart discord-bots
```

---

### 4. âœ… VÃ©rifier que Tout Fonctionne

**Via le Menu PowerShell :**
```powershell
.\outils_serveur\0_SSH_Menu.ps1
â†’ Choisis [2] Voir les logs en temps rÃ©el
```

Les logs doivent montrer que les bots se connectent et dÃ©marrent correctement.

---

## âš™ï¸ DÃ©marrage Automatique (systemd)

Le service `discord-bots` est configurÃ© pour dÃ©marrer automatiquement au boot du serveur et redÃ©marrer en cas de crash.

### Commandes Utiles

| Action | Commande SSH |
|--------|-------------|
| DÃ©marrer les bots | `sudo systemctl start discord-bots` |
| ArrÃªter les bots | `sudo systemctl stop discord-bots` |
| RedÃ©marrer les bots | `sudo systemctl restart discord-bots` |
| Voir le statut | `sudo systemctl status discord-bots` |
| Voir les logs en direct | `sudo journalctl -u discord-bots -f` |

ðŸ’¡ **Astuce :** Utilise plutÃ´t le menu PowerShell pour faire tout Ã§a en un clic !

---

## ðŸŒ Configuration RÃ©seau & API

### URL de l'API

L'adresse actuelle de ton API : **`http://138.2.182.125:8080`**

- **Protocole :** HTTP (pas de HTTPS pour le moment)
- **Port :** 8080 (configurÃ© dans `main_bots.py`)

### Rappel des Ports Oracle

Si tu dois ouvrir un nouveau port ou si la connexion Ã©choue :

1. **Console Oracle Cloud :** RÃ©seau â†’ VCN â†’ Security Lists â†’ Ingress Rules (ajouter le port TCP)
2. **Pare-feu Linux (iptables) :** Utilise le script **`SSH_FixFirewall.ps1`** depuis le menu !

---

## ðŸ“‹ Diagnostic et DÃ©pannage

### ðŸ” Consulter les Logs

**MÃ©thode rapide (Menu PowerShell) :**
```powershell
.\outils_serveur\0_SSH_Menu.ps1 â†’ [2] Voir les logs en temps rÃ©el
```

**En SSH manuel :**
```bash
sudo journalctl -u discord-bots -f
```

Les logs affichent l'heure, le niveau (INFO, WARNING, ERROR) et le message. `CTRL + C` pour quitter.

---

### ðŸ§ª Tester l'API

**Via le Menu PowerShell :**
```powershell
.\outils_serveur\0_SSH_Menu.ps1 â†’ [5] Tester l'API Publisher
```

Le script teste automatiquement :
1. L'API depuis le serveur (localhost)
2. Si le port 8080 Ã©coute
3. L'API depuis Windows (externe)

---

### ðŸš¨ Erreurs Courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| **ModuleNotFoundError** | BibliothÃ¨que Python manquante | `pip install -r requirements.txt` puis redÃ©marre le service |
| **401 Unauthorized** | ClÃ© API incorrecte | VÃ©rifie que `PUBLISHER_API_KEY` dans `.env` = clÃ© dans l'app Tauri |
| **Connection Timeout** | Port bloquÃ© | Menu â†’ [6] VÃ©rifier le pare-feu, puis [7] Corriger si besoin |
| **Connection reset** | RÃ¨gle iptables dans le mauvais ordre | Menu â†’ [8] Nettoyer les rÃ¨gles iptables |

---

## âš ï¸ Points de Vigilance

- **Fichier `.env` :** Doit Ãªtre dans `_ignored/.env` (recommandÃ©) ou `python/.env`
  - Contient : `PORT=8080`, Supabase (URL + Service Role Key), tokens Discord
- **iptables :** AprÃ¨s un reboot, vÃ©rifie les rÃ¨gles avec le script [6] du menu
- **Espace disque :** Si les logs prennent trop de place : `sudo journalctl --vacuum-time=7d`

---

## ðŸ’¡ Workflow RecommandÃ© pour une Mise Ã  Jour

1. **Modifie le code** localement dans Cursor
2. **Ouvre WinSCP** et glisse-dÃ©pose les fichiers modifiÃ©s sur le serveur
3. **Lance le menu PowerShell** : `.\outils_serveur\0_SSH_Menu.ps1`
4. **Choisis [4]** RedÃ©marrer le service
5. **Choisis [2]** Voir les logs pour vÃ©rifier que tout dÃ©marre correctement
6. **Teste l'API** depuis l'application Tauri

âœ… C'est tout ! Pas besoin de commandes SSH complexes. ðŸŽ‰

---

## ðŸ“ž RÃ©sumÃ© Ultra-Rapide

| Besoin | Action |
|--------|--------|
| **GÃ©rer le serveur** | Lance `.\outils_serveur\0_SSH_Menu.ps1` |
| **TransfÃ©rer les fichiers** | WinSCP : glisse-dÃ©pose vers `/home/ubuntu/mon_projet/scripts/` |
| **RedÃ©marrer les bots** | Menu â†’ [4] |
| **Voir les logs** | Menu â†’ [2] |
| **Tester l'API** | Menu â†’ [5] |
| **ProblÃ¨me de connexion** | Menu â†’ [6] puis [7] ou [8] |

**Tu Ã©teins ton PC ?** Aucun souci : les bots tournent sur le serveur Oracle Cloud, pas sur ton PC ! ðŸš€

