# 🔄 Configuration du système d'auto-update Tauri

Ce guide explique comment configurer le système de mise à jour automatique pour l'application Discord Publisher.

## 📋 Prérequis

- Compte GitHub avec accès au repository
- Clés de signature Tauri (à générer une seule fois)
- Webhooks Discord configurés (optionnel, pour les notifications)

## 🔑 Étape 1 : Générer les clés de signature

Les clés de signature garantissent que seules les mises à jour officielles peuvent être installées.

### Génération des clés

```powershell
# Naviguer vers le projet
cd "d:\Projet GitHub\Discord Publisher"

# Générer la paire de clés (will prompt for password)
npm run tauri signer generate
```

La commande va créer deux clés :
- **Clé privée** : À garder **SECRÈTE** (sera stockée dans GitHub Secrets)
- **Clé publique** : À ajouter dans `tauri.conf.json`

### Format de sortie

```
Generating key pair...

✓ Private key: dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5CkJ...
✓ Public key: dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEFDNEE...

Keys saved to: C:\Users\[USERNAME]\.tauri\[timestamp].key
```

**⚠️ IMPORTANT :**
1. **Copier la clé publique** (commence par `dW50cnVzdGVk...`)
2. **Copier la clé privée** dans un fichier sécurisé temporaire
3. **NE JAMAIS commit la clé privée dans Git**

## 📝 Étape 2 : Configurer tauri.conf.json

La clé publique est déjà configurée dans `src-tauri/tauri.conf.json`.

Si vous devez la mettre à jour :

```json
{
  "bundle": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://github.com/TON-USERNAME/Discord-Publisher/releases/latest/download/latest.json"
      ],
      "pubkey": "VOTRE_CLE_PUBLIQUE_ICI"
    }
  }
}
```

**Remplacez** :
- `TON-USERNAME` par votre nom d'utilisateur GitHub
- `VOTRE_CLE_PUBLIQUE_ICI` par la clé publique générée à l'étape 1

## 🔐 Étape 3 : Configurer les GitHub Secrets

Aller dans : **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

### Secrets requis

| Nom | Valeur | Description |
|-----|--------|-------------|
| `TAURI_SIGNING_PRIVATE_KEY` | `dW50cnVzdGVkIGNvb...` | Clé privée de signature |
| `TAURI_KEY_PASSWORD` | `votre_mot_de_passe` | Mot de passe de la clé privée (si défini) |
| `DISCORD_WEBHOOK_URL` | `https://discord.com/api/webhooks/...` | Webhook Discord pour notifications (optionnel) |

### Comment créer un webhook Discord

1. Aller dans les paramètres du serveur Discord → **Intégrations** → **Webhooks**
2. Cliquer sur **Nouveau webhook**
3. Choisir le canal (ex: `#releases` ou `#dev-updates`)
4. Copier l'URL du webhook
5. Ajouter l'URL dans les GitHub Secrets

## 🚀 Étape 4 : Workflow GitHub Actions

Le workflow `.github/workflows/release.yml` est déjà configuré et se déclenchera automatiquement lors de la création d'un tag Git.

### Créer une nouvelle release

```powershell
# 1. Bumper la version (met à jour package.json et tauri.conf.json)
npm run bump-version

# 2. Commit les changements
git add .
git commit -m "chore: bump version to 1.3.0"

# 3. Créer un tag Git
git tag v1.3.0

# 4. Push le tag (déclenche le build automatique)
git push origin main --tags
```

Le workflow va automatiquement :
1. ✅ Build pour Windows (NSIS installer)
2. ✅ Signer l'installateur avec la clé privée
3. ✅ Créer une GitHub Release avec les fichiers
4. ✅ Générer `latest.json` pour l'updater
5. ✅ Envoyer une notification Discord (si configuré)

## 📱 Étape 5 : Tester l'auto-update

### En développement

L'auto-update ne fonctionne **PAS** en mode dev (`npm run dev`). Il faut tester avec une version compilée.

### Test complet

1. **Installer une ancienne version** :
   - Build version 1.2.0 : `npm run build:win`
   - Installer l'app

2. **Créer une nouvelle release** :
   - Bumper vers 1.3.0
   - Push le tag : `git push origin v1.3.0`
   - Attendre la fin du build GitHub Actions (~10 min)

3. **Lancer l'ancienne version installée** :
   - Au démarrage, une notification doit apparaître
   - "Une nouvelle version (1.3.0) est disponible"
   - Cliquer sur "Installer" → téléchargement en arrière-plan
   - L'app redémarre automatiquement après installation

## 🔧 Dépannage

### La notification ne s'affiche pas

- **Vérifier** : Ouvrir la console DevTools (F12)
- **Symptôme** : Erreur `Failed to fetch update`
- **Causes possibles** :
  1. L'URL dans `tauri.conf.json` est incorrecte
  2. Pas de release GitHub publiée
  3. Le fichier `latest.json` n'existe pas

### L'installation échoue

- **Erreur** : `Signature verification failed`
- **Cause** : La clé publique dans `tauri.conf.json` ne correspond pas à la clé privée utilisée pour signer
- **Solution** : Régénérer les clés ET rebuild une release avec la nouvelle clé privée

### Mode debug

Activer les logs détaillés dans le composant `UpdateNotification.tsx` :

```typescript
console.log('[Updater] Checking for updates...');
const update = await checkUpdate();
console.log('[Updater] Update available:', update.shouldUpdate);
console.log('[Updater] Current:', update.currentVersion);
console.log('[Updater] Latest:', update.manifest?.version);
```

## 📚 Ressources

- [Tauri Updater Documentation](https://tauri.app/v1/guides/distribution/updater/)
- [GitHub Actions for Tauri](https://tauri.app/v1/guides/building/cross-platform/#github-actions)
- [Code Signing Best Practices](https://tauri.app/v1/guides/distribution/sign-windows)

---

**Dernier test** : 9 février 2026  
**Version actuelle** : 1.2.2
