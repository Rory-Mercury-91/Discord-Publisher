import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../../state/appContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBase(apiUrl?: string): string {
  const raw = (apiUrl || '').trim() || 'http://138.2.182.125:8080';
  try { return new URL(raw).origin; }
  catch { return raw.split('/api')[0]?.replace(/\/+$/, '') || 'http://138.2.182.125:8080'; }
}

const getKey = () => localStorage.getItem('apiKey') || '';

// ── Types ─────────────────────────────────────────────────────────────────────

type MissingEntry = {
  id: number;
  nom_du_jeu: string;
  nom_url: string;
  site_id: number;
  synopsis_en: string;
  group_ids: number[];
  raison?: string; // 'synopsis_introuvable' | 'traduction_echouee' | 'url_incoherente'
};

type FailedEntry = {
  id: number | null;
  nom_du_jeu: string;
  nom_url: string;
  group_ids: number[];
  raison: 'synopsis_introuvable' | 'traduction_echouee' | 'url_incoherente';
};

type SynopsisStats = {
  total_groups: number;
  with_synopsis_en: number;
  with_synopsis_fr: number;
  missing_synopsis_fr: number;
};

// ── Log line colorization ─────────────────────────────────────────────────────

const LOG_STYLES: [string[], React.CSSProperties][] = [
  [['🚫'],                                  { color: '#ef4444', fontWeight: 700 }],
  [['❌'],                                  { color: '#ef4444' }],
  [['🎉'],                                  { color: '#10b981', fontWeight: 700 }],
  [['✅'],                                  { color: '#10b981' }],
  [['🕷️', '🌐'],                           { color: '#38bdf8' }],
  [['⏭️'],                                 { color: 'var(--muted)', fontStyle: 'italic' }],
  [['📥', '📊', '🔍', '🎮', 'ℹ️', '🔄'], { color: 'var(--muted)', fontStyle: 'italic' }],
];

function logLineStyle(line: string): React.CSSProperties {
  for (const [prefixes, style] of LOG_STYLES) {
    if (prefixes.some(p => line.startsWith(p))) return style;
  }
  return {};
}

// ── Raison badge ─────────────────────────────────────────────────────────────

const RAISON_CFG: Record<string, { bg: string; label: string }> = {
  synopsis_introuvable: { bg: '#f59e0b', label: 'Synopsis introuvable' },
  traduction_echouee:   { bg: '#6b7280', label: 'Traduction échouée' },
  url_incoherente:      { bg: '#ef4444', label: 'URL incorrecte' },
};

