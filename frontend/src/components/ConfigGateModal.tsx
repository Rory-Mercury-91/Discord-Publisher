import { useEffect, useRef, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { getSupabase } from '../lib/supabase';
import { useToast } from './ToastProvider';

const STORAGE_KEY_MASTER_ADMIN = 'discord-publisher:master-admin-code';

const getSupabaseConfig = () => {
  const url = typeof import.meta?.env?.VITE_SUPABASE_URL === 'string' ? import.meta.env.VITE_SUPABASE_URL.trim() : '';
  const anonKey = typeof import.meta?.env?.VITE_SUPABASE_ANON_KEY === 'string' ? import.meta.env.VITE_SUPABASE_ANON_KEY.trim() : '';
  return { url, anonKey };
};

/** Fallback : variable d'environnement au build si Supabase n'est pas configuré. */
const getMasterAdminCodeEnv = (): string =>
  (typeof import.meta?.env?.VITE_MASTER_ADMIN_CODE === 'string' ? import.meta.env.VITE_MASTER_ADMIN_CODE : '') || '';

interface ConfigGateModalProps {
  onClose: () => void;
  onOpenConfig: (adminMode: boolean) => void;
}

export default function ConfigGateModal({ onClose, onOpenConfig }: ConfigGateModalProps) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<'user' | 'admin'>('user');
  const [adminCode, setAdminCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingStored, setCheckingStored] = useState(false);
  const hasCheckedStoredRef = useRef(false);

  useEscapeKey(onClose, true);
  useModalScrollLock(true);

  // Réinitialiser le ref quand on repasse en mode user pour revérifier au prochain passage en admin
  useEffect(() => {
    if (mode === 'user') {
      hasCheckedStoredRef.current = false;
    }
  }, [mode]);

  // Au passage en mode admin : si un code est mémorisé, le valider contre la base ; si invalide, le supprimer.
  useEffect(() => {
    if (mode !== 'admin' || checkingStored) return;
    const stored = localStorage.getItem(STORAGE_KEY_MASTER_ADMIN);
    if (!stored?.trim()) return;
    if (hasCheckedStoredRef.current) return;
    hasCheckedStoredRef.current = true;

    const validateStoredAndOpen = async () => {
      setCheckingStored(true);
      const trimmed = stored.trim();
      const { url, anonKey } = getSupabaseConfig();

      if (url && anonKey) {
        try {
          const base = url.replace(/\/+$/, '');
          const res = await fetch(`${base}/functions/v1/validate-master-admin-code`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${anonKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code: trimmed }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data?.valid === true) {
            const sb = getSupabase();
            if (sb) {
              const { data: { session }, error: refreshErr } = await sb.auth.refreshSession();
              const token = session?.access_token;
              if (token && !refreshErr) {
                try {
                  const resGrant = await fetch(`${base}/functions/v1/grant-master-admin`, {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${token}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ code: trimmed }),
                  });
                  const grantData = await resGrant.json().catch(() => ({}));
                  if (resGrant.ok && grantData?.success) {
                    showToast('Droits administrateur activés', 'success');
                  }
                } catch (_e) {
                  // Continuer
                }
              }
            }
            onOpenConfig(true);
            setCheckingStored(false);
            return;
          }
        } catch (_e) {
          // Réseau : on garde le code en local et on affiche le formulaire
        }
        localStorage.removeItem(STORAGE_KEY_MASTER_ADMIN);
      }

      const refEnv = getMasterAdminCodeEnv().trim();
      if (refEnv && trimmed === refEnv) {
        const sb = getSupabase();
        if (sb) {
          try {
            const { data: { session }, error: refreshErr } = await sb.auth.refreshSession();
            const token = session?.access_token;
            if (token && !refreshErr) {
              const { url } = getSupabaseConfig();
              const base = url?.replace(/\/+$/, '') ?? '';
              if (base) {
                const resGrant = await fetch(`${base}/functions/v1/grant-master-admin`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ code: trimmed }),
                });
                const grantData = await resGrant.json().catch(() => ({}));
                if (resGrant.ok && grantData?.success) {
                  showToast('Droits administrateur activés', 'success');
                }
              }
            }
          } catch (_e) {
            // Continuer
          }
        }
        onOpenConfig(true);
        setCheckingStored(false);
        return;
      }

      setError('Code mémorisé révoqué ou invalide. Saisissez le nouveau code.');
      setCheckingStored(false);
    };

    void validateStoredAndOpen();
  }, [mode, checkingStored]);

  const handleContinue = async () => {
    setError(null);
    if (mode === 'user') {
      onOpenConfig(false);
      return;
    }
    const trimmed = adminCode.trim();
    if (!trimmed) {
      setError('Saisissez le code Master Admin.');
      return;
    }

    const { url, anonKey } = getSupabaseConfig();
    if (url && anonKey) {
      setLoading(true);
      try {
        const base = url.replace(/\/+$/, '');
        const res = await fetch(`${base}/functions/v1/validate-master-admin-code`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${anonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code: trimmed }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.valid === true) {
          setAdminCode('');
          try {
            localStorage.setItem(STORAGE_KEY_MASTER_ADMIN, trimmed);
          } catch (_e) {
            // Ignorer si localStorage indisponible
          }
          // Attribuer is_master_admin au profil de l'utilisateur connecté (token frais pour éviter 401)
          const sb = getSupabase();
          if (sb) {
            const { data: { session }, error: refreshErr } = await sb.auth.refreshSession();
            const token = session?.access_token;
            if (token && !refreshErr) {
              try {
                const resGrant = await fetch(`${base}/functions/v1/grant-master-admin`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ code: trimmed }),
                });
                const grantData = await resGrant.json().catch(() => ({}));
                if (resGrant.ok && grantData?.success) {
                  showToast('Droits administrateur activés', 'success');
                } else if (resGrant.status === 401) {
                  showToast('Session expirée : déconnectez-vous et reconnectez-vous puis réessayez.', 'warning');
                }
              } catch (_e) {
                // Continuer quand même : on ouvre la config admin
              }
            }
          }
          onOpenConfig(true);
          return;
        }
        setError(
          data?.error === 'MASTER_ADMIN_CODE not configured'
            ? 'Code Master Admin non configuré côté Supabase (secret MASTER_ADMIN_CODE).'
            : 'Code incorrect.'
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Fallback : si le code correspond à VITE_MASTER_ADMIN_CODE ( .env ), débloquer quand même
        const refEnv = getMasterAdminCodeEnv().trim();
        if (refEnv && trimmed === refEnv) {
          setAdminCode('');
          try {
            localStorage.setItem(STORAGE_KEY_MASTER_ADMIN, trimmed);
          } catch (_e) {
            // Ignorer si localStorage indisponible
          }
          onOpenConfig(true);
          setLoading(false);
          return;
        }
        setError(
          `Impossible de joindre Supabase. ${msg} Vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans le .env à la racine du projet, puis redémarrez l'app.`
        );
      } finally {
        setLoading(false);
        return;
      }
    }

    const ref = getMasterAdminCodeEnv().trim();
    if (!ref) {
      setError(
        'Configurez Supabase (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY) ou VITE_MASTER_ADMIN_CODE dans .env.'
      );
      return;
    }
    if (trimmed !== ref) {
      setError('Code incorrect.');
      return;
    }
    setAdminCode('');
    try {
      localStorage.setItem(STORAGE_KEY_MASTER_ADMIN, trimmed);
    } catch (_e) {
      // Ignorer si localStorage indisponible
    }
    // Attribuer is_master_admin au profil (fallback env) — token frais pour éviter 401
    const sb = getSupabase();
    if (sb) {
      try {
        const { data: { session }, error: refreshErr } = await sb.auth.refreshSession();
        const token = session?.access_token;
        if (token && !refreshErr) {
          const { url } = getSupabaseConfig();
          const base = url?.replace(/\/+$/, '') ?? '';
          if (base) {
            const resGrant = await fetch(`${base}/functions/v1/grant-master-admin`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ code: trimmed }),
            });
            const grantData = await resGrant.json().catch(() => ({}));
            if (resGrant.ok && grantData?.success) {
              showToast('Droits administrateur activés', 'success');
            } else if (resGrant.status === 401) {
              showToast('Session expirée : déconnectez-vous et reconnectez-vous puis réessayez.', 'warning');
            }
          }
        }
      } catch (_e) {
        // Continuer
      }
    }
    onOpenConfig(true);
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        backdropFilter: 'blur(3px)',
        padding: 20,
        boxSizing: 'border-box',
      }}
    >
      <div
        className="config-gate-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--panel)',
          borderRadius: 16,
          border: '1px solid var(--border)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
          padding: 28,
          maxWidth: 420,
          width: '100%',
        }}
      >
        <h2 style={{ margin: '0 0 20px', fontSize: 20 }}>⚙️ Accès à la configuration</h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
          Choisissez le mode d'accès : utilisateur (URL API uniquement) ou administrateur (configuration complète).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: 16,
              borderRadius: 12,
              border: `2px solid ${mode === 'user' ? 'var(--accent)' : 'var(--border)'}`,
              background: mode === 'user' ? 'rgba(74, 158, 255, 0.1)' : 'rgba(255,255,255,0.02)',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="config-mode"
              checked={mode === 'user'}
              onChange={() => setMode('user')}
              style={{ width: 18, height: 18, marginTop: 2 }}
            />
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Mode utilisateur</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>URL API et clé uniquement</div>
            </div>
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: 16,
              borderRadius: 12,
              border: `2px solid ${mode === 'admin' ? 'var(--accent)' : 'var(--border)'}`,
              background: mode === 'admin' ? 'rgba(74, 158, 255, 0.1)' : 'rgba(255,255,255,0.02)',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="config-mode"
              checked={mode === 'admin'}
              onChange={() => setMode('admin')}
              style={{ width: 18, height: 18, marginTop: 2 }}
            />
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Mode admin</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>Fenêtre, export/import, configuration complète</div>
            </div>
          </label>
        </div>

        {mode === 'admin' && (
          <div style={{ marginBottom: 20 }}>
            {checkingStored ? (
              <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
                Vérification du code mémorisé…
              </p>
            ) : (
              <>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                  Code Master Admin *
                </label>
                <input
                  type="password"
                  value={adminCode}
                  onChange={(e) => {
                    setAdminCode(e.target.value);
                    setError(null);
                  }}
                  placeholder="Code administrateur"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 8,
                    border: `1px solid ${error ? 'var(--danger, #e74c3c)' : 'var(--border)'}`,
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text)',
                    fontSize: 14,
                  }}
                />
                {error && (
                  <p style={{ fontSize: 12, color: 'var(--danger, #e74c3c)', marginTop: 8 }}>{error}</p>
                )}
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={loading || checkingStored}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            {loading ? 'Vérification…' : 'Continuer'}
          </button>
        </div>
      </div>
    </div>
  );
}
