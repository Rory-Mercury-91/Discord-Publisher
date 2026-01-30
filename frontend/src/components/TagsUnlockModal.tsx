import { useEffect, useRef, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

const STORAGE_KEY_TAGS_MASTER = 'discord-publisher:tags-master-code';

const getSupabaseConfig = () => {
  const url = typeof import.meta?.env?.VITE_SUPABASE_URL === 'string' ? import.meta.env.VITE_SUPABASE_URL.trim() : '';
  const anonKey = typeof import.meta?.env?.VITE_SUPABASE_ANON_KEY === 'string' ? import.meta.env.VITE_SUPABASE_ANON_KEY.trim() : '';
  return { url, anonKey };
};

/** Fallback : variable d'environnement au build si Supabase n'est pas configuré. */
const getTagsMasterCodeEnv = (): string =>
  (typeof import.meta?.env?.VITE_TAGS_MASTER_CODE === 'string' ? import.meta.env.VITE_TAGS_MASTER_CODE : '') || '';

interface TagsUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlock: () => void;
}

export default function TagsUnlockModal({ isOpen, onClose, onUnlock }: TagsUnlockModalProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingStored, setCheckingStored] = useState(false);
  const hasCheckedStoredRef = useRef(false);

  useEscapeKey(() => {
    if (isOpen) {
      setCode('');
      setError(null);
      onClose();
    }
  }, isOpen);
  useModalScrollLock(isOpen);

  // Réinitialiser le ref quand la modale se ferme pour revérifier au prochain ouvert
  useEffect(() => {
    if (!isOpen) {
      hasCheckedStoredRef.current = false;
    }
  }, [isOpen]);

  // À l'ouverture : si un code est mémorisé, le valider contre la base ; si invalide, le supprimer.
  useEffect(() => {
    if (!isOpen || checkingStored) return;
    const stored = localStorage.getItem(STORAGE_KEY_TAGS_MASTER);
    if (!stored?.trim()) return;
    if (hasCheckedStoredRef.current) return;
    hasCheckedStoredRef.current = true;

    const validateStoredAndUnlock = async () => {
      setCheckingStored(true);
      const trimmed = stored.trim();
      const { url, anonKey } = getSupabaseConfig();

      if (url && anonKey) {
        try {
          const base = url.replace(/\/+$/, '');
          const res = await fetch(`${base}/functions/v1/validate-tags-master-code`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${anonKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code: trimmed }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data?.valid === true) {
            onUnlock();
            onClose();
            setCheckingStored(false);
            return;
          }
        } catch (_e) {
          // Réseau : on garde le code en local et on affiche le formulaire
        }
        localStorage.removeItem(STORAGE_KEY_TAGS_MASTER);
      }

      const refEnv = getTagsMasterCodeEnv().trim();
      if (refEnv && trimmed === refEnv) {
        onUnlock();
        onClose();
        setCheckingStored(false);
        return;
      }

      setError('Code mémorisé révoqué ou invalide. Saisissez le nouveau code.');
      setCheckingStored(false);
    };

    void validateStoredAndUnlock();
  }, [isOpen, checkingStored]);

  const handleValidate = async () => {
    setError(null);
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Saisissez le code maître.');
      return;
    }

    const { url, anonKey } = getSupabaseConfig();

    if (url && anonKey) {
      setLoading(true);
      try {
        const base = url.replace(/\/+$/, '');
        const res = await fetch(`${base}/functions/v1/validate-tags-master-code`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${anonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code: trimmed }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.valid === true) {
          setCode('');
          try {
            localStorage.setItem(STORAGE_KEY_TAGS_MASTER, trimmed);
          } catch (_e) {
            // Ignorer si localStorage indisponible
          }
          onUnlock();
          onClose();
          return;
        }
        setError(data?.error === 'TAGS_MASTER_CODE not configured'
          ? 'Code maître non configuré côté Supabase (secret TAGS_MASTER_CODE).'
          : 'Code incorrect.');
      } catch (_e) {
        setError('Impossible de joindre Supabase. Vérifiez votre connexion.');
      } finally {
        setLoading(false);
      }
      return;
    }

    const ref = getTagsMasterCodeEnv().trim();
    if (!ref) {
      setError('Configurez Supabase (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY) ou VITE_TAGS_MASTER_CODE dans .env à la racine du projet.');
      return;
    }
    if (trimmed !== ref) {
      setError('Code incorrect.');
      return;
    }
    setCode('');
    try {
      localStorage.setItem(STORAGE_KEY_TAGS_MASTER, trimmed);
    } catch (_e) {
      // Ignorer si localStorage indisponible
    }
    onUnlock();
    onClose();
  };

  const handleCancel = () => {
    setCode('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99998,
        backdropFilter: 'blur(4px)'
      }}
      onClick={handleCancel}
    >
      <div
        className="panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 400,
          width: '90%',
          padding: 24,
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
        }}
      >
        <h3 style={{ margin: '0 0 12px', fontSize: 18 }}>
          🔓 Débloquer la gestion des tags
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)' }}>
          Saisissez le code maître pour créer, modifier ou supprimer des tags. La sélection des tags dans le formulaire reste accessible sans code.
        </p>
        <div style={{ marginBottom: 12 }}>
          {checkingStored ? (
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
              Vérification du code mémorisé…
            </p>
          ) : (
            <>
              <input
                type="password"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleValidate()}
                placeholder="Code maître"
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${error ? 'var(--error)' : 'var(--border)'}`,
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--text)',
                  fontSize: 14
                }}
              />
              {error && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--error)' }}>
                  {error}
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleCancel}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleValidate()}
            disabled={loading || checkingStored}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: loading ? 'var(--muted)' : 'var(--accent)',
              color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 600
            }}
          >
            {loading ? 'Vérification…' : 'Valider'}
          </button>
        </div>
      </div>
    </div>
  );
}
