# 🔐 Configuration GitHub Secrets - Liste complète

Ce fichier liste TOUS les secrets GitHub nécessaires pour que le workflow de release fonctionne correctement.

## 📋 Secrets requis

### 1. Signature de l'application (OBLIGATOIRE)

| Nom | Description | Comment obtenir |
|-----|-------------|-----------------|
| `TAURI_SIGNING_PRIVATE_KEY` | Clé privée pour signer l'installateur | `npm run tauri signer generate` → Copier la clé privée |

**⚠️ Note** : Si vous avez défini un mot de passe lors de la génération des clés, créer aussi :

| Nom | Description |
|-----|-------------|
| `TAURI_KEY_PASSWORD` | Mot de passe de la clé privée (si défini) |

---

### 2. Configuration Supabase (OBLIGATOIRE)

L'application utilise Supabase pour l'authentification et la base de données. Ces variables sont nécessaires pour que le build fonctionne.

| Nom | Description | Où trouver |
|-----|-------------|-----------|
| `VITE_SUPABASE_URL` | URL de votre projet Supabase | Supabase Dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Clé publique (anon/public) | Supabase Dashboard → Settings → API → Project API keys → `anon` `public` |

**Exemple de valeurs** :
- `VITE_SUPABASE_URL` : `https://ffsdgocbhghyermqqwlv.supabase.co`
- `VITE_SUPABASE_ANON_KEY` : `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOi...` (très longue)

**🔒 Sécurité** : 
- La clé `anon/public` est **PUBLIQUE** et peut être exposée côté client
- Elle est protégée par les Row Level Security (RLS) de Supabase
- Ne JAMAIS utiliser la clé `service_role` ici (elle donnerait un accès total)

---

### 3. Notification Discord (OPTIONNEL)

Pour recevoir une notification sur Discord après chaque release.

| Nom | Description | Comment créer |
|-----|-------------|---------------|
| `DISCORD_WEBHOOK_URL` | URL du webhook Discord | Serveur Discord → Paramètres → Intégrations → Webhooks → Nouveau webhook → Copier l'URL |

**Si absent** : Le workflow ne plantera pas, il sautera simplement les notifications.

---

## 📝 Comment configurer les secrets

### Étapes

1. **Aller sur GitHub** : https://github.com/Rory-Mercury-91/Discord-Bot-Traductions/settings/secrets/actions

2. **Cliquer sur** : `New repository secret`

3. **Pour chaque secret** :
   - **Name** : Copier le nom exact depuis le tableau ci-dessus (ex: `VITE_SUPABASE_URL`)
   - **Secret** : Coller la valeur correspondante
   - Cliquer sur **Add secret**

### Vérification

Une fois tous les secrets configurés, vous devriez avoir :

**Obligatoires (3-4 secrets)** :
- ✅ `TAURI_SIGNING_PRIVATE_KEY`
- ✅ `VITE_SUPABASE_URL`
- ✅ `VITE_SUPABASE_ANON_KEY`
- ⚪ `TAURI_KEY_PASSWORD` (seulement si mot de passe défini)

**Optionnels (1 secret)** :
- ⚪ `DISCORD_WEBHOOK_URL`

---

## 🧪 Tester la configuration

### Méthode 1 : Créer une release de test

```powershell
git tag v1.3.1-test
git push origin v1.3.1-test
```

→ Aller sur **Actions** pour voir si le build réussit

### Méthode 2 : Vérifier les logs

Si le build échoue :
1. Aller sur **Actions** → Cliquer sur le workflow échoué
2. Regarder l'étape qui a planté :
   - `Create .env file` → Secrets Supabase manquants
   - `Build application` → Vérifier les dépendances
   - `Create GitHub Release` → Secret de signature manquant

---

## 🔧 Dépannage

### Erreur "VITE_SUPABASE_URL is undefined"

**Cause** : Secret `VITE_SUPABASE_URL` manquant ou mal nommé

**Solution** :
1. Vérifier que le secret existe dans **Settings → Secrets**
2. Vérifier l'orthographe exacte (sensible à la casse)
3. Re-créer le secret si nécessaire

### Erreur "Signature verification failed"

**Cause** : Secret `TAURI_SIGNING_PRIVATE_KEY` incorrect

**Solution** :
1. Régénérer les clés : `npm run tauri signer generate`
2. Mettre à jour le secret avec la nouvelle clé privée
3. Mettre à jour `tauri.conf.json` avec la nouvelle clé publique

### Le build réussit mais l'app ne se connecte pas à Supabase

**Cause** : Mauvaise clé ou URL Supabase

**Solution** :
1. Vérifier dans Supabase Dashboard que les valeurs sont correctes
2. Tester l'URL : `curl https://VOTRE_URL.supabase.co`
3. Re-créer les secrets avec les bonnes valeurs

---

## 📚 Ressources

- [GitHub Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Supabase API Keys](https://supabase.com/docs/guides/api#api-url-and-keys)
- [Tauri Signing Documentation](https://tauri.app/v1/guides/distribution/sign-windows)

---

**Dernière mise à jour** : 9 février 2026  
**Version** : 1.3.0
