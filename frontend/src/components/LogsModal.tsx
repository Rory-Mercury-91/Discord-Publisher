import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../state/appContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

const DEFAULT_BASE = 'http://138.2.182.125:8080';

interface LogsModalProps {
  onClose: () => void;
}

function getBaseUrl(apiUrl: string | undefined): string {
  const raw = (apiUrl || '').trim() || `${DEFAULT_BASE}/api/forum-post`;
  try {
    const u = new URL(raw);
    return u.origin;
  } catch {
    return raw.split('/api')[0]?.replace(/\/+$/, '') || DEFAULT_BASE;
  }
}

function filterHttpLogs(lines: string, hide: boolean): string {
  if (!hide) return lines;
  return lines
    .split('\n')
    .filter(
      (line) =>
        !/"(?:OPTIONS|GET)\s+\/api\/logs/i.test(line) && !/CONNECT\s+HTTP/i.test(line)
    )
    .join('\n');
}

const LOG_CATEGORIES = [
  { id: 'frelon' as const, label: 'Frelon', default: false },
  { id: 'publisher' as const, label: 'Publisher', default: true },
  { id: 'orchestrator' as const, label: 'Orchestrateur', default: true },
] as const;

function getLineCategory(line: string): 'frelon' | 'publisher' | 'orchestrator' | null {
  if (/\[frelon\]/i.test(line)) return 'frelon';
  if (/\[publisher\]/i.test(line)) return 'publisher';
  if (/\[orchestrator\]/i.test(line)) return 'orchestrator';
  return null;
}

function filterByCategory(lines: string, selected: Set<string>): string {
  if (selected.size === 0) return lines;
  return lines
    .split('\n')
    .filter((line) => {
      const cat = getLineCategory(line);
      if (!cat) return true; // Lignes sans catégorie (ex. API) : affichées
      return selected.has(cat);
    })
    .join('\n');
}

function exportLogsAsTxt(content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LogsModal({ onClose }: LogsModalProps) {
  const { apiUrl } = useApp();
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hideHttpLogs, setHideHttpLogs] = useState(true);
  const [logCategories, setLogCategories] = useState<Set<string>>(() =>
    new Set(LOG_CATEGORIES.filter((c) => c.default).map((c) => c.id))
  );

  useEscapeKey(onClose, true);
  useModalScrollLock();

  const filteredByHttp = filterHttpLogs(logs, hideHttpLogs);
  const displayedLogs = filterByCategory(filteredByHttp, logCategories);

  const toggleCategory = (id: string) => {
    setLogCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fetchLogs = useCallback(async () => {
    const base = getBaseUrl(apiUrl);
    const apiKey = localStorage.getItem('apiKey') || '';
    if (!apiKey) {
      setError('Clé API manquante. Configurez-la dans Paramètres.');
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const res = await fetch(`${base}/api/logs?lines=500`, {
        headers: { 'X-API-KEY': apiKey },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erreur ${res.status}`);
      }
      const data = await res.json();
      setLogs(data.logs || '');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!loading && !error) {
      const interval = setInterval(fetchLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [loading, error, fetchLogs]);

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--panel)',
          borderRadius: 12,
          width: '95%',
          maxWidth: 900,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--border)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>📋 Logs du serveur</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
              {LOG_CATEGORIES.map((c) => (
                <label
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                    color: logCategories.has(c.id) ? 'var(--text)' : 'var(--muted)',
                  }}
                  title={c.id === 'frelon' ? 'Logs du bot F95 (Frelon)' : c.id === 'publisher' ? 'Logs du bot Publisher' : 'Logs démarrage et orchestration'}
                >
                  <input
                    type="checkbox"
                    checked={logCategories.has(c.id)}
                    onChange={() => toggleCategory(c.id)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setHideHttpLogs((v) => !v)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: hideHttpLogs ? 'var(--accent)' : 'transparent',
                color: hideHttpLogs ? '#fff' : 'var(--text)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
              }}
              title={hideHttpLogs ? 'Afficher les requêtes HTTP' : 'Masquer les requêtes HTTP'}
            >
              {hideHttpLogs ? '🔇 HTTP masqués' : '🔊 Tout afficher'}
            </button>
            <button
              type="button"
              onClick={() => exportLogsAsTxt(displayedLogs)}
              disabled={!displayedLogs}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text)',
                cursor: displayedLogs ? 'pointer' : 'not-allowed',
                fontSize: 12,
                fontWeight: 500,
              }}
              title="Exporter les logs visibles en .txt"
            >
              📄 Exporter
            </button>
            <button
              type="button"
              onClick={fetchLogs}
              disabled={loading}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {loading ? 'Chargement…' : '🔄 Rafraîchir'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text)',
                fontSize: 24,
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          </div>
        </div>
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 16,
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: 12,
            lineHeight: 1.5,
            background: 'rgba(0,0,0,0.3)',
            color: 'var(--text)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {error ? (
            <div style={{ color: 'var(--error, #ef4444)' }}>{error}</div>
          ) : displayedLogs ? (
            displayedLogs
          ) : (logs && hideHttpLogs) || (filteredByHttp && logCategories.size > 0 && !displayedLogs) ? (
            <div style={{ color: 'var(--muted)' }}>
              Aucun log visible. Coche d'autres catégories ou « Tout afficher » pour les requêtes HTTP.
            </div>
          ) : (
            <div style={{ color: 'var(--muted)' }}>Aucun log disponible.</div>
          )}
        </div>
        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid var(--border)',
            fontSize: 12,
            color: 'var(--muted)',
          }}
        >
          Rafraîchissement auto 5 s • Filtre HTTP : {hideHttpLogs ? 'actif' : 'désactivé'}
          {logCategories.size > 0 && ` • Catégories : ${LOG_CATEGORIES.filter((c) => logCategories.has(c.id)).map((c) => c.label).join(', ')}`}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
