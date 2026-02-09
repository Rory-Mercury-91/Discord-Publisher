# 🚀 Guide rapide : Première configuration de l'auto-update

Ce guide vous accompagne pour configurer l'auto-update pour la première fois.

## ⚡ Étapes rapides

### 1️⃣ Générer les clés de signature

```powershell
cd "d:\Projet GitHub\Discord Publisher"
npm run tauri signer generate
```

**Résultat attendu** :
```
Generating key pair...
Enter password (or press Enter for no password): [ENTRÉE]

✓ Private key: dW50cnVzdGVkIGNvbW1lbnQ6IH...
✓ Public key: dW50cnVzdGVkIGNvbW1lbnQ6IG...
```

**⚠️ Actions immédiates** :
1. **Copier la clé publique** (commence par `dW50cnV...`)
2. **Copier la clé privée** dans un fichier temporaire **SÉCURISÉ**

### 2️⃣ Configurer tauri.conf.json

Ouvrir `src-tauri/tauri.conf.json` et remplacer :

```json
"updater": {
  "endpoints": [
    "https://github.com/VOTRE_USERNAME_GITHUB/Discord-Publisher/releases/latest/download/latest.json"
  ],
  "pubkey": "REMPLACER_PAR_VOTRE_CLE_PUBLIQUE_GENEREE"
}
```

Par :

```json
"updater": {
  "endpoints": [
    "https://github.com/RoryMercury91/Discord-Publisher/releases/latest/download/latest.json"
  ],
  "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEFDNEE..."
}
```

**💡 Remplacer** :
- `RoryMercury91` par votre username GitHub
- `dW50cnV...` par votre clé publique générée

### 3️⃣ Configurer les GitHub Secrets

Dans GitHub : **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Créer **3 à 5 secrets** :

| Nom | Valeur | Obligatoire |
|-----|--------|-------------|
| `TAURI_SIGNING_PRIVATE_KEY` | Coller la clé privée complète | ✅ OUI |
| `VITE_SUPABASE_URL` | URL de votre projet Supabase | ✅ OUI |
| `VITE_SUPABASE_ANON_KEY` | Clé anon/public de Supabase | ✅ OUI |
| `TAURI_KEY_PASSWORD` | Mot de passe de la clé (si défini) | ⚪ Si MDP |
| `DISCORD_WEBHOOK_URL` | `https://discord.com/api/webhooks/[VOTRE_WEBHOOK]` | ⚪ Optionnel |

**📋 Guide détaillé** : [GITHUB_SECRETS.md](./GITHUB_SECRETS.md)

**Comment obtenir les valeurs Supabase** :
1. Aller sur [Supabase Dashboard](https://app.supabase.com)
2. Sélectionner votre projet
3. **Settings** → **API**
4. Copier :
   - **Project URL** → `VITE_SUPABASE_URL`
   - **Project API keys** → `anon` `public` → `VITE_SUPABASE_ANON_KEY`

**Comment créer le webhook Discord** :
1. Serveur Discord → Paramètres → Intégrations → Webhooks
2. Nouveau webhook → Choisir canal (ex: `#releases`)
3. Copier l'URL → Ajouter dans GitHub Secrets

### 4️⃣ Installer les dépendances Rust

```powershell
cd src-tauri
cargo fetch
```

Cela va télécharger `tauri-plugin-process` automatiquement.

### 5️⃣ Tester la configuration

```powershell
# Compiler l'app en mode release
npm run build:win
```

Si aucune erreur → **Configuration réussie** ✅

### 6️⃣ Créer votre première release

```powershell
# 1. Bumper la version
npm run bump-version
# Choisir : [1] patch, [2] minor, ou [3] major

# 2. Commit
git add .
git commit -m "chore: bump version to 1.3.0"

# 3. Créer le tag
git tag v1.3.0

# 4. Push (déclenche le build automatique)
git push origin main --tags
```

**⏱️ Durée du build** : ~10 minutes

**✅ Vérifications** :
1. Aller sur GitHub → Actions → Voir le workflow en cours
2. Attendre la fin du build
3. Aller sur Releases → Voir la nouvelle release

### 7️⃣ Tester l'auto-update

1. **Installer** la version compilée localement (1.2.2)
2. **Lancer** l'application
3. **Attendre** 5-10 secondes → Notification doit apparaître
4. **Cliquer** sur "Installer" → Téléchargement automatique
5. **Redémarrage** automatique après installation

## 🔧 Dépannage rapide

### Erreur "Signature verification failed"

**Cause** : Clé publique dans `tauri.conf.json` ≠ clé privée dans GitHub Secrets

**Solution** :
1. Régénérer les clés : `npm run tauri signer generate`
2. Mettre à jour `tauri.conf.json` avec la nouvelle clé publique
3. Mettre à jour le secret `TAURI_SIGNING_PRIVATE_KEY` dans GitHub
4. Recréer une release

### Build GitHub Actions échoue

**Vérifier** :
- ✅ Les 2 secrets sont bien créés dans GitHub
- ✅ Le fichier `.github/workflows/release.yml` existe
- ✅ La clé privée est complète (commence par `dW50cnV...`)
- ✅ Le tag Git est bien poussé : `git push origin --tags`

### La notification ne s'affiche pas

**Causes possibles** :
1. Mode dev (`npm run dev`) → Auto-update désactivé en dev
2. Pas de release GitHub publiée
3. URL dans `tauri.conf.json` incorrecte

**Solution** : Compiler en mode release et tester : `npm run build:win`

## 📋 Checklist finale

- [ ] Clés générées et sauvegardées
- [ ] `tauri.conf.json` configuré avec la clé publique
- [ ] GitHub Secrets créés (TAURI_SIGNING_PRIVATE_KEY + DISCORD_WEBHOOK_URL)
- [ ] Dépendances Rust installées (`cargo fetch`)
- [ ] Build local réussit (`npm run build:win`)
- [ ] Première release créée et publiée sur GitHub
- [ ] Test d'installation réussi

## 📚 Documentation complète

Pour plus de détails : [AUTO_UPDATE_SETUP.md](./AUTO_UPDATE_SETUP.md)

---

**Date de création** : 9 février 2026  
**Testé avec** : Tauri 2.9.5, Windows 10/11
