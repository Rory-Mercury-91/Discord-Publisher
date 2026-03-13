// frontend/src/components/Settings/components/EnrichmentSettings.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../../state/appContext';
import { tauriAPI } from '../../../lib/tauri-api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBase(apiUrl?: string): string {
  const raw = (apiUrl || '').trim() || 'http://138.2.182.125:8080';
  try { return new URL(raw).origin; }
  catch { return raw.split('/api')[0]?.replace(/\/+$/, '') || 'http://138.2.182.125:8080'; }
}

const getKey = () => localStorage.getItem('apiKey') || '';

// ── Types ─────────────────────────────────────────────────────────────────────

type SynopsisStats = {
  total_groups:        number;
  with_synopsis_en:    number;
  with_synopsis_fr:    number;
  missing_synopsis_fr: number;
  enrichable_count:    number; // sous-ensemble de missing scrappable (F95Zone uniquement)
};

// MissingEntry couvre à la fois les entrées "sans synopsis FR" ET les échecs du dernier run.
// can_enrich : présent dans les entrées venant des stats (true = URL F95Zone valide)
// raison (stats) : url_manquante | lewdcorner | url_non_f95
// raison (run)   : synopsis_introuvable | traduction_echouee | url_incoherente
type MissingEntry = {
  id:          number;
  nom_du_jeu:  string;
  nom_url:     string;
  site_id:     number;
  synopsis_en: string;
  group_ids:   number[];
  can_enrich?: boolean;
  raison?:     string;
};

// ── Log colorization ──────────────────────────────────────────────────────────

const LOG_STYLES: [string[], React.CSSProperties][] = [
  [['🚫'],                                   { color: '#ef4444', fontWeight: 700 }],
  [['❌'],                                   { color: '#ef4444' }],
  [['🎉'],                                   { color: '#10b981', fontWeight: 700 }],
  [['✅'],                                   { color: '#10b981' }],
  [['🕷️', '🌐'],                            { color: '#38bdf8' }],
  [['⏭️'],                                  { color: 'var(--muted)', fontStyle: 'italic' }],
  [['📥', '📊', '🔍', '🎮', 'ℹ️', '🔄'],  { color: 'var(--muted)', fontStyle: 'italic' }],
];

function logLineStyle(line: string): React.CSSProperties {
  for (const [prefixes, style] of LOG_STYLES) {
    if (prefixes.some(p => line.startsWith(p))) return style;
  }
  return {};
}

// ── Raison badge ──────────────────────────────────────────────────────────────

const RAISON_CFG: Record<string, { bg: string; label: string }> = {
  // Raisons issues du run d'enrichissement
  synopsis_introuvable: { bg: '#f59e0b', label: 'Synopsis introuvable' },
  traduction_echouee:   { bg: '#6b7280', label: 'Traduction échouée'   },
  url_incoherente:      { bg: '#ef4444', label: 'URL incorrecte'        },
  // Raisons issues des stats (entrées non-enrichissables automatiquement)
  lewdcorner:           { bg: '#8b5cf6', label: 'LewdCorner'            },
  url_manquante:        { bg: '#6b7280', label: 'URL manquante'         },
  url_non_f95:          { bg: '#6b7280', label: 'URL non-F95'           },
};

