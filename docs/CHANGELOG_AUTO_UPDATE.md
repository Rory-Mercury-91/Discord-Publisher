# 📝 Résumé des modifications - Auto-Update Tauri + Fix UI

## ✅ Modifications effectuées

### 1. **Correction du bouton Fermer dans InstructionsManagerModal**

**Fichier modifié** : `frontend/src/components/InstructionsManagerModal.tsx`

**Problème** : Le bouton "🚪 Fermer" était à l'intérieur de la section collapsible d'ajout d'instruction, donc invisible quand la section était fermée.

**Solution** : Déplacé le bouton dans un footer permanent en dehors de la section collapsible.

```tsx
// Avant : dans {addSectionOpen && (...)}
<button onClick={onClose}>🚪 Fermer</button>

// Après : footer permanent toujours visible
<div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px', ... }}>
  <button onClick={onClose} style={{ padding: '8px 20px', fontWeight: 600 }}>
    🚪 Fermer
  </button>
</div>
```

---

### 2. **Système d'auto-update Tauri complet**

#### A. Configuration backend (Rust)

**Fichiers modifiés** :
- `src-tauri/Cargo.toml` : Ajout des plugins `tauri-plugin-process` et `tauri-plugin-updater`
- `src-tauri/src/lib.rs` : Enregistrement des plugins dans le builder Tauri

```rust
.plugin(tauri_plugin_log::Builder::new().build())
.plugin(tauri_plugin_process::init())
.plugin(tauri_plugin_updater::Builder::new().build())
```

#### B. Configuration Tauri

**Fichier modifié** : `src-tauri/tauri.conf.json`

Ajout de la section updater :

```json
"updater": {
  "active": true,
  "endpoints": [
    "https://github.com/VOTRE_USERNAME_GITHUB/Discord-Publisher/releases/latest/download/latest.json"
  ],
  "pubkey": "REMPLACER_PAR_VOTRE_CLE_PUBLIQUE_GENEREE",
  "windows": {
    "installMode": "passive"
  }
}
```

**⚠️ À FAIRE** : Remplacer `VOTRE_USERNAME_GITHUB` et `REMPLACER_PAR_VOTRE_CLE_PUBLIQUE_GENEREE`

#### C. Frontend (React)

**Fichiers créés** :
- `frontend/src/components/UpdateNotification.tsx` : Composant de notification de mise à jour

**Fichiers modifiés** :
- `frontend/src/App.tsx` : Ajout du composant UpdateNotification
- `frontend/package.json` : Ajout des dépendances `@tauri-apps/plugin-updater` et `@tauri-apps/plugin-process`

**Fonctionnalités** :
- ✅ Vérification automatique au démarrage
- ✅ Notification visuelle (coin supérieur droit)
- ✅ Téléchargement et installation en un clic
- ✅ Redémarrage automatique après installation
- ✅ Option "Plus tard" (revérifie dans 24h)

#### D. GitHub Actions Workflow

**Fichier créé** : `.github/workflows/release.yml`

**Déclenchement** : Push d'un tag Git (`v*.*.*`)

**Actions automatiques** :
1. ✅ Build Windows (NSIS installer)
2. ✅ Signature avec la clé privée
3. ✅ Création de la GitHub Release
4. ✅ Upload des fichiers (`.exe`, `.nsis.zip`, `.nsis.zip.sig`)
5. ✅ Génération automatique de `latest.json`
6. ✅ Notification Discord (si webhook configuré)

**Notification Discord** :
- ✅ Embed avec version, plateforme, statut
- ✅ Lien direct vers la release
- ✅ Notification d'échec en cas d'erreur

#### E. Documentation

**Fichiers créés** :
- `docs/AUTO_UPDATE_SETUP.md` : Guide complet détaillé
- `docs/QUICK_START_AUTO_UPDATE.md` : Guide rapide de configuration

---

## 🔐 Configuration requise (À FAIRE)

### 1. Générer les clés de signature

```powershell
cd "d:\Projet GitHub\Discord Publisher"
npm run tauri signer generate
```

**Résultat** : Clé publique + Clé privée

### 2. Mettre à jour `tauri.conf.json`

