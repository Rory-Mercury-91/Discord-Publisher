import { ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { apiFetch } from '../lib/api-helpers';
import { getSupabase } from '../lib/supabase';
import { useApp } from '../state/appContext';
import { useAuth } from '../state/authContext';
import Toggle from './Toggle';

const DEFAULT_BASE = 'http://138.2.182.125:8080';

interface LogsModalProps {
  onClose: () => void;
  inlineMode?: boolean;
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

// ============================================================
// SOURCES UTILISATEUR — visibles par tous, actives par defaut
// Ce sont les logs directement utiles pour le suivi quotidien
// ============================================================
const USER_SOURCES = [
  { id: 'publisher' as const, label: 'Publisher', default: true },
  { id: 'api' as const, label: 'API REST', default: true },
  { id: 'scheduler' as const, label: 'Planificateur', default: true },
  { id: 'f95' as const, label: 'Versions F95', default: true },
] as const;

// ============================================================
// SOURCES ADMIN — masquees pour les non-admins, desactivees par defaut
// ============================================================
const ADMIN_SOURCES = [
  { id: 'frelon' as const, label: 'Bot Frelon', default: false },
  { id: 'orchestrator' as const, label: 'Orchestrateur', default: false },
] as const;

// ============================================================
// FILTRES ADMIN — details techniques, desactives par defaut
// ============================================================
const ADMIN_FILTERS = [
  { id: 'security' as const, label: 'Securite', default: false },
  { id: 'publisher-requests' as const, label: 'Requetes Publisher', default: false },
  { id: 'discord-api' as const, label: 'API Discord', default: false },
  { id: 'supabase-api' as const, label: 'API Supabase', default: false },
  { id: 'auth' as const, label: 'Auth details', default: false },
  { id: 'debug' as const, label: 'HTTPS / Debug', default: false },
] as const;

type LogCategory =
  | 'publisher' | 'api' | 'scheduler' | 'f95'
  | 'frelon' | 'orchestrator'
  | 'security' | 'publisher-requests' | 'discord-api'
  | 'supabase-api' | 'auth' | 'debug'
  | null;

function getLineCategory(line: string): LogCategory {
  const l = line.toLowerCase();

  // ── Priorites hautes (eviter faux positifs) ──────────────────

  // Rate limit Discord -> discord-api
  if (l.includes('rate limit proche') || l.includes('requests remaining')) {
    return 'discord-api';
  }

  // Requetes vers notre API (logs, publisher/health, etc.) -> publisher-requests
  // (avant isSuspicious pour ne pas envoyer NOKEY|GET /api/publisher/health en debug)
  if (/\[REQUEST\].*(?:OPTIONS|GET|POST)\s+\/api\/(?:logs|publisher\/[^\s]+)/i.test(line)) {
    return 'publisher-requests';
  }

  // Tentatives exploitation / erreurs HTTP -> debug (sans inclure NOKEY sur /api/...)
  const isSuspicious =
    l.includes('[http_error]') ||
    (l.includes('nokey') && !l.includes('/api/')) ||
    (l.includes('status=404') && !l.includes('/api/')) ||
    (l.includes('get /') && !l.includes('/api/'));
  if (isSuspicious) return 'debug';

  // ── Nouveaux loggers [nom] ───────────────────────────────────

  if (/\[auth\]/i.test(line)) {
    // Les echecs auth restent dans security, les succes dans auth
    if (l.includes('echec') || l.includes('refuse') || l.includes('invalide')) {
      return 'security';
    }
    return 'auth';
  }

  if (/\[f95\]/i.test(line)) return 'f95';
  if (/\[scheduler\]/i.test(line)) return 'scheduler';
  if (/\[api\]/i.test(line)) return 'api';
  if (/\[supabase\]/i.test(line)) return 'supabase-api';
  if (/\[frelon\]/i.test(line)) return 'frelon';
  if (/\[orchestrator\]/i.test(line)) return 'orchestrator';

  // publisher couvre publisher + slash commands
  if (/\[publisher\]/i.test(line)) return 'publisher';

  // ── Patterns legacy (compatibilite anciens logs) ─────────────

  if (/\[discord\.(?:client|gateway)\]/i.test(line)) return 'discord-api';
  if (/\[AUTH\]/i.test(line)) return 'security';
  if (/\[httpx\].*supabase\.co/i.test(line)) return 'supabase-api';
  if (/\[(?:aiohttp\.|httpx)\]/i.test(line)) return 'debug';

  return null;
}

function filterLogs(lines: string, activeCategories: Set<string>): string {
  if (activeCategories.size === 0) return '';

  const allLines = lines.split('\n');
  const result: string[] = [];
  let lastCategory: LogCategory = null;

  for (const line of allLines) {
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

  if (/\[ERROR\]/i.test(line)) { color = '#ef4444'; }
  else if (/\[WARNING\]/i.test(line)) { color = '#f59e0b'; }
  else {
    switch (cat) {
      // Sources utilisateur
      case 'publisher': color = '#a78bfa'; break;
      case 'api': color = '#f97316'; break;
      case 'scheduler': color = '#38bdf8'; break;
      case 'f95': color = '#e879f9'; break;
      // Sources admin
      case 'frelon': color = '#10b981'; break;
      case 'orchestrator': color = '#3b82f6'; break;
      // Filtres admin
      case 'security': color = '#f59e0b'; break;
      case 'publisher-requests': color = '#c084fc'; break;
      case 'discord-api': color = '#5865f2'; break;
      case 'supabase-api': color = '#34d399'; break;
      case 'auth': color = '#fbbf24'; break;
      case 'debug': color = '#6b7280'; break;
    }
  }

  return (
    <div style={{ color, wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
      {line}
    </div>
  );
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

// ── Composant principal ──────────────────────────────────────────────────────
export default function LogsModal({ onClose, inlineMode = false }: LogsModalProps) {
  const { apiUrl } = useApp();
  const { profile } = useAuth();

  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeCategories, setActiveCategories] = useState<Set<string>>(() => {
    const defaults = new Set<string>();
    USER_SOURCES.forEach(s => s.default && defaults.add(s.id));
    // Admin sources et filtres tous desactives par defaut
    return defaults;
  });

  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isInitialScroll, setIsInitialScroll] = useState(true);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const prevLogsRef = useRef<string>('');
  /** True si l'utilisateur est (ou était) en bas : on garde l'auto-scroll tant qu'il ne remonte pas */
  const userAtBottomRef = useRef(true);

  const isAdmin = profile?.is_master_admin === true;

  useEscapeKey(onClose, true);
  useModalScrollLock();

  const displayedLogs = filterLogs(logs, activeCategories);

  const fetchLogs = useCallback(async () => {
    const base = getBaseUrl(apiUrl);
    const apiKey = localStorage.getItem('apiKey') || '';
    if (!apiKey) {
      setError('Cle API manquante. Configurez-la dans Parametres.');
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
      if (data.unique_user_ids?.length > 0) {
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
        .from('profiles').select('id, pseudo').in('id', userIds);
      if (!profiles?.length) return;
      const uuidToPseudo: Record<string, string> = {};
      profiles.forEach(p => { uuidToPseudo[p.id] = p.pseudo || 'Utilisateur'; });
      let enriched = rawLogs;
      Object.entries(uuidToPseudo).forEach(([uuid, pseudo]) => {
        const regex = new RegExp(` \\| ${uuid.replace(/-/g, '\\-')} \\| `, 'g');
        enriched = enriched.replace(regex, ` | @${pseudo} | `);
      });
      setLogs(enriched);
    } catch (e) {
      console.warn('[Logs] Erreur enrichissement pseudos :', e);
    }
  };

  const DEFAULT_REFRESH_MS = 30000;
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(() =>
    (localStorage.getItem('logs_auto_refresh_enabled') ?? '1') === '1'
  );
  const [refreshMs, setRefreshMs] = useState(() => {
    const n = Number(localStorage.getItem('logs_refresh_ms'));
    return Number.isFinite(n) && n >= 1000 ? n : DEFAULT_REFRESH_MS;
  });
  const [refreshSecondsInput, setRefreshSecondsInput] = useState(() =>
    String(Math.round(refreshMs / 1000))
  );

  const applyRefreshSeconds = (raw: string) => {
    const clamped = Math.min(Math.max(Number(raw) || 30, 5), 600);
    const ms = Math.round(clamped * 1000);
    setRefreshMs(ms);
    setRefreshSecondsInput(String(clamped));
    localStorage.setItem('logs_refresh_ms', String(ms));
  };

  useEffect(() => {
    localStorage.setItem('logs_auto_refresh_enabled', autoRefreshEnabled ? '1' : '0');
  }, [autoRefreshEnabled]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefreshEnabled || loading || error) return;
    const interval = setInterval(fetchLogs, refreshMs);
    return () => clearInterval(interval);
  }, [autoRefreshEnabled, loading, error, fetchLogs, refreshMs]);

  useEffect(() => {
    const container = logsContainerRef.current;
    if (!container || !displayedLogs) return;
    if (isInitialScroll) {
      userAtBottomRef.current = true;
      setTimeout(() => { container.scrollTop = container.scrollHeight; setIsInitialScroll(false); }, 100);
      return;
    }
    const isUpdate = prevLogsRef.current !== '' && prevLogsRef.current !== displayedLogs;
    prevLogsRef.current = displayedLogs;
    if (isUpdate && userAtBottomRef.current) {
      setTimeout(() => {
        const el = logsContainerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, 0);
    }
  }, [displayedLogs, isInitialScroll]);

  const handleScroll = () => {
    const c = logsContainerRef.current;
    if (!c) return;
    const distanceFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
    userAtBottomRef.current = distanceFromBottom < 50;
    setShowScrollButton(distanceFromBottom >= 50);
  };

  const scrollToBottom = () => {
    userAtBottomRef.current = true;
    const el = logsContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const modalInner = (
    <div
      style={{
        background: 'var(--panel)',
        borderRadius: 12,
        // Taille fixe en mode inline (côte à côte), fluide en mode solo
        width: inlineMode ? 860 : '95%',
        maxWidth: inlineMode ? 860 : 1000,
        height: inlineMode ? '88vh' : undefined,
        maxHeight: '88vh',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--border)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        position: 'relative',
        flexShrink: 0,
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* ── Header ── */}
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
      }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>📋 Logs du serveur</h2>
      </div>

      {/* ── Filtres ── */}
      <div style={{
        padding: '12px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0,
      }}>
        {USER_SOURCES.map(s => (
          <Toggle
            key={s.id}
            checked={activeCategories.has(s.id)}
            onChange={(active) => {
              setActiveCategories(prev => {
                const next = new Set(prev);
                if (active) next.add(s.id); else next.delete(s.id);
                return next;
              });
            }}
            label={s.label}
            title={
              s.id === 'publisher' ? 'Logs du bot Publisher (publications, MAJ, suppressions)' :
                s.id === 'api' ? 'Logs des requetes REST entrantes (/api/forum-post, /api/history...)' :
                  s.id === 'scheduler' ? 'Logs des taches planifiees (version check, cleanup, sync jeux)' :
                    'Logs du controle des versions F95 (differences detectees, mises a jour)'
            }
          />
        ))}
        {isAdmin && ADMIN_SOURCES.map(s => (
          <Toggle
            key={s.id}
            checked={activeCategories.has(s.id)}
            onChange={(active) => {
              setActiveCategories(prev => {
                const next = new Set(prev);
                if (active) next.add(s.id); else next.delete(s.id);
                return next;
              });
            }}
            label={s.label}
            title={
              s.id === 'frelon' ? 'Logs du bot Frelon (rappels F95fr)' :
                'Logs de l\'orchestrateur (demarrage, supervision des bots)'
            }
          />
        ))}
        {isAdmin && ADMIN_FILTERS.map(f => (
          <Toggle
            key={f.id}
            checked={activeCategories.has(f.id)}
            onChange={(active) => {
              setActiveCategories(prev => {
                const next = new Set(prev);
                if (active) next.add(f.id); else next.delete(f.id);
                return next;
              });
            }}
            label={f.label}
            title={
              f.id === 'security' ? 'Tentatives d\'authentification echouees' :
                f.id === 'publisher-requests' ? 'Requetes OPTIONS/GET internes (CORS, health...)' :
                  f.id === 'discord-api' ? 'Appels REST vers l\'API Discord (rate limit inclus)' :
                    f.id === 'supabase-api' ? 'Requetes vers Supabase (lectures/ecritures BDD)' :
                      f.id === 'auth' ? 'Details validation cles API (succes inclus)' :
                        'Requetes HTTP/HTTPS brutes (aiohttp, debug)'
            }
          />
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <button
            type="button" onClick={() => exportLogsAsTxt(displayedLogs)}
            disabled={!displayedLogs}
            style={{
              padding: '7px 14px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'transparent',
              color: displayedLogs ? 'var(--text)' : 'var(--muted)',
              cursor: displayedLogs ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 500, opacity: displayedLogs ? 1 : 0.5,
            }}
            title="Telecharger les logs filtres"
          >📥 Exporter</button>
        </div>
      </div>

      {/* ── Zone logs (retour à la ligne auto + numéros de ligne) ── */}
      <div
        ref={logsContainerRef}
        onScroll={handleScroll}
        style={{
          position: 'relative',
          flex: 1,
          overflow: 'auto',
          overflowWrap: 'anywhere',
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: 12,
          lineHeight: 1.6,
          background: 'rgba(0,0,0,0.4)',
          color: 'var(--text)',
          padding: '16px 16px 16px 8px',
        }}
      >
        {error ? (
          <div style={{ color: '#ef4444' }}>❌ {error}</div>
        ) : loading ? (
          <div style={{ color: 'var(--muted)' }}>⏳ Chargement des logs...</div>
        ) : displayedLogs ? (
          <div style={{ minWidth: 0 }}>
            {displayedLogs.split('\n').map((line, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  minWidth: 0,
                  lineHeight: 1.6,
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: 52,
                    paddingRight: 12,
                    textAlign: 'right',
                    color: 'var(--muted)',
                    userSelect: 'none',
                    alignSelf: 'flex-start',
                  }}
                >
                  {idx + 1}
                </div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    paddingLeft: 4,
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {line ? colorizeLogLine(line) : '\u00A0'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--muted)', padding: 16 }}>
            Aucun log visible. Activez au moins une source ci-dessus.
          </div>
        )}

        {showScrollButton && !loading && displayedLogs && (
          <button
            type="button"
            onClick={scrollToBottom}
            title="Retour en bas"
            style={{
              position: 'sticky',
              bottom: 24,
              right: 16,
              left: 'auto',
              marginLeft: 0,
              width: 52,
              height: 52,
              borderRadius: '50%',
              border: '2px solid rgba(99,102,241,0.5)',
              background: 'linear-gradient(180deg, rgba(99,102,241,0.2) 0%, rgba(99,102,241,0.08) 100%)',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontSize: 24,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(99,102,241,0.2)',
              transition: 'all 0.25s ease',
              zIndex: 10,
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              el.style.background = 'var(--accent)';
              el.style.color = '#fff';
              el.style.borderColor = 'var(--accent)';
              el.style.transform = 'scale(1.08)';
              el.style.boxShadow = '0 6px 24px rgba(99,102,241,0.45), 0 0 0 1px rgba(99,102,241,0.3)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              el.style.background = 'linear-gradient(180deg, rgba(99,102,241,0.2) 0%, rgba(99,102,241,0.08) 100%)';
              el.style.color = 'var(--accent)';
              el.style.borderColor = 'rgba(99,102,241,0.5)';
              el.style.transform = 'scale(1)';
              el.style.boxShadow = '0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(99,102,241,0.2)';
            }}
          >
            ▼
          </button>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        padding: '12px 20px', borderTop: '1px solid var(--border)',
        flexShrink: 0, display: 'grid',
        gridTemplateColumns: '1fr auto', gridTemplateRows: 'auto auto',
        gap: 10, fontSize: 12, color: 'var(--muted)', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>Auto-refresh : {Math.round(refreshMs / 1000)}s • fichier courant complet</span>
          <span
            style={{ textDecoration: 'underline dotted', cursor: 'help' }}
            title="Seul le fichier de logs courant (max 5 Mo) est affiche. Pour l'historique complet, contactez le developpeur."
          >ℹ️</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
          <Toggle
            checked={autoRefreshEnabled}
            onChange={setAutoRefreshEnabled}
            label="Auto-refresh"
            title="Active/desactive l'actualisation automatique"
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Delai (s)
            <input
              type="number" min={5} max={600} step={5}
              value={refreshSecondsInput}
              onChange={e => setRefreshSecondsInput(e.target.value)}
              onBlur={e => applyRefreshSeconds(e.target.value)}
              disabled={!autoRefreshEnabled}
              style={{
                width: 64, padding: '4px 6px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'transparent', color: 'inherit',
              }}
            />
          </label>
          <button
            type="button" onClick={fetchLogs}
            style={{ padding: '6px 12px', fontWeight: 600, borderRadius: 8 }}
          >🔄 Rafraichir</button>
        </div>

        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center' }}>
          <button
            type="button" onClick={onClose}
            style={{ padding: '8px 22px', fontWeight: 700, borderRadius: 10 }}
          >↩️ Fermer</button>
        </div>
      </div>
    </div>
  );

  // Wrapper conditionnel : backdrop uniquement en mode solo
  const modalContent = inlineMode
    ? modalInner
    : (
      <div style={{
        position: 'fixed', inset: 0,
        background: 'var(--modal-backdrop)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 99999, backdropFilter: 'var(--modal-backdrop-blur)',
      }}>
        {modalInner}
      </div>
    );

  // Portal uniquement en mode solo
  return inlineMode
    ? modalContent
    : createPortal(modalContent, document.body);
}
