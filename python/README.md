# 🚀 Guide de Maintenance : Bot Discord & API (Oracle Cloud)

Ce guide explique comment mettre à jour, redémarrer et maintenir tes bots hébergés sur ton instance Ubuntu Oracle Cloud.

---

## 🔌 Connexion SSH au serveur

Depuis **PowerShell** ou **Windows Terminal** :

```powershell
ssh -i "D:\Projet GitHub\Discord Publisher\python\_ignored\ssh-key-2026-02-07.key" ubuntu@138.2.182.125
```

- Remplace `C:\chemin\vers\ta_cle.pem` par le chemin de ta clé privée (fichier `.pem` ou `.key` généré par Oracle Cloud).
- Si ta clé est en `.ppk` : utilise **PuTTY** ou convertis-la en `.pem` avec PuTTYgen.
- **Erreur « bad permissions »** : exécute dans PowerShell : `icacls "C:\chemin\vers\ta_cle.key" /inheritance:r` puis `icacls "C:\chemin\vers\ta_cle.key" /grant:r "%USERNAME%:(R)"` (ou utilise `cmd /c '...'` si la 2ᵉ commande échoue).

**Raccourci** (si ta clé est déjà configurée dans `~/.ssh/`) :

```powershell
ssh ubuntu@138.2.182.125
```

---

## 🪟 Organisation des fenêtres (3 écrans)

Pour travailler efficacement, ouvre **3 fenêtres** :

| Fenêtre | Rôle | À faire |
|---------|------|---------|
| **1. Logs Python** | Voir les logs du bot en direct | SSH → `sudo journalctl -u discord-bots -f` |
| **2. Terminal Ubuntu** | Lancer des commandes sur le serveur | SSH → session normale (tcpdump, ss, curl localhost, etc.) |
| **3. Terminal Windows** | Tester depuis ton PC | PowerShell (curl.exe, Test-NetConnection) |

### Étapes

1. **Fenêtre 1 (Logs)** : Connexion SSH → `sudo journalctl -u discord-bots -f` (ne pas fermer, les logs défilent ici).
2. **Fenêtre 2 (Ubuntu)** : Nouvelle connexion SSH → `cd ~/mon_projet` pour exécuter des commandes.
3. **Fenêtre 3 (Windows)** : Ouvre PowerShell ou Windows Terminal en local pour les tests réseau.

---

## 📁 Structure du Projet sur le Serveur

- **Répertoire :** `/home/ubuntu/mon_projet/`
- **Environnement virtuel :** `/home/ubuntu/mon_projet/venv/`
- **Scripts :** `scripts/main_bots.py`, `scripts/publisher_api.py`, `scripts/bot_frelon.py`
- **Fichiers sensibles (ignorés par Git) :** `_ignored/` — y mettre `.env`, clés SSH (`.key`, `.ppk`), etc.
- **Logs :** `logs/bot.log` (rotation 5 Mo, 3 backups) — consultable via l'app (admin → Voir les logs) ou `/api/logs`

Le fichier `.env` est chargé depuis `_ignored/.env` en priorité, sinon depuis la racine `python/`.

---

## ⚙️ Démarrage automatique (systemd)

Pour que les bots démarrent au boot et redémarrent en cas de crash :

### 1. Installer le service (une seule fois)

Sur le serveur, copie le fichier `discord-bots.service` dans `/home/ubuntu/mon_projet/`, puis :

```bash
sudo cp /home/ubuntu/mon_projet/discord-bots.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable discord-bots
sudo systemctl start discord-bots
```

### 2. Commandes utiles

| Action | Commande |
|--------|----------|
| Démarrer les bots | `sudo systemctl start discord-bots` |
| Arrêter les bots | `sudo systemctl stop discord-bots` |
| Redémarrer les bots | `sudo systemctl restart discord-bots` |
| Statut | `sudo systemctl status discord-bots` |
| Voir les logs en direct | `sudo journalctl -u discord-bots -f` |

---

## 🛠️ Procédure de Mise à Jour

Dès que tu modifies ton code localement dans Cursor, suis ces étapes pour appliquer les changements sur le serveur.

### 1. Transférer les fichiers (WinSCP)

1. Connecte-toi à ton serveur via **WinSCP** (Port 22, utilisateur `ubuntu`, avec ta clé `.ppk`).
2. Fais glisser les fichiers modifiés :
   - Scripts Python → `/home/ubuntu/mon_projet/scripts/`
   - `.env` et clés SSH → `/home/ubuntu/mon_projet/_ignored/`
   - `requirements.txt` → `/home/ubuntu/mon_projet/`
3. **Note :** N'écrase jamais le dossier `venv`.

### 2. Si tu as modifié `requirements.txt`

Sur le serveur, avant de redémarrer :