function RaisonBadge({ raison }: { raison?: string }) {
  if (!raison) return null;
  const c = RAISON_CFG[raison];
  const label = c?.label ?? raison;
  const bg    = c?.bg    ?? '#6b7280';
  return (
    <span style={{
      background: bg, color: '#fff', borderRadius: 4,
      padding: '1px 7px', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

// ── Confirmation inline helper ────────────────────────────────────────────────

interface ConfirmInlineProps {
  step: number;
  steps: { label: string; btnClass: string; btnLabel: string }[];
  initialLabel: string;
  initialBtnClass: string;
  loading: boolean;
  loadingLabel: string;
  onStep: () => void;
  onCancel: () => void;
}

function ConfirmInline({
  step, steps, initialLabel, initialBtnClass,
  loading, loadingLabel, onStep, onCancel,
}: ConfirmInlineProps) {
  if (loading) {
    return <span style={{ fontSize: 13, color: 'var(--muted)' }}>{loadingLabel}</span>;
  }
  if (step === 0) {
    return (
      <button className={`server-btn ${initialBtnClass}`} onClick={onStep}>
        {initialLabel}
      </button>
    );
  }
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

  // ── Stats ────────────────────────────────────────────────────────────────────
  const [stats, setStats]               = useState<SynopsisStats | null>(null);
  const [missingEntries, setMissing]    = useState<MissingEntry[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError]     = useState<string | null>(null);

  // ── Enrichment streaming ──────────────────────────────────────────────────────
  const [enrichLogs, setEnrichLogs]         = useState<string[]>([]);
  const [enrichRunning, setEnrichRunning]   = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{ current: number; total: number } | null>(null);
  const [enrichForce, setEnrichForce]       = useState(false);
  const [failedEntries, setFailed]          = useState<FailedEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortRef   = useRef<AbortController | null>(null);

  // ── Reset synopsis ────────────────────────────────────────────────────────────
  const [resetLoading, setResetLoading]   = useState(false);
  const [resetResult, setResetResult]     = useState<string | null>(null);
  const [resetStep, setResetStep]         = useState(0);

  // ── Force sync ────────────────────────────────────────────────────────────────
  const [syncLoading, setSyncLoading]   = useState(false);
  const [syncResult, setSyncResult]     = useState<{ ok: boolean; msg: string } | null>(null);
  const [syncStep, setSyncStep]         = useState(0);

  // ── fetchStats ────────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
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
      setStatsLoading(false);
    }
  }, [base]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Auto-scroll logs
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [enrichLogs]);

  // ── Enrichment ────────────────────────────────────────────────────────────────
  const startEnrichment = useCallback(async () => {
    if (enrichRunning) return;
    setEnrichLogs([]);
    setEnrichProgress(null);
    setFailed([]);
    setEnrichRunning(true);
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${base}/api/scrape/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': getKey() },
        body: JSON.stringify({ force: enrichForce }),
        signal: abortRef.current.signal,
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
              setFailed(msg.failed_entries ?? []);
              await fetchStats();
            }
          } catch { /* ignore JSON parse errors */ }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') {
        setEnrichLogs(p => [...p, `❌ Connexion interrompue : ${e.message}`]);
      }
    } finally {
      setEnrichRunning(false);
      abortRef.current = null;
    }
  }, [enrichRunning, enrichForce, base, fetchStats]);

  // ── Reset synopsis ────────────────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    if (resetStep < 2) { setResetStep(s => s + 1); return; }
    setResetLoading(true);
    setResetResult(null);
    setResetStep(0);
    try {
      const res  = await fetch(`${base}/api/enrich/reset-synopsis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': getKey() },
        body: JSON.stringify({ confirm: 'RESET' }),
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

  // ── Force sync ────────────────────────────────────────────────────────────────
  const handleForceSync = useCallback(async () => {
    if (syncStep < 2) { setSyncStep(s => s + 1); return; }
    setSyncLoading(true);
    setSyncResult(null);
    setSyncStep(0);
    try {
      const res  = await fetch(`${base}/api/jeux/sync-force`, {
        method: 'POST',
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

  // ── Derived ───────────────────────────────────────────────────────────────────
  const pct = enrichProgress && enrichProgress.total > 0
    ? Math.round((enrichProgress.current / enrichProgress.total) * 100)
    : 0;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Stats synopsis ─────────────────────────────────────────────────────── */}
      <section className="server-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h4 style={{ margin: 0, fontSize: '0.9rem' }}>📊 Statistiques des synopsis</h4>
          <button className="server-btn server-btn--default" onClick={fetchStats} disabled={statsLoading}>
            {statsLoading ? '⏳…' : '🔄 Actualiser'}
          </button>
        </div>

        {statsError && <div style={{ color: 'var(--error)', fontSize: 13, marginTop: 8 }}>❌ {statsError}</div>}

        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 10 }}>
            {[
              { label: 'Groupes total',    value: stats.total_groups,       color: 'var(--text)' },
              { label: 'Avec synopsis EN', value: stats.with_synopsis_en,   color: '#38bdf8' },
              { label: 'Avec synopsis FR', value: stats.with_synopsis_fr,   color: '#10b981' },
              { label: 'Sans synopsis FR', value: stats.missing_synopsis_fr, color: '#f59e0b' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.04))', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Enrichissement ─────────────────────────────────────────────────────── */}
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
            <button className="server-btn server-btn--default" onClick={startEnrichment}>
              ▶️ Lancer l'enrichissement
            </button>
          ) : (
            <button className="server-btn server-btn--danger" onClick={() => abortRef.current?.abort()}>
              ⏹️ Arrêter
            </button>
          )}
        </div>

        {/* Progress bar */}
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

        {/* Streaming logs */}
        {enrichLogs.length > 0 && (
          <div
            className="styled-scrollbar"
            style={{
              background: 'var(--bg-secondary, rgba(0,0,0,0.18))',
              borderRadius: 6,
              padding: '10px 12px',
              maxHeight: 300,
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: 1.65,
            }}
          >
            {enrichLogs.map((line, i) => (
              <div key={i} style={logLineStyle(line)}>{line || '\u00A0'}</div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </section>

      {/* ── Échecs du dernier enrichissement ───────────────────────────────────── */}
      {failedEntries.length > 0 && (
        <section className="server-section" style={{ borderColor: '#ef4444' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem', color: '#ef4444' }}>
            ❌ Échecs du dernier enrichissement ({failedEntries.length})
          </h4>
          <div className="styled-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
            {failedEntries.map((e, i) => (
              <div
                key={i}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}
              >
                <RaisonBadge raison={e.raison} />
                <a
                  href={e.nom_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {e.nom_du_jeu}
                </a>
                {e.group_ids.length > 1 && (
                  <span style={{ color: 'var(--muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                    ({e.group_ids.length} lignes)
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Sans synopsis FR (depuis stats) ────────────────────────────────────── */}
      {missingEntries.length > 0 && (
        <section className="server-section" style={{ borderColor: '#f59e0b' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>
            ⚠️ Sans synopsis FR — {missingEntries.length} entrée(s) affichée(s) (max 300)
          </h4>
          <div className="styled-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
            {missingEntries.map((e, i) => (
              <div
                key={i}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}
              >
                <RaisonBadge raison={e.raison} />
                <a
                  href={e.nom_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {e.nom_du_jeu}
                </a>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  {e.synopsis_en && (
                    <span style={{ color: '#38bdf8', fontSize: 11 }}>EN ✓</span>
                  )}
                  {e.group_ids.length > 1 && (
                    <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                      ({e.group_ids.length} lignes)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Synchronisation catalogue ─────────────────────────────────────────── */}
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
            { label: 'Écraser f95_jeux avec les données de l\'API ?', btnClass: 'server-btn--warning', btnLabel: 'Confirmer' },
            { label: '⚠️ CONFIRMATION FINALE', btnClass: 'server-btn--danger', btnLabel: '🔄 Lancer la resync' },
          ]}
          onStep={handleForceSync}
          onCancel={() => setSyncStep(0)}
        />

        {syncResult && (
          <div style={{ marginTop: 8, fontSize: 13, color: syncResult.ok ? '#10b981' : '#ef4444', fontWeight: syncResult.ok ? 400 : 600 }}>
            {syncResult.msg}
          </div>
        )}
      </section>

      {/* ── Zone dangereuse ───────────────────────────────────────────────────── */}
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
            { label: 'Effacer TOUS les synopsis EN + FR ?', btnClass: 'server-btn--danger', btnLabel: 'Confirmer' },
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