function RaisonBadge({ raison }: { raison?: string }) {
  if (!raison) return null;
  const c = RAISON_CFG[raison];
  return (
    <span style={{
      background: c?.bg ?? '#6b7280', color: '#fff',
      borderRadius: 4, padding: '1px 7px', fontSize: 11,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {c?.label ?? raison}
    </span>
  );
}

// ── ConfirmInline ─────────────────────────────────────────────────────────────

interface ConfirmInlineProps {
  step:            number;
  steps:           { label: string; btnClass: string; btnLabel: string }[];
  initialLabel:    string;
  initialBtnClass: string;
  loading:         boolean;
  loadingLabel:    string;
  onStep:          () => void;
  onCancel:        () => void;
}

function ConfirmInline({
  step, steps, initialLabel, initialBtnClass,
  loading, loadingLabel, onStep, onCancel,
}: ConfirmInlineProps) {
  if (loading) return <span style={{ fontSize: 13, color: 'var(--muted)' }}>{loadingLabel}</span>;
  if (step === 0) return <button className={`server-btn ${initialBtnClass}`} onClick={onStep}>{initialLabel}</button>;
  const cfg = steps[step - 1];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13 }}>{cfg.label}</span>
      <button className={`server-btn ${cfg.btnClass}`} onClick={onStep}>{cfg.btnLabel}</button>
      <button className="server-btn server-btn--default" onClick={onCancel}>Annuler</button>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EnrichmentSettings() {
  const { apiUrl } = useApp();
  const base = getBase(apiUrl);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const [stats,          setStats]       = useState<SynopsisStats | null>(null);
  const [missingEntries, setMissing]     = useState<MissingEntry[]>([]);
  const [statsLoading,   setStatsLoad]   = useState(false);
  const [statsError,     setStatsError]  = useState<string | null>(null);
  const [missingFilter,  setMissingFilter] = useState('');

  // ── Enrichment streaming ──────────────────────────────────────────────────
  const [enrichLogs,     setEnrichLogs]     = useState<string[]>([]);
  const [enrichRunning,  setEnrichRunning]  = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{ current: number; total: number } | null>(null);
  const [enrichForce,    setEnrichForce]    = useState(false);
  // Échecs du dernier run (même type que MissingEntry pour permettre l'édition inline)
  const [failedEntries,  setFailed]         = useState<MissingEntry[]>([]);

  // ── Scroll logs — conteneur uniquement ───────────────────────────────────
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const userAtBottomRef  = useRef(true);
  const abortRef         = useRef<AbortController | null>(null);

  // ── Per-entry retry ───────────────────────────────────────────────────────
  const [retryingIds, setRetryingIds] = useState<Set<number>>(new Set());

  // ── Inline edit ───────────────────────────────────────────────────────────
  const [editingId,  setEditingId]  = useState<number | null>(null);
  const [editEn,     setEditEn]     = useState('');
  const [editFr,     setEditFr]     = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState<string | null>(null);

  // ── Reset synopsis ────────────────────────────────────────────────────────
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult,  setResetResult]  = useState<string | null>(null);
  const [resetStep,    setResetStep]    = useState(0);

  // ── Force sync ────────────────────────────────────────────────────────────
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult,  setSyncResult]  = useState<{ ok: boolean; msg: string } | null>(null);
  const [syncStep,    setSyncStep]    = useState(0);

  // ── Scroll interne au conteneur de logs uniquement ────────────────────────
  useEffect(() => {
    const c = logsContainerRef.current;
    if (!c || !userAtBottomRef.current) return;
    c.scrollTop = c.scrollHeight;
  }, [enrichLogs]);

  // ── fetchStats ────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    setStatsLoad(true);
    setStatsError(null);
    try {
      const res  = await fetch(`${base}/api/enrich/synopsis-stats`, { headers: { 'X-API-KEY': getKey() } });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Erreur stats');
      setStats(data.stats);
      setMissing(data.missing_entries ?? []);
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatsLoad(false);
    }
  }, [base]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ── Enrichissement (global OU ciblé par IDs) ──────────────────────────────
  const startEnrichment = useCallback(async (targetIds?: number[]) => {
    if (enrichRunning) return;

    setEnrichLogs(
      targetIds?.length
        ? [`🎯 Relance pour ${targetIds.length} entrée(s) ciblée(s)…`]
        : ['🚀 Démarrage de l\'enrichissement…'],
    );
    setEnrichProgress(null);
    if (!targetIds?.length) setFailed([]);
    setEnrichRunning(true);
    abortRef.current = new AbortController();

    try {
      const f95Cookies = (() => { try { return localStorage.getItem('f95_cookies') || ''; } catch { return ''; } })();

      const body: Record<string, unknown> = {
        force: targetIds?.length ? true : enrichForce,
        ...(f95Cookies ? { f95_cookies: f95Cookies } : {}),
      };
      if (targetIds?.length) body.target_ids = targetIds;

      const res = await fetch(`${base}/api/scrape/enrich`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': getKey() },
        body:    JSON.stringify(body),
        signal:  abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buf      = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const raw of lines) {
          const t = raw.trim();
          if (!t) continue;
          try {
            const msg = JSON.parse(t);
            if (msg.log)      setEnrichLogs(p => [...p, msg.log]);
            if (msg.progress) setEnrichProgress(msg.progress);
            if (msg.status === 'completed') {
              setEnrichLogs(p => [...p, '✅ Enrichissement terminé avec succès']);
              if (msg.failed_entries?.length) setFailed(msg.failed_entries);
              await fetchStats();
            }
            if (msg.error) setEnrichLogs(p => [...p, `❌ Erreur : ${msg.error}`]);
          } catch { /* ignore JSON parse errors */ }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setEnrichLogs(p => [...p, '⏸️ Enrichissement annulé']);
      } else if (e instanceof Error) {
        setEnrichLogs(p => [...p, `❌ Connexion interrompue : ${e.message}`]);
      }
    } finally {
      setEnrichRunning(false);
      abortRef.current = null;
      if (targetIds?.length) {
        setRetryingIds(prev => {
          const next = new Set(prev);
          targetIds.forEach(id => next.delete(id));
          return next;
        });
      }
    }
  }, [enrichRunning, enrichForce, base, fetchStats]);

  // ── Retry d'une entrée individuelle ──────────────────────────────────────
  const handleRetryEntry = (entry: MissingEntry) => {
    if (enrichRunning) return;
    const ids = entry.group_ids?.length ? entry.group_ids : [entry.id];
    ids.forEach(id => setRetryingIds(prev => new Set(prev).add(id)));
    startEnrichment(ids);
  };

  // ── Édition inline synopsis ───────────────────────────────────────────────
  const handleOpenEdit = (entry: MissingEntry) => {
    setEditingId(entry.id);
    setEditEn(entry.synopsis_en || '');
    setEditFr('');
    setEditError(null);
  };

  const handleSaveEdit = async (entry: MissingEntry) => {
    if (!editEn && !editFr) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`${base}/api/f95-jeux/${entry.id}/synopsis`, {
        method:  'PATCH',
        headers: { 'X-API-KEY': getKey(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...(editEn ? { synopsis_en: editEn } : {}),
          ...(editFr ? { synopsis_fr: editFr } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      setEditingId(null);
      if (editFr) {
        setMissing(prev => prev.filter(e => e.id !== entry.id));
        setFailed(prev  => prev.filter(e => e.id !== entry.id));
        setStats(prev => prev ? {
          ...prev,
          with_synopsis_fr:    prev.with_synopsis_fr    + 1,
          missing_synopsis_fr: prev.missing_synopsis_fr - 1,
          enrichable_count:    entry.can_enrich !== false
            ? Math.max(0, prev.enrichable_count - 1)
            : prev.enrichable_count,
        } : null);
      }
    } catch (e) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditSaving(false);
    }
  };

  // ── Reset synopsis ────────────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    if (resetStep < 2) { setResetStep(s => s + 1); return; }
    setResetLoading(true);
    setResetResult(null);
    setResetStep(0);
    try {
      const res  = await fetch(`${base}/api/enrich/reset-synopsis`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': getKey() },
        body:    JSON.stringify({ confirm: 'RESET' }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Erreur reset');
      setResetResult(`✅ ${data.message}`);
      await fetchStats();
    } catch (e) {
      setResetResult(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setResetLoading(false);
    }
  }, [resetStep, base, fetchStats]);

  // ── Force sync ────────────────────────────────────────────────────────────
  const handleForceSync = useCallback(async () => {
    if (syncStep < 2) { setSyncStep(s => s + 1); return; }
    setSyncLoading(true);
    setSyncResult(null);
    setSyncStep(0);
    try {
      const res  = await fetch(`${base}/api/jeux/sync-force`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': getKey() },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Erreur sync');
      setSyncResult({ ok: true, msg: `✅ ${data.synced_count} jeux synchronisés depuis l'API` });
      await fetchStats();
    } catch (e) {
      setSyncResult({ ok: false, msg: `❌ ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSyncLoading(false);
    }
  }, [syncStep, base, fetchStats]);

  // ── Dérivés ───────────────────────────────────────────────────────────────
  const pct = enrichProgress && enrichProgress.total > 0
    ? Math.round((enrichProgress.current / enrichProgress.total) * 100)
    : 0;

  const filteredMissing = missingFilter.trim()
    ? missingEntries.filter(e =>
        e.nom_du_jeu.toLowerCase().includes(missingFilter.toLowerCase()) ||
        e.nom_url.toLowerCase().includes(missingFilter.toLowerCase())
      )
    : missingEntries;

  // Entrées enrichissables parmi les filtrées (pour le bouton "Tout relancer")
  const filteredEnrichable = filteredMissing.filter(e => e.can_enrich !== false);

  // Si des échecs existent pour le dernier run, on les affiche en priorité
  const displayedMissing   = failedEntries.length > 0 ? failedEntries : filteredMissing;
  const showMissingSection = missingEntries.length > 0 || failedEntries.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ════════════ Stats synopsis ════════════ */}
      <section className="server-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h4 style={{ margin: 0, fontSize: '0.9rem' }}>📊 Statistiques des synopsis</h4>
          <button className="server-btn server-btn--default" onClick={fetchStats} disabled={statsLoading}>
            {statsLoading ? '⏳…' : '🔄 Actualiser'}
          </button>
        </div>

        {statsError && (
          <div style={{ color: 'var(--error)', fontSize: 13, marginTop: 8 }}>❌ {statsError}</div>
        )}

        {stats && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 10 }}>
              {[
                { label: 'Groupes total',    value: stats.total_groups,        color: 'var(--text)' },
                { label: 'Avec synopsis EN', value: stats.with_synopsis_en,    color: '#38bdf8'     },
                { label: 'Avec synopsis FR', value: stats.with_synopsis_fr,    color: '#10b981'     },
                {
                  label: `Sans synopsis FR${
                    stats.enrichable_count < stats.missing_synopsis_fr
                      ? ` (${stats.enrichable_count} enrichissable${stats.enrichable_count > 1 ? 's' : ''})`
                      : ''
                  }`,
                  value: stats.missing_synopsis_fr,
                  color: '#f59e0b',
                },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  background: 'var(--bg-secondary, rgba(255,255,255,0.04))',
                  borderRadius: 8, padding: '10px 14px',
                }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Explication si liste enrichissable < total manquant */}
            {stats.enrichable_count < stats.missing_synopsis_fr && (
              <div style={{
                marginTop: 10, padding: '8px 12px', borderRadius: 6,
                background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
                fontSize: 12, color: 'var(--muted)', lineHeight: 1.6,
              }}>
                ℹ️ Sur les <strong style={{ color: 'var(--text)' }}>{stats.missing_synopsis_fr}</strong> groupes
                sans synopsis FR, <strong style={{ color: '#10b981' }}>{stats.enrichable_count}</strong> ont
                une URL F95Zone et peuvent être enrichis automatiquement.
                Les <strong style={{ color: '#f59e0b' }}>{stats.missing_synopsis_fr - stats.enrichable_count}</strong> restants
                sont des entrées LewdCorner, sans URL ou avec une URL non reconnue — ils apparaissent dans
                la liste ci-dessous avec un badge coloré et ne peuvent pas être scrappés automatiquement.
              </div>
            )}
          </>
        )}
      </section>

      {/* ════════════ Enrichissement ════════════ */}
      <section className="server-section">
        <h4 style={{ margin: '0 0 6px', fontSize: '0.9rem' }}>🕷️ Enrichissement des synopsis</h4>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)' }}>
          Scrape F95Zone pour chaque groupe sans synopsis FR et traduit EN → FR.
          Les synopsis déjà présents sont ignorés sauf avec l'option « Forcer ».
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={enrichForce}
              onChange={e => setEnrichForce(e.target.checked)}
              disabled={enrichRunning}
            />
            Forcer la re-traduction (écraser les synopsis existants)
          </label>

          {!enrichRunning ? (
            <button className="server-btn server-btn--default" onClick={() => startEnrichment()}>
              ▶️ Lancer l'enrichissement
            </button>
          ) : (
            <button className="server-btn server-btn--danger" onClick={() => abortRef.current?.abort()}>
              ⏹️ Arrêter
            </button>
          )}
        </div>

        {/* Barre de progression */}
        {enrichProgress && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
              <span>Progression</span>
              <span>{enrichProgress.current} / {enrichProgress.total} ({pct}%)</span>
            </div>
            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: '#10b981', transition: 'width 0.25s ease' }} />
            </div>
          </div>
        )}

        {/* Logs streaming — scroll interne au conteneur uniquement */}
        <div
          ref={logsContainerRef}
          className="styled-scrollbar"
          style={{
            background: 'var(--bg-secondary, rgba(0,0,0,0.18))',
            borderRadius: 6,
            padding: enrichLogs.length ? '10px 12px' : 0,
            maxHeight: enrichLogs.length ? 300 : 0,
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: 12,
            lineHeight: 1.65,
            transition: 'max-height 0.2s ease, padding 0.2s ease',
          }}
          onScroll={() => {
            const c = logsContainerRef.current;
            if (!c) return;
            userAtBottomRef.current = c.scrollHeight - c.scrollTop - c.clientHeight < 40;
          }}
        >
          {enrichLogs.map((line, i) => (
            <div key={i} style={logLineStyle(line)}>{line || '\u00A0'}</div>
          ))}
        </div>
      </section>

      {/* ════════════ Entrées sans synopsis FR ════════════ */}
      {showMissingSection && (
        <section className="server-section" style={{ borderColor: failedEntries.length > 0 ? '#ef4444' : '#f59e0b' }}>

          {/* En-tête */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem', color: failedEntries.length > 0 ? '#ef4444' : undefined }}>
              {failedEntries.length > 0
                ? `❌ Échecs du dernier run (${failedEntries.length})`
                : (() => {
                    const shown    = filteredMissing.length;
                    const total    = missingEntries.length;
                    const statMiss = stats?.missing_synopsis_fr ?? 0;
                    const suffix   = statMiss > total
                      ? ` enrichissable(s) / ${statMiss} sans FR au total`
                      : ` entrée(s)`;
                    return `⚠️ Sans synopsis FR — ${shown}${missingFilter ? ` / ${total}` : ''}${suffix}`;
                  })()
              }
            </h4>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {/* Filtre texte — masqué en mode "échecs du run" */}
              {failedEntries.length === 0 && (
                <input
                  type="text"
                  className="app-input"
                  style={{ padding: '3px 8px', fontSize: 12, width: 160 }}
                  placeholder="Filtrer…"
                  value={missingFilter}
                  onChange={e => setMissingFilter(e.target.value)}
                />
              )}

              {failedEntries.length > 0 ? (
                <>
                  {/* Relancer tous les échecs */}
                  <button
                    className="server-btn server-btn--default"
                    disabled={enrichRunning}
                    onClick={() => startEnrichment(failedEntries.flatMap(e => e.group_ids?.length ? e.group_ids : [e.id]))}
                    title="Relancer l'enrichissement pour toutes les entrées ayant échoué"
                  >
                    🕷️ Relancer les {failedEntries.length} échecs
                  </button>
                  {/* Revenir à la liste complète */}
                  <button
                    className="server-btn server-btn--default"
                    onClick={() => setFailed([])}
                  >
                    Afficher tout
                  </button>
                </>
              ) : (
                /* Relancer uniquement les entrées enrichissables filtrées */
                <button
                  className="server-btn server-btn--default"
                  disabled={enrichRunning || filteredEnrichable.length === 0}
                  onClick={() => startEnrichment(filteredEnrichable.flatMap(e => e.group_ids?.length ? e.group_ids : [e.id]))}
                  title="Relancer l'enrichissement pour toutes les entrées F95Zone enrichissables"
                >
                  🕷️ Tout relancer ({filteredEnrichable.length}{filteredEnrichable.length < filteredMissing.length ? `/${filteredMissing.length}` : ''})
                </button>
              )}
            </div>
          </div>

          {/* Liste */}
          <div
            className="styled-scrollbar"
            style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 320, overflowY: 'auto' }}
          >
            {displayedMissing.slice(0, 100).map(entry => (
              <div key={entry.id} style={{ borderBottom: '1px solid var(--border)' }}>

                {/* Ligne principale */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '6px 2px', flexWrap: 'nowrap' }}>
                  <RaisonBadge raison={entry.raison} />

                  {/* Nom */}
                  <span
                    style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}
                    title={entry.nom_du_jeu}
                  >
                    {entry.nom_du_jeu}
                  </span>

                  {/* Indicateur synopsis EN présent */}
                  {entry.synopsis_en && (
                    <span style={{ color: '#38bdf8', fontSize: 11, flexShrink: 0 }}>EN ✓</span>
                  )}

                  {/* Nb lignes dans le groupe */}
                  {entry.group_ids?.length > 1 && (
                    <span style={{ color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>
                      ({entry.group_ids.length} lignes)
                    </span>
                  )}

                  {/* Bouton ouvrir URL dans le navigateur — uniquement si URL présente */}
                  {entry.nom_url && (
                    <button
                      type="button"
                      className="server-btn server-btn--default"
                      style={{ padding: '2px 7px', fontSize: 11, flexShrink: 0 }}
                      title={entry.nom_url}
                      onClick={() => tauriAPI.openUrl(entry.nom_url)}
                    >
                      {entry.raison === 'lewdcorner' ? 'LC ↗' : 'F95 ↗'}
                    </button>
                  )}

                  {/* Retry individuel — uniquement pour les entrées enrichissables */}
                  {entry.can_enrich !== false && (
                    <button
                      type="button"
                      className="server-btn server-btn--default"
                      style={{ padding: '2px 7px', fontSize: 13, flexShrink: 0 }}
                      disabled={enrichRunning || retryingIds.has(entry.id)}
                      title="Relancer le scraping pour cette entrée uniquement"
                      onClick={() => handleRetryEntry(entry)}
                    >
                      {retryingIds.has(entry.id) ? '…' : '🕷️'}
                    </button>
                  )}

                  {/* Édition manuelle */}
                  <button
                    type="button"
                    className="server-btn server-btn--default"
                    style={{ padding: '2px 7px', fontSize: 13, flexShrink: 0 }}
                    title="Éditer manuellement le synopsis"
                    onClick={() => editingId === entry.id ? setEditingId(null) : handleOpenEdit(entry)}
                  >
                    {editingId === entry.id ? '✕' : '✏️'}
                  </button>
                </div>

                {/* Éditeur inline */}
                {editingId === entry.id && (
                  <div style={{
                    background: 'var(--bg-secondary, rgba(0,0,0,0.15))',
                    borderRadius: 6, padding: '10px 12px', marginBottom: 6,
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    {/* Synopsis EN */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Synopsis EN <em>(original anglais)</em>
                      </label>
                      <textarea
                        className="app-input"
                        style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 12 }}
                        value={editEn}
                        onChange={e => setEditEn(e.target.value)}
                        placeholder="Synopsis original en anglais…"
                        rows={3}
                      />
                    </div>

                    {/* Synopsis FR */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Synopsis FR <span style={{ color: '#ef4444' }}>*</span>{' '}
                        <em>(traduction française)</em>
                      </label>
                      <textarea
                        className="app-input"
                        style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 12 }}
                        value={editFr}
                        onChange={e => setEditFr(e.target.value)}
                        placeholder="Traduction française…"
                        rows={3}
                      />
                    </div>

                    {editError && (
                      <div style={{ color: '#ef4444', fontSize: 12 }}>❌ {editError}</div>
                    )}

                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="server-btn server-btn--default"
                        onClick={() => setEditingId(null)}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        className="server-btn server-btn--default"
                        disabled={editSaving || (!editEn && !editFr)}
                        onClick={() => handleSaveEdit(entry)}
                      >
                        {editSaving ? '…' : '💾 Sauvegarder'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {displayedMissing.length > 100 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', padding: '6px 0', textAlign: 'center' }}>
                +{displayedMissing.length - 100} entrées — utilisez le filtre pour affiner
              </div>
            )}

            {displayedMissing.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0', textAlign: 'center' }}>
                {missingFilter ? 'Aucun résultat pour ce filtre.' : 'Aucune entrée manquante.'}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ════════════ Synchronisation catalogue ════════════ */}
      <section className="server-section" style={{ borderColor: 'var(--accent-border)' }}>
        <h4 style={{ margin: '0 0 6px', fontSize: '0.9rem' }}>🔄 Synchronisation catalogue</h4>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)' }}>
          Récupère les jeux depuis l'API F95FR et écrase les données{' '}
          <code style={{ fontSize: 11 }}>f95_jeux</code> dans Supabase.
          La sync automatique se déclenche toutes les 2 h — utilisez ce bouton uniquement en cas de besoin urgent.
        </p>

        <ConfirmInline
          step={syncStep}
          loading={syncLoading}
          loadingLabel="⏳ Synchronisation en cours…"
          initialLabel="🔄 Forcer la resync depuis l'API"
          initialBtnClass="server-btn--warning"
          steps={[
            { label: "Écraser f95_jeux avec les données de l'API ?", btnClass: 'server-btn--warning', btnLabel: 'Confirmer'           },
            { label: '⚠️ CONFIRMATION FINALE',                        btnClass: 'server-btn--danger',  btnLabel: '🔄 Lancer la resync' },
          ]}
          onStep={handleForceSync}
          onCancel={() => setSyncStep(0)}
        />

        {syncResult && (
          <div style={{ marginTop: 8, fontSize: 13, color: syncResult.ok ? '#10b981' : '#ef4444' }}>
            {syncResult.msg}
          </div>
        )}
      </section>

      {/* ════════════ Zone dangereuse ════════════ */}
      <section className="server-section" style={{ borderColor: '#ef4444' }}>
        <h4 style={{ margin: '0 0 6px', fontSize: '0.9rem', color: '#ef4444' }}>⚠️ Zone dangereuse</h4>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)' }}>
          Remet à <code style={{ fontSize: 11 }}>NULL</code> <strong>tous</strong> les synopsis EN et FR
          de la table <code style={{ fontSize: 11 }}>f95_jeux</code>. Action irréversible.
        </p>

        <ConfirmInline
          step={resetStep}
          loading={resetLoading}
          loadingLabel="⏳ Réinitialisation…"
          initialLabel="🗑️ Réinitialiser tous les synopsis"
          initialBtnClass="server-btn--danger"
          steps={[
            { label: 'Effacer TOUS les synopsis EN + FR ?',   btnClass: 'server-btn--danger', btnLabel: 'Confirmer'          },
            { label: '⚠️ CONFIRMATION FINALE — irréversible', btnClass: 'server-btn--danger', btnLabel: '🗑️ Confirmer RESET' },
          ]}
          onStep={handleReset}
          onCancel={() => setResetStep(0)}
        />

        {resetResult && (
          <div style={{ marginTop: 8, fontSize: 13, color: resetResult.startsWith('✅') ? '#10b981' : '#ef4444' }}>
            {resetResult}
          </div>
        )}
      </section>

    </div>
  );
}