```bash
cd ~/mon_projet
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Relancer les Bots

```bash
sudo systemctl restart discord-bots
```

---

## 🌐 Configuration Réseau & API

### URL de l'API (Frontend)

L'adresse actuelle de ton API est : **`http://138.2.182.125:8080`**

- **Protocole :** HTTP (pas de HTTPS pour le moment)
- **Port :** 8080 (configuré dans `main_bots.py`)

### Rappel des ports Oracle

Si tu dois changer de port ou si la connexion échoue, vérifie que le port est ouvert à deux endroits :

1. **Console Oracle Cloud :** Réseau → VCN → Security Lists → Ingress Rules (ajouter le port TCP)
2. **Pare-feu Linux (IPTables) :** La règle doit être **avant** la règle REJECT :
   ```bash
   sudo iptables -I INPUT 1 -p tcp --dport 8080 -j ACCEPT
   sudo netfilter-persistent save
   ```

---

## 📜 Antisèche des commandes utiles

| Action | Commande |
|--------|----------|
| Se connecter au dossier | `cd ~/mon_projet` |
| Activer l'environnement (si besoin) | `cd ~/mon_projet` puis `source venv/bin/activate` |
| Voir les bots qui tournent | `sudo systemctl status discord-bots` |
| Voir les logs en direct | `sudo journalctl -u discord-bots -f` |
| Vérifier l'utilisation du port | `sudo ss -tunlp \| grep 8080` |

---

## 📋 Diagnostic et Logs

Les logs sont essentiels pour diagnostiquer les problèmes : si le bot s'arrête ou se comporte bizarrement, la réponse est souvent écrite dedans.

### 1. Consulter les logs en temps réel

```bash
sudo journalctl -u discord-bots -f
```

Les messages s'affichent au fur et à mesure, avec l'heure et le niveau (INFO, ERROR). `CTRL + C` pour quitter.

### 2. Tester la connexion (depuis le serveur)

```bash
curl http://127.0.0.1:8080/api/publisher/health
```

Si ça renvoie du JSON avec `"ok": true`, l'API fonctionne en local.

### 3. Vérifier si le port écoute

Si ton application Tauri n'arrive pas à joindre le serveur, vérifie que l'API écoute bien :

```bash
sudo ss -tunlp | grep 8080
```

Si tu vois `0.0.0.0:8080` et `LISTEN`, l'API écoute. Le problème vient alors du pare-feu (iptables ou Oracle Security List).

### 4. Tester depuis ton PC (PowerShell)

```powershell
curl.exe http://138.2.182.125:8080/api/publisher/health
```

Réponse attendue : `{"ok": true, "configured": true, ...}`

### 5. Erreurs courantes

| Erreur | Cause probable | Solution |
|--------|----------------|----------|
| **ModuleNotFoundError** | Bibliothèque manquante | `pip install -r requirements.txt` puis `sudo systemctl restart discord-bots` |
| **401 Unauthorized** | Clé API incorrecte | Vérifier que `PUBLISHER_API_KEY` dans `.env` = clé saisie dans l'app Tauri |
| **Connection Timeout** | Port bloqué | Security List Oracle + `sudo iptables -I INPUT 1 -p tcp --dport 8080 -j ACCEPT` puis `sudo netfilter-persistent save` |
| **Connection reset** (curl/ERR_CONNECTION_RESET) | Règle iptables REJECT avant ACCEPT 8080 | `sudo iptables -I INPUT 1 -p tcp --dport 8080 -j ACCEPT` puis `sudo netfilter-persistent save` |

---

## ⚠️ Points de vigilance

- **Le fichier `.env` :** Place-le dans `_ignored/` (recommandé) ou à la racine `python/`. Il doit contenir `PORT=8080`, Supabase (URL + Service Role Key) et les tokens des bots.
- **API Discord directe :** Le code utilise `https://discord.com/api/v10` (aucun proxy).
- **iptables :** Après un reboot, vérifie que la règle 8080 est toujours en place : `sudo iptables -L INPUT -n -v --line-numbers`. Si absente, relance `sudo iptables -I INPUT 1 -p tcp --dport 8080 -j ACCEPT` puis `sudo netfilter-persistent save`.
- **Espace disque :** Si les logs journalctl prennent de la place : `sudo journalctl --vacuum-time=7d` pour garder 7 jours.

---

## 💡 En résumé

| Situation | Action |
|-----------|--------|
| Mise à jour du code | WinSCP (transfert) → `sudo systemctl restart discord-bots` |
| Mise à jour requirements.txt | `pip install -r requirements.txt` puis `sudo systemctl restart discord-bots` |
| Voir les logs | `sudo journalctl -u discord-bots -f` |
| L'API ne répond pas | Vérifier iptables + Security List + `sudo systemctl status discord-bots` |
| Tu éteins ton PC | Aucun souci : les bots tournent sur le serveur Oracle, pas sur ton PC |
