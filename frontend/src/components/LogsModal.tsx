import { ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { apiFetch } from '../lib/api-helpers';
import { getSupabase } from '../lib/supabase';
import { useApp } from '../state/appContext';
import { useAuth } from '../state/authContext'; // ✅ AJOUTÉ

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

const LOG_SOURCES = [
  { id: 'frelon' as const, label: 'Bot Frelon', default: false },
  { id: 'publisher' as const, label: 'Bot Publisher', default: true },
  { id: 'orchestrator' as const, label: 'Bot Orchestrateur', default: true },
] as const;

const LOG_FILTERS = [
  { id: 'security' as const, label: 'Sécurité', default: false },
  { id: 'publisher-requests' as const, label: 'Requêtes Discord Publisher', default: false },
  { id: 'discord-api' as const, label: 'API Discord', default: false },
  { id: 'supabase-api' as const, label: 'API Supabase', default: false },
  { id: 'debug' as const, label: 'HTTPS / Debug', default: false },
] as const;

type LogCategory = 'frelon' | 'publisher' | 'orchestrator' | 'security' | 'publisher-requests' | 'discord-api' | 'supabase-api' | 'debug' | null;

function getLineCategory(line: string): LogCategory {
  if (/\[REQUEST\].*(?:OPTIONS|GET)\s+\/api\/(?:logs|publisher\/[^\s]+)/i.test(line)) {
    return 'publisher-requests';
  }

  if (/\[discord\.(?:client|gateway)\]/i.test(line)) {
    return 'discord-api';
  }

  if (/\[AUTH\]/i.test(line)) {
    return 'security';
  }

  if (/\[httpx\].*supabase\.co/i.test(line)) {
    return 'supabase-api';
  }

  if (/\[(?:aiohttp\.|httpx)\]/i.test(line)) {
    return 'debug';
  }

  if (/\[frelon\]/i.test(line)) return 'frelon';
  if (/\[publisher\]/i.test(line)) return 'publisher';
  if (/\[orchestrator\]/i.test(line)) return 'orchestrator';

  return null;
}

function filterLogs(lines: string, activeCategories: Set<string>): string {
  if (activeCategories.size === 0) return '';

  const allLines = lines.split('\n');
  const result: string[] = [];
  let lastCategory: LogCategory = null;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const cat = getLineCategory(line);

    if (cat !== null) {
      lastCategory = cat;
      if (activeCategories.has(cat)) {
        result.push(line);
      }
    } else {
      if (lastCategory && activeCategories.has(lastCategory)) {
        const isContinuation =
          line.trim() === '' ||
          line.startsWith('  ') ||
          line.startsWith('\t') ||
          /^Traceback/i.test(line) ||
          /^  File "/.test(line) ||
          /^    /.test(line) ||
          /^[a-z_]+\.[a-z_]+\./.test(line);

        if (isContinuation) {
          result.push(line);
        } else {
          lastCategory = null;
        }
      }
    }
  }

  return result.join('\n');
}

function colorizeLogLine(line: string): ReactElement {
  const cat = getLineCategory(line);

  let color = 'var(--text)';

  if (/\[ERROR\]/i.test(line)) {
    color = '#ef4444';
  } else if (/\[WARNING\]/i.test(line)) {
    color = '#f59e0b';
  } else {
    switch (cat) {
      case 'frelon':
        color = '#10b981';
        break;
      case 'publisher':
        color = '#a78bfa';
        break;
      case 'orchestrator':
        color = '#3b82f6';
        break;
      case 'security':
        color = '#f59e0b';
        break;
      case 'publisher-requests':
        color = '#c084fc';
        break;
      case 'discord-api':
        color = '#5865f2';
        break;
      case 'supabase-api':
        color = '#34d399';
        break;
      case 'debug':
        color = '#6b7280';
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
  const { profile } = useAuth(); // ✅ AJOUTÉ

  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // ✅ AJOUTÉ : Filtrer les sources visibles selon droits admin
  const visibleSources = LOG_SOURCES.filter(source => {
    if (source.id === 'publisher' || source.id === 'orchestrator') {
      return true;
    }
    return profile?.is_master_admin === true;
  });

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
      const res = await apiFetch(`${base}/api/logs`, apiKey);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erreur ${res.status}`);
      }
      const data = await res.json();
      setLogs(data.logs || '');
      if (data.unique_user_ids && data.unique_user_ids.length > 0) {
        await enrichLogsWithUsernames(data.logs, data.unique_user_ids);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  const enrichLogsWithUsernames = async (rawLogs: string, userIds: string[]) => {
    try {
      const sb = getSupabase();
      if (!sb || userIds.length === 0) return;

      const { data: profiles } = await sb
        .from('profiles')
        .select('id, pseudo')
        .in('id', userIds);

      if (!profiles || profiles.length === 0) return;

      const uuidToPseudo: Record<string, string> = {};
      profiles.forEach(p => {
        uuidToPseudo[p.id] = p.pseudo || 'Utilisateur';
      });

      let enrichedLogs = rawLogs;
      Object.entries(uuidToPseudo).forEach(([uuid, pseudo]) => {
        const regex = new RegExp(` \\| ${uuid.replace(/-/g, '\\-')} \\| `, 'g');
        enrichedLogs = enrichedLogs.replace(regex, ` | @${pseudo} | `);
      });

      setLogs(enrichedLogs);
    } catch (error) {
      console.warn('[Logs] ⚠️ Erreur enrichissement avec pseudos:', error);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!loading && !error) {
      const interval = setInterval(fetchLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [loading, error, fetchLogs]);

  useEffect(() => {
    const container = logsContainerRef.current;
    if (!container || !displayedLogs) return;

    if (isInitialScroll && displayedLogs) {
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
        setIsInitialScroll(false);
      }, 100);
      return;
    }

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

  const handleScroll = () => {
    const container = logsContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
    setShowScrollButton(!isNearBottom);
  };

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
              {/* ✅ MODIFIÉ : utiliser visibleSources */}
              {visibleSources.map((source) => (
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

          {/* ✅ MODIFIÉ : Ligne 2 conditionnelle pour admin uniquement */}
          {profile?.is_master_admin && (
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
                      ? "Afficher les tentatives d'authentification échouées"
                      : filter.id === 'publisher-requests'
                        ? "Afficher les requêtes Discord Publisher (GET/OPTIONS sur /api/logs, /api/publisher/*, /api/publisher/health...) - masquées par défaut"
                        : filter.id === 'discord-api'
                          ? "Afficher les logs API Discord ([discord.client], [discord.gateway])"
                          : filter.id === 'supabase-api'
                            ? "Afficher les requêtes HTTP vers Supabase (lectures/écritures base de données)"
                            : 'Afficher les requêtes HTTP/HTTPS (aiohttp.access)'
                  }
                >
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
          )}
        </div>

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
            displayedLogs.split('\n').map((line: string, idx: number) => (
              <div key={idx}>{line ? colorizeLogLine(line) : '\u00A0'}</div>
            ))
          ) : (
            <div style={{ color: 'var(--muted)', padding: 10 }}>
              Aucun log visible. Active au moins une source ci-dessus.
            </div>
          )}

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
            Auto-refresh: 5s • fichier courant complet
            <span
              style={{
                marginLeft: 8,
                textDecoration: 'underline dotted',
                cursor: 'help',
              }}
              title="Pour accéder à l'intégralité de l'historique (archives), contactez le développeur. Seul le fichier de logs courant (max 5 Mo) est affiché ici."
            >
              ℹ️
            </span>
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
