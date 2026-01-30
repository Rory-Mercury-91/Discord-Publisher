# Scripts de build

## bump-version.js

Script d'incrémentation automatique de la version de l'application.

### Fonctionnement

Le script incrémente automatiquement le **patch version** (x.y.z → x.y.**z+1**) dans les 3 fichiers suivants :

1. `package.json` (racine)
2. `src-tauri/tauri.conf.json`
3. `src-tauri/Cargo.toml`

### Utilisation

#### Automatique (recommandé)

Le script est appelé automatiquement lors du build :

```bash
npm run build:win
# ou
npm run build
```

Ces commandes vont :
1. Incrémenter la version (+1 sur le patch)
2. Lancer le build Tauri

#### Manuel

Pour incrémenter la version sans builder :

```bash
npm run bump-version
```

### Exemple

Si la version actuelle est `1.0.5`, après l'exécution :
- `package.json` : `1.0.5` → `1.0.6`
- `src-tauri/tauri.conf.json` : `1.0.5` → `1.0.6`
- `src-tauri/Cargo.toml` : `1.0.5` → `1.0.6`

### Notes

- Le script utilise le versioning sémantique (SemVer)
- Seul le **patch** est incrémenté automatiquement
- Pour incrémenter le **minor** ou **major**, utilisez `set-version` (voir ci-dessous)
- Le script échoue si la version n'est pas au format `x.y.z`

---

## set-version.js

Script pour définir manuellement une version spécifique.

### Utilisation

```bash
npm run set-version 2.0.0
```

### Cas d'usage

- **Release majeure** : passer de `1.9.5` à `2.0.0`
- **Release mineure** : passer de `1.5.3` à `1.6.0`
- **Correction de version** : réinitialiser à une version spécifique

### Exemple

```bash
# Passer à la version 2.0.0
npm run set-version 2.0.0

# Ensuite, les builds suivants incrémenteront automatiquement :
# 2.0.0 → 2.0.1 → 2.0.2 → ...
```