Remplacer dans `src-tauri/tauri.conf.json` :
- `VOTRE_USERNAME_GITHUB` → Votre username GitHub
- `REMPLACER_PAR_VOTRE_CLE_PUBLIQUE_GENEREE` → Clé publique générée

### 3. Configurer les GitHub Secrets

Dans GitHub : **Settings** → **Secrets and variables** → **Actions**

Créer 2 secrets :

| Nom | Description |
|-----|-------------|
| `TAURI_SIGNING_PRIVATE_KEY` | Clé privée complète (générée à l'étape 1) |
| `DISCORD_WEBHOOK_URL` | URL du webhook Discord pour notifications (optionnel) |

### 4. Créer le webhook Discord (optionnel)

1. Serveur Discord → Paramètres → Intégrations → Webhooks
2. Nouveau webhook → Canal : `#releases` ou `#dev-updates`
3. Copier l'URL → Ajouter dans GitHub Secrets

---

## 🚀 Workflow de release

```powershell
# 1. Bumper la version
npm run bump-version
# Choisir : [1] patch (1.2.2 → 1.2.3)
#          [2] minor (1.2.2 → 1.3.0)
#          [3] major (1.2.2 → 2.0.0)

# 2. Commit
git add .
git commit -m "chore: bump version to 1.3.0"

# 3. Créer le tag
git tag v1.3.0

# 4. Push (déclenche le build GitHub Actions)
git push origin main --tags
```

**Temps de build** : ~10 minutes

**Résultat** :
- Release GitHub créée automatiquement
- Fichiers `.exe` et `.nsis.zip` uploadés
- Notification Discord envoyée
- `latest.json` généré pour l'updater

---

## 🧪 Test de l'auto-update

### Pré-requis
- Version actuelle installée : 1.2.2
- Nouvelle release publiée : 1.3.0

### Procédure

1. **Lancer** l'application (version 1.2.2)
2. **Attendre** 5-10 secondes
3. **Notification** apparaît en haut à droite
4. **Cliquer** sur "📥 Installer"
5. **Téléchargement** automatique en arrière-plan
6. **Redémarrage** automatique après installation
7. **Vérifier** la version dans l'interface : `v1.3.0`

---

## 📦 Dépendances ajoutées

### Frontend (`frontend/package.json`)

```json
"@tauri-apps/plugin-process": "^2",
"@tauri-apps/plugin-updater": "^2"
```

Installation : `cd frontend && npm install`

### Backend (`src-tauri/Cargo.toml`)

```toml
tauri-plugin-process = "2"
tauri-plugin-updater = "2"
```

Installation : `cd src-tauri && cargo fetch`

---

## 🔧 Dépannage

### Erreur "Signature verification failed"

**Cause** : Clé publique ≠ Clé privée

**Solution** :
1. Régénérer les clés
2. Mettre à jour `tauri.conf.json`
3. Mettre à jour GitHub Secret `TAURI_SIGNING_PRIVATE_KEY`
4. Recréer une release

### La notification ne s'affiche pas

**Vérifier** :
- ✅ Mode release (pas dev)
- ✅ Release GitHub publiée
- ✅ URL correcte dans `tauri.conf.json`
- ✅ Console : `[Updater] Checking for updates...`

### Build GitHub Actions échoue

**Vérifier** :
- ✅ Secrets GitHub configurés
- ✅ Clé privée complète
- ✅ Tag Git poussé : `git push origin --tags`
- ✅ Workflow existe : `.github/workflows/release.yml`

---

## 📋 Checklist de déploiement

- [ ] InstructionsManagerModal - Bouton fermer corrigé ✅
- [ ] Clés de signature générées
- [ ] `tauri.conf.json` configuré (username + clé publique)
- [ ] GitHub Secrets créés (TAURI_SIGNING_PRIVATE_KEY)
- [ ] Discord webhook configuré (optionnel)
- [ ] Dépendances installées (frontend + backend)
- [ ] Build local réussit : `npm run build:win`
- [ ] Première release créée et publiée
- [ ] Test d'update réussi

---

**Date** : 9 février 2026  
**Version actuelle** : 1.2.2  
**Prochaine version** : 1.3.0 (avec auto-update)
