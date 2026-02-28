// frontend/src/components/Settings/components/AdminSettings.tsx
import { useEffect, useRef, useState } from 'react';
import { getSupabase } from '../../../lib/supabase';
import { useApp } from '../../../state/appContext';
import { useToast } from '../../ToastProvider';

const STORAGE_KEY_MASTER_ADMIN = 'discord-publisher:master-admin-code';

const getSupabaseConfig = () => ({
  url: (typeof import.meta?.env?.VITE_SUPABASE_URL === 'string' ? import.meta.env.VITE_SUPABASE_URL : '').trim(),
  anonKey: (typeof import.meta?.env?.VITE_SUPABASE_ANON_KEY === 'string' ? import.meta.env.VITE_SUPABASE_ANON_KEY : '').trim(),
});

const getMasterAdminCodeEnv = (): string =>
  (typeof import.meta?.env?.VITE_MASTER_ADMIN_CODE === 'string' ? import.meta.env.VITE_MASTER_ADMIN_CODE : '') || '';

interface AdminSettingsProps {
  onClose?: () => void;
}

export default function AdminSettings({ onClose: _onClose }: AdminSettingsProps) {
  const { showToast } = useToast();
  const { setApiBaseFromSupabase, listFormUrl } = useApp();

  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('apiUrl') || localStorage.getItem('apiBase') || 'http://138.2.182.125:8080');
  const [listFormUrlLocal, setListFormUrlLocal] = useState('');
  const [adminUnlocked, setAdminUnlocked] = useState(() => !!localStorage.getItem(STORAGE_KEY_MASTER_ADMIN));
  const [adminCode, setAdminCode] = useState('');
  const [adminCodeError, setAdminCodeError] = useState<string | null>(null);
  const [adminCodeLoading, setAdminCodeLoading] = useState(false);
  const [checkingStored, setCheckingStored] = useState(false);
  const hasCheckedStoredRef = useRef(false);

  // ─── Vérification code mémorisé ─────────────────────────────────────────
  useEffect(() => {
    if (adminUnlocked || hasCheckedStoredRef.current) return;
    const stored = localStorage.getItem(STORAGE_KEY_MASTER_ADMIN);
    if (!stored?.trim()) return;

    hasCheckedStoredRef.current = true;
    const validate = async () => {
      setCheckingStored(true);
      const trimmed = stored.trim();
      const { url, anonKey } = getSupabaseConfig();

      if (url && anonKey) {
        try {
          const res = await fetch(`${url.replace(/\/+$/, '')}/functions/v1/validate-master-admin-code`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: trimmed }),
          });
          const data = await res.json().catch(() => ({}));

          if (res.ok && data?.valid === true) {
            setAdminUnlocked(true);
            window.dispatchEvent(new CustomEvent('masterAdminUnlocked'));
            setCheckingStored(false);
            return;
          }

          localStorage.removeItem(STORAGE_KEY_MASTER_ADMIN);
          setAdminCodeError('Code mémorisé révoqué. Saisissez le nouveau code.');
        } catch {
          setAdminUnlocked(true);
          window.dispatchEvent(new CustomEvent('masterAdminUnlocked'));
        }
      } else {
        const refEnv = getMasterAdminCodeEnv().trim();
        if (refEnv && trimmed === refEnv) {
          setAdminUnlocked(true);
          window.dispatchEvent(new CustomEvent('masterAdminUnlocked'));
        } else {
          localStorage.removeItem(STORAGE_KEY_MASTER_ADMIN);
          setAdminCodeError('Code mémorisé invalide.');
        }
      }
      setCheckingStored(false);
    };
    void validate();
  }, [adminUnlocked]);

  // ─── Déverrouillage manuel ──────────────────────────────────────────────
  const handleAdminUnlock = async () => {
    setAdminCodeError(null);
    const trimmed = adminCode.trim();
    if (!trimmed) {
      setAdminCodeError('Saisissez le code Master Admin.');
      return;
    }

    const { url, anonKey } = getSupabaseConfig();
    setAdminCodeLoading(true);

    try {
      if (url && anonKey) {
        const base = url.replace(/\/+$/, '');
        const res = await fetch(`${base}/functions/v1/validate-master-admin-code`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: trimmed }),
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok && data?.valid === true) {
          localStorage.setItem(STORAGE_KEY_MASTER_ADMIN, trimmed);
          setAdminUnlocked(true);
          window.dispatchEvent(new CustomEvent('masterAdminUnlocked'));
          setAdminCode('');
          showToast('Accès administrateur déverrouillé', 'success');
          return;
        }

        setAdminCodeError(
          data?.error === 'MASTER_ADMIN_CODE not configured'
            ? 'Code Master Admin non configuré côté Supabase.'
            : 'Code incorrect.'
        );
      } else {
        const refEnv = getMasterAdminCodeEnv().trim();
        if (!refEnv) {
          setAdminCodeError('VITE_MASTER_ADMIN_CODE non configuré dans .env.');
          return;
        }
        if (trimmed !== refEnv) {
          setAdminCodeError('Code incorrect.');
          return;
        }
        localStorage.setItem(STORAGE_KEY_MASTER_ADMIN, trimmed);
        setAdminUnlocked(true);
        window.dispatchEvent(new CustomEvent('masterAdminUnlocked'));
        setAdminCode('');
        showToast('Accès administrateur déverrouillé', 'success');
      }
    } catch {
      const refEnv = getMasterAdminCodeEnv().trim();
      if (refEnv && trimmed === refEnv) {
        localStorage.setItem(STORAGE_KEY_MASTER_ADMIN, trimmed);
        setAdminUnlocked(true);
        window.dispatchEvent(new CustomEvent('masterAdminUnlocked'));
        setAdminCode('');
        showToast('Accès administrateur déverrouillé (mode hors-ligne)', 'success');
      } else {
        setAdminCodeError('Impossible de joindre Supabase et code env incorrect.');
      }
    } finally {
      setAdminCodeLoading(false);
    }
  };

  // Synchroniser l'URL formulaire liste depuis le contexte (chargée depuis app_config)
  useEffect(() => {
    setListFormUrlLocal(listFormUrl ?? '');
  }, [listFormUrl]);

  // ─── Sauvegarde config (API URL + URL formulaire liste) ─────────────────
  const saveConfig = (silent = false) => {
    if (!adminUnlocked) return;
    const sb = getSupabase();
    if (!sb) return;

    const base = apiUrl.trim().replace(/\/+$/, '');
    if (base) {
      localStorage.setItem('apiUrl', base);
      localStorage.setItem('apiBase', base);
      setApiBaseFromSupabase(base);
    }
    const listForm = listFormUrlLocal.trim() || '';

    const rows = [
      ...(base ? [{ key: 'api_base_url', value: base, updated_at: new Date().toISOString() }] : []),
      { key: 'list_form_url', value: listForm, updated_at: new Date().toISOString() },
    ];
    if (rows.length === 0) return;
    sb.from('app_config')
      .upsert(rows, { onConflict: 'key' })
      .then(r => {
        if (r?.error) {
          if (!silent) showToast('Erreur enregistrement config', 'error');
        } else if (!silent) {
          showToast('Config enregistrée (API + URL formulaire liste)', 'success');
        }
      });
  };

  const handleSaveConfig = () => saveConfig(false);

  // Refs pour lire les dernières valeurs au démontage (sauvegarde auto à la fermeture)
  const apiUrlRef = useRef(apiUrl);
  const listFormUrlLocalRef = useRef(listFormUrlLocal);
  apiUrlRef.current = apiUrl;
  listFormUrlLocalRef.current = listFormUrlLocal;

  useEffect(() => {
    return () => {
      if (!adminUnlocked) return;
      const sb = getSupabase();
      if (!sb) return;
      const base = (apiUrlRef.current ?? '').trim().replace(/\/+$/, '');
      const listForm = (listFormUrlLocalRef.current ?? '').trim() || '';
      if (base) {
        localStorage.setItem('apiUrl', base);
        localStorage.setItem('apiBase', base);
        setApiBaseFromSupabase(base);
      }
      const rows = [
        ...(base ? [{ key: 'api_base_url', value: base, updated_at: new Date().toISOString() }] : []),
        { key: 'list_form_url', value: listForm, updated_at: new Date().toISOString() },
      ];
      if (rows.length > 0) {
        sb.from('app_config').upsert(rows, { onConflict: 'key' }).then(() => {});
      }
    };
  }, [adminUnlocked, setApiBaseFromSupabase]);

  const handleLockAdmin = () => {
    localStorage.removeItem(STORAGE_KEY_MASTER_ADMIN);
    setAdminUnlocked(false);
    setAdminCode('');
    setAdminCodeError(null);
    window.dispatchEvent(new CustomEvent('masterAdminLocked'));
    showToast('Mode admin désactivé', 'success');
  };

  return (
    <div className="settings-config-fields" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {adminUnlocked ? (
        <>
          {/* Déconnexion du mode admin */}
          <section className="settings-section settings-section--admin">
            <div className="settings-section--admin__row">
              <div>
                <h4 className="settings-section--admin__title">🛡️ Mode administrateur</h4>
                <p className="settings-section--admin__sub">Vous êtes connecté en tant qu’administrateur.</p>
              </div>
              <button type="button" onClick={handleLockAdmin} className="settings-admin-unlock-btn">
                Se déconnecter du mode admin
              </button>
            </div>
          </section>

          {/* Config globale : URL API + URL formulaire liste */}
          <section className="settings-section">
            <h4 className="settings-section__title">🌐 Configuration globale</h4>
            <p className="settings-section__intro">
              URL de l&apos;API et URL du formulaire liste (script/tableur). Propagées via Supabase pour tous les utilisateurs.
            </p>
            <div className="settings-config-fields">
              <div className="settings-config-field">
                <label>URL de l&apos;API</label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={e => setApiUrl(e.target.value)}
                  placeholder="http://138.2.182.125:8080"
                  className="form-input"
                />
              </div>
              <div className="settings-config-field">
                <label>URL du formulaire liste (script / tableur)</label>
                <input
                  type="url"
                  value={listFormUrlLocal}
                  onChange={e => setListFormUrlLocal(e.target.value)}
                  placeholder="https://script.google.com/... ou page du formulaire"
                  className="form-input"
                />
              </div>
              <div className="settings-config-actions">
                <button type="button" onClick={handleSaveConfig} className="form-btn form-btn--primary">
                  Enregistrer la config
                </button>
              </div>
            </div>
          </section>

        </>
      ) : (
        /* Écran de verrouillage */
        <div className="settings-section--restricted">
          <div className="settings-section--restricted__icon">🔒</div>
          <div>
            <h3 className="settings-section--restricted__title">Accès restreint</h3>
            <p className="settings-section--restricted__p">
              Cet espace est réservé aux administrateurs.<br />
              Saisissez le code Master Admin pour continuer.
            </p>
          </div>

          {checkingStored ? (
            <p className="settings-section--restricted__p">Vérification du code mémorisé…</p>
          ) : (
            <div className="settings-section--restricted__form">
              <input
                type="password"
                value={adminCode}
                onChange={e => {
                  setAdminCode(e.target.value);
                  setAdminCodeError(null);
                }}
                onKeyDown={e => e.key === 'Enter' && handleAdminUnlock()}
                placeholder="Code Master Admin"
                className="form-input form-input--center"
                autoFocus
              />
              {adminCodeError && <p className="settings-section--restricted__error">{adminCodeError}</p>}
              <button
                type="button"
                onClick={handleAdminUnlock}
                disabled={adminCodeLoading || !adminCode.trim()}
                className="form-btn form-btn--primary"
              >
                {adminCodeLoading ? 'Vérification…' : 'Déverrouiller'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
