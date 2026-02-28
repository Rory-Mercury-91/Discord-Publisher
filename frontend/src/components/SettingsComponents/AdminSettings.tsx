// frontend\src\components\SettingsComponents\AdminSettings.tsx
import { useEffect, useRef, useState } from 'react';
import { useConfirm } from '../../hooks/useConfirm';
import { getSupabase } from '../../lib/supabase';
import { useApp } from '../../state/appContext';
import { useAuth } from '../../state/authContext';
import { useToast } from '../ToastProvider';

const sectionStyle: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 14, padding: 20,
  background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column',
  gap: 16, boxSizing: 'border-box',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)',
  color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
};

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

export default function AdminSettings({ onClose }: AdminSettingsProps) {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const { importFullConfig, clearAllAppData, setApiBaseFromSupabase, listFormUrl } = useApp();
  const { confirm } = useConfirm();

  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('apiUrl') || localStorage.getItem('apiBase') || 'http://138.2.182.125:8080');
  const [listFormUrlLocal, setListFormUrlLocal] = useState('');
  const [adminUnlocked, setAdminUnlocked] = useState(() => !!localStorage.getItem(STORAGE_KEY_MASTER_ADMIN));
  const [adminCode, setAdminCode] = useState('');
  const [adminCodeError, setAdminCodeError] = useState<string | null>(null);
  const [adminCodeLoading, setAdminCodeLoading] = useState(false);
  const [checkingStored, setCheckingStored] = useState(false);
  const hasCheckedStoredRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ─── Export / Import / Nettoyage ────────────────────────────────────────
  const handleExportConfig = () => {
    try {
      const blob = new Blob(
        [
          JSON.stringify(
            {
              apiUrl,
              apiBase: apiUrl,
              templates: [], // sera rempli par le parent si besoin
              exportDate: new Date().toISOString(),
              version: '1.0',
            },
            null,
            2
          ),
        ],
        { type: 'application/json' }
      );

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `backup_discord_generator_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('Sauvegarde téléchargée', 'success');
    } catch {
      showToast("Erreur lors de l'export", 'error');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const ok = await confirm({
      title: '⚠️ Importer une sauvegarde',
      message: 'Importer va écraser vos données actuelles (templates, tags, instructions, historique). Continuer ?',
      confirmText: 'Importer',
      cancelText: 'Annuler',
      type: 'danger',
    });
    if (!ok) return;

    try {
      const data = JSON.parse(await file.text());
      importFullConfig(data);
      setApiUrl(localStorage.getItem('apiUrl') || 'http://138.2.182.125:8080');
      showToast('Sauvegarde importée avec succès !', 'success');
    } catch {
      showToast("Erreur lors de l'import (fichier invalide ?)", 'error');
    }
  };

  const handleCleanupAllData = async () => {
    const ok = await confirm({
      title: 'Nettoyage complet des données',
      message: 'Supprimer toutes les données (publications, tags, config, autorisations) sur Supabase. Irréversible. Continuer ?',
      confirmText: 'Tout supprimer',
      type: 'danger',
    });
    if (!ok) return;

    const { ok: success, error } = await clearAllAppData(profile?.id);
    if (success) {
      showToast('Données nettoyées', 'success');
      onClose?.();
    } else {
      showToast('Erreur : ' + (error ?? 'inconnue'), 'error');
    }
  };

  const handleLockAdmin = () => {
    localStorage.removeItem(STORAGE_KEY_MASTER_ADMIN);
    setAdminUnlocked(false);
    setAdminCode('');
    setAdminCodeError(null);
    window.dispatchEvent(new CustomEvent('masterAdminLocked'));
    showToast('Mode admin désactivé', 'success');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {adminUnlocked ? (
        <>
          {/* Déconnexion du mode admin */}
          <section style={{ ...sectionStyle, background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>🛡️ Mode administrateur</h4>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>Vous êtes connecté en tant qu’administrateur.</p>
              </div>
              <button
                type="button"
                onClick={handleLockAdmin}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid rgba(239,68,68,0.4)',
                  background: 'rgba(239,68,68,0.1)',
                  color: '#f87171',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Se déconnecter du mode admin
              </button>
            </div>
          </section>

          {/* Config globale : URL API + URL formulaire liste */}
          <section style={sectionStyle}>
            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>🌐 Configuration globale</h4>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>
              URL de l&apos;API et URL du formulaire liste (script/tableur). Propagées via Supabase pour tous les utilisateurs.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>URL de l&apos;API</label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={e => setApiUrl(e.target.value)}
                  placeholder="http://138.2.182.125:8080"
                  style={{ ...inputStyle }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>URL du formulaire liste (script / tableur)</label>
                <input
                  type="url"
                  value={listFormUrlLocal}
                  onChange={e => setListFormUrlLocal(e.target.value)}
                  placeholder="https://script.google.com/... ou page du formulaire"
                  style={{ ...inputStyle }}
                />
              </div>
              <button
                type="button"
                onClick={handleSaveConfig}
                style={{
                  alignSelf: 'flex-start',
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: '1px solid var(--accent)',
                  background: 'rgba(99,102,241,0.2)',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Enregistrer la config
              </button>
            </div>
          </section>

          {/* Sauvegarde & restauration */}
          <section style={{ ...sectionStyle, background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.18)' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>💾 Sauvegarde et restauration</h4>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              style={{ display: 'none' }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {[
                {
                  label: '📤 Exporter',
                  desc: 'Télécharge un JSON complet',
                  color: 'var(--accent)',
                  bg: 'rgba(99,102,241,0.14)',
                  border: 'rgba(99,102,241,0.35)',
                  onClick: handleExportConfig,
                },
                {
                  label: '📥 Restaurer',
                  desc: 'Importe depuis un fichier',
                  color: 'var(--success)',
                  bg: 'rgba(16,185,129,0.10)',
                  border: 'rgba(16,185,129,0.3)',
                  onClick: () => fileInputRef.current?.click(),
                },
                {
                  label: '🗑️ Tout supprimer',
                  desc: 'Efface Supabase + local (irréversible)',
                  color: '#ef4444',
                  bg: 'rgba(239,68,68,0.10)',
                  border: 'rgba(239,68,68,0.35)',
                  onClick: handleCleanupAllData,
                },
              ].map(({ label, desc, color, bg, border, onClick }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button
                    onClick={onClick}
                    style={{
                      padding: '13px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      background: bg,
                      border: `1px solid ${border}`,
                      color,
                      borderRadius: 10,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {label}
                  </button>
                  <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, textAlign: 'center' }}>{desc}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        /* Écran de verrouillage */
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
            padding: '40px 20px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 48, lineHeight: 1 }}>🔒</div>
          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>Accès restreint</h3>
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
              Cet espace est réservé aux administrateurs.<br />
              Saisissez le code Master Admin pour continuer.
            </p>
          </div>

          {checkingStored ? (
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>Vérification du code mémorisé…</p>
          ) : (
            <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="password"
                value={adminCode}
                onChange={e => {
                  setAdminCode(e.target.value);
                  setAdminCodeError(null);
                }}
                onKeyDown={e => e.key === 'Enter' && handleAdminUnlock()}
                placeholder="Code Master Admin"
                style={{ ...inputStyle, textAlign: 'center', letterSpacing: 4 }}
                autoFocus
              />
              {adminCodeError && <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{adminCodeError}</p>}
              <button
                type="button"
                onClick={handleAdminUnlock}
                disabled={adminCodeLoading || !adminCode.trim()}
                style={{
                  padding: '12px 20px',
                  background: 'var(--accent)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: 10,
                  cursor: adminCodeLoading ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  fontSize: 14,
                  opacity: adminCodeLoading ? 0.7 : 1,
                }}
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
