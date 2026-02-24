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
  const { importFullConfig, clearAllAppData, setApiBaseFromSupabase } = useApp();
  const { confirm } = useConfirm();

  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('apiUrl') || localStorage.getItem('apiBase') || 'http://138.2.182.125:8080');
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

  // ─── Sauvegarde auto URL ────────────────────────────────────────────────
  useEffect(() => {
    if (!adminUnlocked) return;
    const base = apiUrl.trim().replace(/\/+$/, '');
    if (!base) return;

    localStorage.setItem('apiUrl', base);
    localStorage.setItem('apiBase', base);
    setApiBaseFromSupabase(base);

    const sb = getSupabase();
    if (sb) {
      sb.from('app_config')
        .upsert(
          { key: 'api_base_url', value: base, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        )
        .then(r => {
          if (r?.error) console.warn('app_config:', r.error.message);
        });
    }
  }, [apiUrl, adminUnlocked, setApiBaseFromSupabase]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {adminUnlocked ? (
        <>
          {/* URL API */}
          <section style={sectionStyle}>
            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>🌐 URL de l'API</h4>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="text"
                value={apiUrl}
                onChange={e => setApiUrl(e.target.value)}
                placeholder="http://138.2.182.125:8080"
                style={{ ...inputStyle, flex: 1 }}
              />
              <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                Propagée via Supabase
              </span>
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
