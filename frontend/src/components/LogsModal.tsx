import { useEffect, useState, useCallback, useRef, ReactElement } from 'react';
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

// Catégories de logs : sources principales + filtres spéciaux
const LOG_SOURCES = [
  { id: 'frelon' as const, label: 'Bot Frelon', default: false },
  { id: 'publisher' as const, label: 'Bot Publisher', default: true },
  { id: 'orchestrator' as const, label: 'Bot Orchestrateur', default: true },
] as const;

const LOG_FILTERS = [
  { id: 'security' as const, label: 'Sécurité', default: false },
  { id: 'debug' as const, label: 'HTTPS / Debug', default: false },
] as const;

type LogCategory = 'frelon' | 'publisher' | 'orchestrator' | 'security' | 'debug' | null;

function getLineCategory(line: string): LogCategory {
  // Filtres spéciaux
  if (/\[AUTH\]/i.test(line)) return 'security';
  if (/"(?:OPTIONS|GET)\s+\/api\/logs/i.test(line) || /aiohttp\.access/i.test(line)) return 'debug';
  
  // Sources principales
  if (/\[frelon\]/i.test(line)) return 'frelon';
  if (/\[publisher\]/i.test(line)) return 'publisher';
  if (/\[orchestrator\]/i.test(line)) return 'orchestrator';
  
  return null;
}

function filterLogs(lines: string, activeCategories: Set<string>): string {
  if (activeCategories.size === 0) return '';
  
  return lines
    .split('\n')
    .filter((line) => {
      const cat = getLineCategory(line);
      
      // Ligne sans catégorie (messages génériques) : afficher si au moins une source est active
      if (!cat) {
        return LOG_SOURCES.some((s) => activeCategories.has(s.id));
      }
      
      return activeCategories.has(cat);
    })
    .join('\n');
}

// Coloration des logs selon la source
function colorizeLogLine(line: string): ReactElement {
  const cat = getLineCategory(line);
  
  let color = 'var(--text)';
  
  if (/\[ERROR\]/i.test(line)) {
    color = '#ef4444'; // Rouge
  } else if (/\[WARNING\]/i.test(line)) {
    color = '#f59e0b'; // Orange
  } else {
    switch (cat) {
      case 'frelon':
        color = '#10b981'; // Vert
        break;
      case 'publisher':
        color = '#a78bfa'; // Violet
        break;
      case 'orchestrator':
        color = '#3b82f6'; // Bleu
        break;
      case 'security':
        color = '#f59e0b'; // Orange
        break;
      case 'debug':
        color = '#6b7280'; // Gris
        break;
    }
  }
  
  return <div style={{ color }}>{line}</div>;
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
  
  // États des catégories (sources + filtres)
  const [activeCategories, setActiveCategories] = useState<Set<string>>(() => {
    const defaults = new Set<string>();
    LOG_SOURCES.forEach((s) => s.default && defaults.add(s.id));
    LOG_FILTERS.forEach((f) => f.default && defaults.add(f.id));
    return defaults;
  });
  
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isInitialScroll, setIsInitialScroll] = useState(true);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const prevLogsRef = useRef<string>('');

  useEscapeKey(onClose, true);
  useModalScrollLock();

  const displayedLogs = filterLogs(logs, activeCategories);

  const toggleCategory = (id: string) => {
    setActiveCategories((prev) => {
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

  // Auto-refresh toutes les 5 secondes
  useEffect(() => {
    if (!loading && !error) {
      const interval = setInterval(fetchLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [loading, error, fetchLogs]);

  // Scroll initial EN BAS + auto-scroll si l'utilisateur est déjà en bas
  useEffect(() => {
    const container = logsContainerRef.current;
    if (!container || !displayedLogs) return;

    // Premier chargement : scroll en bas
    if (isInitialScroll && displayedLogs) {
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
        setIsInitialScroll(false);
      }, 100);
      return;
    }

    // Mises à jour suivantes : auto-scroll si l'utilisateur est en bas
    const isUpdate = prevLogsRef.current !== '' && prevLogsRef.current !== displayedLogs;
    prevLogsRef.current = displayedLogs;

    if (isUpdate) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;

      if (isNearBottom) {
        setTimeout(() => {
          container.scrollTop = container.scrollHeight;
        }, 0);
      }
    }
  }, [displayedLogs, isInitialScroll]);

  // Gérer l'affichage du bouton de retour en bas
  const handleScroll = () => {
    const container = logsContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
    setShowScrollButton(!isNearBottom);
  };

  // Fonction pour scroller en bas manuellement
  const scrollToBottom = () => {
    const container = logsContainerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth'
    });
  };

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
    >
      <div
        style={{
          background: 'var(--panel)',
          borderRadius: 12,
          width: '95%',
          maxWidth: 1000,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--border)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header avec titre et croix */}
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
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>📋 Logs du serveur</h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text)',
              fontSize: 28,
              cursor: 'pointer',
              lineHeight: 1,
              padding: 0,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Fermer (Echap)"
          >
            &times;
          </button>
        </div>

        {/* Filtres : 2 lignes */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            flexShrink: 0,
          }}
        >
          {/* Ligne 1 : Sources principales + Export */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {LOG_SOURCES.map((source) => (
                <label
                  key={source.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  title={
                    source.id === 'frelon'
                      ? 'Logs du bot Frelon (F95)'
                      : source.id === 'publisher'
                      ? 'Logs du bot Publisher'
                      : 'Logs d\'orchestration et démarrage'
                  }
                >
                  {/* Toggle Switch */}
                  <div
                    style={{
                      position: 'relative',
                      width: 40,
                      height: 22,
                      borderRadius: 11,
                      background: activeCategories.has(source.id)
                        ? 'var(--accent)'
                        : 'var(--border)',
                      transition: 'background 0.2s ease',
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleCategory(source.id)}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: 3,
                        left: activeCategories.has(source.id) ? 21 : 3,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.2s ease',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: activeCategories.has(source.id) ? 'var(--text)' : 'var(--muted)',
                    }}
                  >
                    {source.label}
                  </span>
                </label>
              ))}
            </div>
            
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => exportLogsAsTxt(displayedLogs)}
                disabled={!displayedLogs}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: displayedLogs ? 'var(--text)' : 'var(--muted)',
                  cursor: displayedLogs ? 'pointer' : 'not-allowed',
                  fontSize: 13,
                  fontWeight: 500,
                  opacity: displayedLogs ? 1 : 0.5,
                }}
                title="Télécharger les logs dans le dossier Téléchargements"
              >
                📥 Exporter
              </button>
            </div>
          </div>

          {/* Ligne 2 : Filtres avancés */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {LOG_FILTERS.map((filter) => (
              <label
                key={filter.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                title={
                  filter.id === 'security'
                    ? 'Afficher les tentatives d\'authentification échouées'
                    : 'Afficher les requêtes HTTP/HTTPS (aiohttp.access)'
                }
              >
                {/* Toggle Switch - compact */}
                <div
                  style={{
                    position: 'relative',
                    width: 36,
                    height: 20,
                    borderRadius: 10,
                    background: activeCategories.has(filter.id)
                      ? 'var(--accent)'
                      : 'var(--border)',
                    transition: 'background 0.2s ease',
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleCategory(filter.id)}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 3,
                      left: activeCategories.has(filter.id) ? 19 : 3,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: activeCategories.has(filter.id) ? 'var(--text)' : 'var(--muted)',
                  }}
                >
                  {filter.label}
                </span>
              </label>
            ))}
          </div>
        </div>
        {/* Zone de logs avec coloration */}
        <div
          ref={logsContainerRef}
          onScroll={handleScroll}
          style={{
            position: 'relative',
            flex: 1,
            overflow: 'auto',
            padding: 16,
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: 12,
            lineHeight: 1.6,
            background: 'rgba(0,0,0,0.4)',
            color: 'var(--text)',
          }}
        >
          {error ? (
            <div style={{ color: '#ef4444', padding: 10 }}>❌ {error}</div>
          ) : loading ? (
            <div style={{ color: 'var(--muted)', padding: 10 }}>⏳ Chargement des logs...</div>
          ) : displayedLogs ? (
            displayedLogs.split('\n').map((line, idx) => (
              <div key={idx}>{line ? colorizeLogLine(line) : '\u00A0'}</div>
            ))
          ) : (
            <div style={{ color: 'var(--muted)', padding: 10 }}>
              Aucun log visible. Active au moins une source ci-dessus.
            </div>
          )}

          {/* Bouton retour en bas (sticky) */}
          {showScrollButton && !loading && displayedLogs && (
            <button
              type="button"
              onClick={scrollToBottom}
              style={{
                position: 'sticky',
                bottom: 20,
                left: '100%',
                marginLeft: -64,
                width: 48,
                height: 48,
                borderRadius: '50%',
                border: '2px solid var(--accent)',
                background: 'var(--panel)',
                color: 'var(--accent)',
                cursor: 'pointer',
                fontSize: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                transition: 'all 0.2s ease',
                zIndex: 10,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--accent)';
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--panel)';
                e.currentTarget.style.color = 'var(--accent)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title="Retour en bas"
            >
              ↓
            </button>
          )}
        </div>
        {/* Footer avec infos et bouton Fermer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 12,
            color: 'var(--muted)',
            flexShrink: 0,
          }}
        >
          <div>
            Auto-refresh: 5s • 500 lignes
            {activeCategories.size > 0 && (
              <>
                {' • Actifs: '}
                {[...LOG_SOURCES, ...LOG_FILTERS]
                  .filter((c) => activeCategories.has(c.id))
                  .map((c) => c.label)
                  .join(', ')}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 20px',
              fontWeight: 600,
            }}
          >
            🚪 Fermer
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
