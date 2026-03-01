import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';
import { apiFetch } from '../../lib/api-helpers';
import { getSupabase } from '../../lib/supabase';
import { useApp } from '../../state/appContext';
import { useAuth } from '../../state/authContext';

import LogsFilters from './components/LogsFilters';
import LogsFooter from './components/LogsFooter';
import LogsViewer from './components/LogsViewer';
import { USER_SOURCES } from './constants';
import { exportLogsAsTxt, filterLogs } from './utils/logsUtils';

const DEFAULT_REFRESH_MS = 30000;

interface LogsModalProps {
  onClose: () => void;
  inlineMode?: boolean;
}

function getBaseUrl(apiUrl: string | undefined): string {
  const raw = (apiUrl || '').trim() || 'http://138.2.182.125:8080/api/forum-post';
  try {
    const u = new URL(raw);
    return u.origin;
  } catch {
    return raw.split('/api')[0]?.replace(/\/+$/, '') || 'http://138.2.182.125:8080';
  }
}

export default function LogsModal({ onClose, inlineMode = false }: LogsModalProps) {
  const { apiUrl } = useApp();
  const { profile } = useAuth();

  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeCategories, setActiveCategories] = useState<Set<string>>(() => {
    const defaults = new Set<string>();
    USER_SOURCES.forEach((s) => s.default && defaults.add(s.id));
    return defaults;
  });

  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isInitialScroll, setIsInitialScroll] = useState(true);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const prevLogsRef = useRef<string>('');
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
      const { data: profiles } = await sb.from('profiles').select('id, pseudo').in('id', userIds);
      if (!profiles?.length) return;
      const uuidToPseudo: Record<string, string> = {};
      profiles.forEach((p: { id: string; pseudo?: string }) => {
        uuidToPseudo[p.id] = p.pseudo || 'Utilisateur';
      });
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

  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(
    () => (localStorage.getItem('logs_auto_refresh_enabled') ?? '1') === '1'
  );
  const [refreshMs, setRefreshMs] = useState(() => {
    const n = Number(localStorage.getItem('logs_refresh_ms'));
    return Number.isFinite(n) && n >= 1000 ? n : DEFAULT_REFRESH_MS;
  });
  const [refreshSecondsInput, setRefreshSecondsInput] = useState(() => {
    const n = Number(localStorage.getItem('logs_refresh_ms'));
    const ms = Number.isFinite(n) && n >= 1000 ? n : DEFAULT_REFRESH_MS;
    return String(Math.round(ms / 1000));
  });

  const applyRefreshSeconds = useCallback((raw: string) => {
    const clamped = Math.min(Math.max(Number(raw) || 30, 5), 600);
    const ms = Math.round(clamped * 1000);
    setRefreshMs(ms);
    setRefreshSecondsInput(String(clamped));
    localStorage.setItem('logs_refresh_ms', String(ms));
  }, []);

  useEffect(() => {
    localStorage.setItem('logs_auto_refresh_enabled', autoRefreshEnabled ? '1' : '0');
  }, [autoRefreshEnabled]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

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
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
        setIsInitialScroll(false);
      }, 100);
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

  const handleScroll = useCallback(() => {
    const c = logsContainerRef.current;
    if (!c) return;
    const distanceFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
    userAtBottomRef.current = distanceFromBottom < 50;
    setShowScrollButton(distanceFromBottom >= 50);
  }, []);

  const scrollToBottom = useCallback(() => {
    userAtBottomRef.current = true;
    const el = logsContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  const handleToggleCategory = useCallback((id: string, active: boolean) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (active) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const panelStyle = {
    width: inlineMode ? 860 : '95%',
    maxWidth: inlineMode ? 860 : 1000,
    height: inlineMode ? '88vh' : undefined,
    maxHeight: '88vh',
  };

  const modalInner = (
    <div
      className="server-panel"
      style={panelStyle}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="server-panel__header server-panel__header--logs">
        <h2 className="server-panel__title" style={{ margin: 0, fontSize: '1.25rem' }}>
          📋 Logs du serveur
        </h2>
      </div>

      <LogsFilters
        activeCategories={activeCategories}
        onToggle={handleToggleCategory}
        isAdmin={isAdmin}
        onExport={() => exportLogsAsTxt(displayedLogs)}
        hasLogs={!!displayedLogs}
      />

      <LogsViewer
        containerRef={logsContainerRef}
        displayedLogs={displayedLogs}
        loading={loading}
        error={error}
        onScroll={handleScroll}
        showScrollButton={showScrollButton}
        onScrollToBottom={scrollToBottom}
      />

      <LogsFooter
        refreshMs={refreshMs}
        refreshSecondsInput={refreshSecondsInput}
        onRefreshSecondsChange={setRefreshSecondsInput}
        onRefreshSecondsBlur={applyRefreshSeconds}
        autoRefreshEnabled={autoRefreshEnabled}
        onAutoRefreshChange={setAutoRefreshEnabled}
        onRefresh={fetchLogs}
        onClose={onClose}
      />
    </div>
  );

  const modalContent = inlineMode ? (
    modalInner
  ) : (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--modal-backdrop)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        backdropFilter: 'var(--modal-backdrop-blur)',
      }}
    >
      {modalInner}
    </div>
  );

  return inlineMode ? modalContent : createPortal(modalContent, document.body);
}
