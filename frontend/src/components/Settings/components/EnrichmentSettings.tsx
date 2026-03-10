// frontend/src/components/Settings/components/EnrichmentSettings.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { tauriAPI } from '../../../lib/tauri-api';

type SynopsisStats = {
  total_groups:       number;
  with_synopsis_en:   number;
  with_synopsis_fr:   number;
  missing_synopsis_fr: number;
};

type MissingEntry = {
  id:          number;
  nom_du_jeu:  string;
  nom_url:     string;
  site_id:     number;
  synopsis_en: string;
  group_ids:   number[];
  raison?:     string;
};

export default function EnrichmentSettings() {
  // ── Enrichissement global ──────────────────────────────────────────────────
  const [isEnriching,     setIsEnriching]     = useState(false);
  const [progress,        setProgress]        = useState({ current: 0, total: 0 });
  const [logs,            setLogs]            = useState<string[]>([]);
  const [forceRetranslate, setForceRetranslate] = useState(false);
  const [failedAfterRun,  setFailedAfterRun]  = useState<MissingEntry[]>([]);
  const logsContainerRef    = useRef<HTMLDivElement>(null);
  const logsEndRef          = useRef<HTMLDivElement>(null);
  const abortControllerRef  = useRef<AbortController | null>(null);
  const userAtBottomRef     = useRef(true);

  // ── Statistiques synopsis ──────────────────────────────────────────────────
  const [synopsisStats,   setSynopsisStats]   = useState<SynopsisStats | null>(null);
  const [missingEntries,  setMissingEntries]  = useState<MissingEntry[]>([]);
  const [statsLoading,    setStatsLoading]    = useState(false);
  const [statsError,      setStatsError]      = useState<string | null>(null);
  const [missingFilter,   setMissingFilter]   = useState('');

  // ── Édition manuelle ───────────────────────────────────────────────────────
  const [editingId,   setEditingId]   = useState<number | null>(null);
  const [editEn,      setEditEn]      = useState('');
  const [editFr,      setEditFr]      = useState('');
  const [editSaving,  setEditSaving]  = useState(false);
  const [editError,   setEditError]   = useState<string | null>(null);

  // ── Retry en cours (IDs) ───────────────────────────────────────────────────
  const [retryingIds, setRetryingIds] = useState<Set<number>>(new Set());

  // ── Logs journalctl ────────────────────────────────────────────────────────
  const [journalLogs,    setJournalLogs]    = useState<string>('');
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalError,   setJournalError]   = useState<string | null>(null);

  // Scroll interne au conteneur de logs uniquement si l'utilisateur est déjà en bas
  useEffect(() => {
    const container = logsContainerRef.current;
    if (!container || !userAtBottomRef.current) return;
    container.scrollTop = container.scrollHeight;
  }, [logs]);

  const getApiBase = () =>
    (localStorage.getItem('apiBase') || 'http://138.2.182.125:8080').replace(/\/+$/, '');
  const getApiKey = () => localStorage.getItem('apiKey') || '';

  // ── Chargement des statistiques ────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch(`${getApiBase()}/api/enrich/synopsis-stats`, {
        headers: { 'X-API-KEY': getApiKey() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.ok) {
        setSynopsisStats(data.stats);
        setMissingEntries(data.missing_entries || []);
      } else {
        throw new Error(data.error || 'Erreur inconnue');
      }
    } catch (e: unknown) {
      setStatsError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ── Lancement enrichissement (global ou ciblé) ─────────────────────────────
  const handleStartEnrichment = useCallback(async (targetIds?: number[]) => {
    if (isEnriching) return;
    setIsEnriching(true);
    setProgress({ current: 0, total: 0 });
    setLogs(
      targetIds?.length
        ? [`🎯 Relance pour ${targetIds.length} entrée(s) ciblée(s)…`]
        : ['🚀 Démarrage de l\'enrichissement…']
    );
    setFailedAfterRun([]);
    abortControllerRef.current = new AbortController();

    try {
      const body: Record<string, unknown> = { force: targetIds?.length ? true : forceRetranslate };
      if (targetIds?.length) body.target_ids = targetIds;

      const response = await fetch(`${getApiBase()}/api/scrape/enrich`, {
        method:  'POST',
        headers: { 'X-API-KEY': getApiKey(), 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  abortControllerRef.current.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader  = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('Pas de stream disponible');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split('\n').filter(Boolean)) {
          try {
            const data = JSON.parse(line);
            if (data.progress) setProgress(data.progress);
            if (data.log)      setLogs(p => [...p, data.log]);
            if (data.status === 'completed') {
              setLogs(p => [...p, '✅ Enrichissement terminé avec succès']);
              if (data.failed_entries?.length) setFailedAfterRun(data.failed_entries);
              fetchStats();
            }
            if (data.error) setLogs(p => [...p, `❌ Erreur: ${data.error}`]);
          } catch { /* ligne NDJSON invalide */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        setLogs(p => [...p, '⏸️ Enrichissement annulé']);
      } else {
        setLogs(p => [...p, `❌ Erreur réseau: ${(err as Error)?.message}`]);
      }
    } finally {
      setIsEnriching(false);
      if (targetIds) {
        setRetryingIds(prev => {
          const next = new Set(prev);
          targetIds.forEach(id => next.delete(id));
          return next;
        });
      }
    }
  }, [isEnriching, forceRetranslate, fetchStats]);

  const handleStopEnrichment = () => {
    abortControllerRef.current?.abort();
    setIsEnriching(false);
  };

  // ── Remise à zéro des synopsis ────────────────────────────────────────────
  const [resetConfirmStep, setResetConfirmStep] = useState<0 | 1 | 2>(0);
  const [resetLoading,     setResetLoading]     = useState(false);
  const [resetResult,      setResetResult]      = useState<string | null>(null);

  const handleResetSynopsis = async () => {
    if (resetConfirmStep < 2) {
      setResetConfirmStep(s => (s + 1) as 1 | 2);
      return;
    }
    setResetLoading(true);
    setResetResult(null);
    try {
      const res = await fetch(`${getApiBase()}/api/enrich/reset-synopsis`, {
        method:  'POST',
        headers: { 'X-API-KEY': getApiKey(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ confirm: 'RESET' }),
      });
      const data = await res.json();
      if (data.ok) {
        setResetResult(`✅ ${data.message}`);
        setSynopsisStats(null);
        setMissingEntries([]);
        fetchStats();
      } else {
        setResetResult(`❌ ${data.error}`);
      }
    } catch (e: unknown) {
      setResetResult(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setResetLoading(false);
      setResetConfirmStep(0);
    }
  };

  // ── Retry d'une entrée spécifique ──────────────────────────────────────────
  const handleRetryEntry = (entry: MissingEntry) => {
    if (isEnriching) return;
    const ids = entry.group_ids?.length ? entry.group_ids : [entry.id];
    ids.forEach(id => setRetryingIds(prev => new Set(prev).add(id)));
    handleStartEnrichment(ids);
  };

  // ── Édition manuelle ───────────────────────────────────────────────────────
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
      const res = await fetch(`${getApiBase()}/api/f95-jeux/${entry.id}/synopsis`, {
        method:  'PATCH',
        headers: { 'X-API-KEY': getApiKey(), 'Content-Type': 'application/json' },
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
      // Retirer l'entrée de la liste si synopsis_fr a été renseigné
      if (editFr) {
        setMissingEntries(prev => prev.filter(e => e.id !== entry.id));
        setFailedAfterRun(prev  => prev.filter(e => e.id !== entry.id));
        setSynopsisStats(prev => prev ? {
          ...prev,
          with_synopsis_fr:   prev.with_synopsis_fr   + 1,
          missing_synopsis_fr: prev.missing_synopsis_fr - 1,
        } : null);
      }
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditSaving(false);
    }
  };

  // ── Chargement des logs journalctl ─────────────────────────────────────────
  const fetchJournalLogs = async () => {
    setJournalLoading(true);
    setJournalError(null);
    try {
      const res = await fetch(`${getApiBase()}/api/logs/journal`, {
        headers: { 'X-API-KEY': getApiKey() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.ok) {
        setJournalLogs(data.logs || '');
      } else {
        throw new Error(data.error || 'Erreur inconnue');
      }
    } catch (e: unknown) {
      setJournalError(e instanceof Error ? e.message : String(e));
    } finally {
      setJournalLoading(false);
    }
  };

  // ── Dérivés ────────────────────────────────────────────────────────────────
  const progressPercent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const logLineClass = (line: string) =>
    line.startsWith('✅') ? 'settings-enrichment-log-line--success'
      : line.startsWith('❌') ? 'settings-enrichment-log-line--error'
        : line.startsWith('⏭️') ? 'settings-enrichment-log-line--skip'
          : '';

  // Liste affichée : résultats du dernier run OU liste complète filtrée
  const filteredMissing = missingFilter.trim()
    ? missingEntries.filter(e =>
        e.nom_du_jeu.toLowerCase().includes(missingFilter.toLowerCase()) ||
        e.nom_url.toLowerCase().includes(missingFilter.toLowerCase())
      )
    : missingEntries;

  const displayedMissing = failedAfterRun.length > 0 ? failedAfterRun : filteredMissing;
  const showMissingSection = missingEntries.length > 0 || failedAfterRun.length > 0;

  return (
    <div className="settings-enrichment-root">

      {/* ════════════════ Stats synopsis ════════════════ */}
      <section className="settings-section">
        <div className="settings-log-header">
          <h4 className="settings-section__title">📊 Statistiques synopsis f95_jeux</h4>
          <button
            type="button"
            className="form-btn form-btn--ghost"
            onClick={fetchStats}
            disabled={statsLoading}
          >
            {statsLoading ? '…' : '↺ Rafraîchir'}
          </button>
        </div>

        {statsError && <p className="enrich-stats-error">❌ {statsError}</p>}

        {synopsisStats ? (
          <div className="enrich-stats-bar">
            <div className="enrich-stat-item">
              <span className="enrich-stat-value">{synopsisStats.total_groups}</span>
              <span className="enrich-stat-label">jeux uniques</span>
            </div>
            <div className="enrich-stat-item enrich-stat-item--ok">
              <span className="enrich-stat-value">{synopsisStats.with_synopsis_en}</span>
              <span className="enrich-stat-label">avec synopsis EN</span>
            </div>
            <div className="enrich-stat-item enrich-stat-item--ok">
              <span className="enrich-stat-value">{synopsisStats.with_synopsis_fr}</span>
              <span className="enrich-stat-label">avec synopsis FR</span>
            </div>
            <div className={`enrich-stat-item ${synopsisStats.missing_synopsis_fr > 0 ? 'enrich-stat-item--warn' : 'enrich-stat-item--ok'}`}>
              <span className="enrich-stat-value">{synopsisStats.missing_synopsis_fr}</span>
              <span className="enrich-stat-label">sans synopsis FR</span>
            </div>
          </div>
        ) : !statsLoading && (
          <div className="settings-enrichment-empty">Chargement des statistiques…</div>
        )}

        {/* Zone de remise à zéro */}
        <div className="enrich-reset-zone">
          {resetResult && (
            <span className={`enrich-reset-result ${resetResult.startsWith('✅') ? 'enrich-reset-result--ok' : 'enrich-reset-result--err'}`}>
              {resetResult}
            </span>
          )}
          {resetConfirmStep === 0 && (
            <button
              type="button"
              className="form-btn form-btn--ghost form-btn--sm enrich-reset-btn"
              onClick={handleResetSynopsis}
              disabled={isEnriching}
              title="Remettre tous les synopsis à NULL pour repartir de zéro"
            >
              🗑️ Réinitialiser tous les synopsis
            </button>
          )}
          {resetConfirmStep === 1 && (
            <div className="enrich-reset-confirm">
              <span className="enrich-reset-warn">⚠️ Cela effacera <strong>tous</strong> les synopsis_en et synopsis_fr. Confirmer ?</span>
              <button type="button" className="form-btn form-btn--ghost form-btn--xs" onClick={() => setResetConfirmStep(0)}>Annuler</button>
              <button type="button" className="form-btn form-btn--danger form-btn--xs" onClick={handleResetSynopsis}>Oui, continuer</button>
            </div>
          )}
          {resetConfirmStep === 2 && (
            <div className="enrich-reset-confirm">
              <span className="enrich-reset-warn enrich-reset-warn--final">🚨 Dernière confirmation — action <strong>irréversible</strong></span>
              <button type="button" className="form-btn form-btn--ghost form-btn--xs" onClick={() => setResetConfirmStep(0)}>Annuler</button>
              <button
                type="button"
                className="form-btn form-btn--danger form-btn--xs"
                disabled={resetLoading}
                onClick={handleResetSynopsis}
              >
                {resetLoading ? '…' : '🗑️ RÉINITIALISER'}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ════════════════ Enrichissement ════════════════ */}
      <section className="settings-section">
        <div className="settings-log-header">
          <h4 className="settings-section__title">📜 Logs en temps réel</h4>
          <div className="settings-enrichment-header-actions">
            {!isEnriching && (
              <label className="settings-enrichment-force-wrap">
                <input
                  type="checkbox"
                  checked={forceRetranslate}
                  onChange={e => setForceRetranslate(e.target.checked)}
                />
                <span>Forcer la re-traduction (tous les synopsis)</span>
              </label>
            )}
            {!isEnriching ? (
              <button
                type="button"
                onClick={() => handleStartEnrichment()}
                className="form-btn form-btn--primary"
              >
                <span className="settings-enrichment-btn-icon">▶️</span>
                Lancer l'enrichissement
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopEnrichment}
                className="form-btn form-btn--danger"
              >
                <span className="settings-enrichment-btn-icon">⏹️</span>
                Arrêter
              </button>
            )}
          </div>
        </div>

        {progress.total > 0 && (
          <div className="settings-enrichment-progress-row">
            <div className="settings-enrichment-progress-track">
              <div
                className="settings-enrichment-progress-fill"
                style={{ ['--progress-pct' as string]: `${progressPercent}%` }}
              />
            </div>
            <span className="settings-enrichment-progress-label">
              {progress.current} / {progress.total} ({progressPercent}%)
            </span>
          </div>
        )}

        <div
          ref={logsContainerRef}
          className="settings-logs-box styled-scrollbar"
          onScroll={() => {
            const c = logsContainerRef.current;
            if (!c) return;
            userAtBottomRef.current = c.scrollHeight - c.scrollTop - c.clientHeight < 40;
          }}
        >
          {logs.length === 0 ? (
            <div className="settings-enrichment-empty">Aucune activité pour le moment</div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className={`settings-enrichment-log-line ${logLineClass(log)}`}>
                {log}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </section>

      {/* ════════════════ Entrées manquantes ════════════════ */}
      {showMissingSection && (
        <section className="settings-section">
          <div className="settings-log-header">
            <h4 className="settings-section__title">
              ⚠️ Sans synopsis FR
              <span className="enrich-missing-count">
                {failedAfterRun.length > 0
                  ? `${failedAfterRun.length} échoué(s) — dernier run`
                  : `${filteredMissing.length}${missingFilter ? ` / ${missingEntries.length}` : ''}`}
              </span>
            </h4>

            <div className="enrich-missing-toolbar">
              {failedAfterRun.length === 0 && (
                <input
                  type="text"
                  className="app-input enrich-missing-filter"
                  placeholder="Filtrer…"
                  value={missingFilter}
                  onChange={e => setMissingFilter(e.target.value)}
                />
              )}

              {failedAfterRun.length > 0 ? (
                <>
                  <button
                    type="button"
                    className="form-btn form-btn--primary form-btn--sm"
                    disabled={isEnriching}
                    onClick={() => handleStartEnrichment(failedAfterRun.flatMap(e => e.group_ids || [e.id]))}
                    title="Relancer l'enrichissement pour toutes les entrées ayant échoué"
                  >
                    🕷️ Relancer les {failedAfterRun.length} échecs
                  </button>
                  <button
                    type="button"
                    className="form-btn form-btn--ghost form-btn--sm"
                    onClick={() => setFailedAfterRun([])}
                  >
                    Afficher tout
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="form-btn form-btn--primary form-btn--sm"
                  disabled={isEnriching || filteredMissing.length === 0}
                  onClick={() => handleStartEnrichment(filteredMissing.flatMap(e => e.group_ids || [e.id]))}
                  title="Relancer l'enrichissement pour toutes les entrées filtrées"
                >
                  🕷️ Tout relancer ({filteredMissing.length})
                </button>
              )}
            </div>
          </div>

          <div className="enrich-missing-list styled-scrollbar">
            {displayedMissing.slice(0, 100).map(entry => (
              <div key={entry.id} className="enrich-missing-entry">
                <div className="enrich-missing-entry-main">
                  <span className="enrich-missing-name" title={entry.nom_du_jeu}>
                    {entry.nom_du_jeu}
                  </span>
                  {entry.raison && (
                    <span className={`enrich-missing-raison ${entry.raison === 'synopsis_introuvable' ? 'enrich-missing-raison--warn' : 'enrich-missing-raison--err'}`}>
                      {entry.raison === 'synopsis_introuvable' ? 'introuvable' : 'trad. échouée'}
                    </span>
                  )}
                  {entry.nom_url && (
                    <button
                      type="button"
                      className="enrich-missing-url"
                      title={entry.nom_url}
                      onClick={() => tauriAPI.openUrl(entry.nom_url)}
                    >
                      F95 ↗
                    </button>
                  )}
                  <div className="enrich-missing-actions">
                    <button
                      type="button"
                      className="form-btn form-btn--ghost form-btn--xs"
                      disabled={isEnriching || retryingIds.has(entry.id)}
                      onClick={() => handleRetryEntry(entry)}
                      title="Relancer le scraping pour cette entrée uniquement"
                    >
                      {retryingIds.has(entry.id) ? '…' : '🕷️'}
                    </button>
                    <button
                      type="button"
                      className="form-btn form-btn--ghost form-btn--xs"
                      onClick={() => editingId === entry.id ? setEditingId(null) : handleOpenEdit(entry)}
                      title="Éditer manuellement le synopsis"
                    >
                      {editingId === entry.id ? '✕' : '✏️'}
                    </button>
                  </div>
                </div>

                {editingId === entry.id && (
                  <div className="enrich-inline-editor">
                    <div className="enrich-inline-editor-field">
                      <label className="form-label">Synopsis EN <em>(original anglais)</em></label>
                      <textarea
                        className="app-input enrich-synopsis-textarea"
                        value={editEn}
                        onChange={e => setEditEn(e.target.value)}
                        placeholder="Synopsis original en anglais…"
                        rows={3}
                      />
                    </div>
                    <div className="enrich-inline-editor-field">
                      <label className="form-label">
                        Synopsis FR <span className="enrich-required">*</span>
                        <em> (traduction française)</em>
                      </label>
                      <textarea
                        className="app-input enrich-synopsis-textarea"
                        value={editFr}
                        onChange={e => setEditFr(e.target.value)}
                        placeholder="Traduction française…"
                        rows={3}
                      />
                    </div>
                    {editError && <p className="enrich-edit-error">❌ {editError}</p>}
                    <div className="enrich-inline-editor-actions">
                      <button
                        type="button"
                        className="form-btn form-btn--ghost form-btn--xs"
                        onClick={() => setEditingId(null)}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        className="form-btn form-btn--primary form-btn--xs"
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
              <div className="enrich-missing-more">
                +{displayedMissing.length - 100} entrées supplémentaires — utilisez le filtre pour affiner
              </div>
            )}
            {displayedMissing.length === 0 && (
              <div className="settings-enrichment-empty">
                {missingFilter ? 'Aucun résultat pour ce filtre.' : 'Aucune entrée manquante.'}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ════════════════ Logs journalctl ════════════════ */}
      <section className="settings-section">
        <div className="settings-log-header">
          <h4 className="settings-section__title">🖥️ Logs système (journalctl)</h4>
          <button
            type="button"
            className="form-btn form-btn--ghost"
            onClick={fetchJournalLogs}
            disabled={journalLoading}
          >
            {journalLoading ? '…' : journalLogs ? '↺ Rafraîchir' : '📋 Charger les logs'}
          </button>
        </div>

        {journalError && <p className="enrich-stats-error">❌ {journalError}</p>}

        {journalLogs ? (
          <div className="settings-logs-box settings-logs-box--journal styled-scrollbar">
            {journalLogs.split('\n').map((line, i) => (
              <div
                key={i}
                className={`settings-enrichment-log-line settings-journal-log-line ${
                  /\[ERROR\]|\[error\]/.test(line)   ? 'settings-enrichment-log-line--error'   :
                  /\[WARNING\]|\[WARN\]/.test(line)  ? 'settings-enrichment-log-line--skip'    :
                  /\[INFO\]/.test(line)              ? 'settings-enrichment-log-line--success'  : ''
                }`}
              >
                {line}
              </div>
            ))}
          </div>
        ) : !journalLoading && !journalError && (
          <div className="settings-enrichment-empty">
            Cliquez sur « Charger les logs » pour afficher les 300 dernières lignes du journal système.
          </div>
        )}
      </section>

      {/* ════════════════ Fonctionnement ════════════════ */}
      <section className="settings-section">
        <h4 className="settings-section__title">ℹ️ Fonctionnement</h4>
        <div className="settings-fonctionnement">
          <strong>Étapes :</strong>
          1. Regroupement par URL (même jeu = 1 scrape + 1 traduction pour toutes les lignes)<br />
          2. Scraping du synopsis EN depuis F95Zone (<code>.bbWrapper</code>)<br />
          3. Traduction EN → FR via Google Translate API non-officielle<br />
          4. Sauvegarde dans Supabase (<code>synopsis_en</code> + <code>synopsis_fr</code>) sur toutes les lignes du groupe<br />
          <br />
          <strong>Forcer la re-traduction</strong> : ignore les synopsis déjà présents et refait tout (utile après des erreurs de traduction).<br />
          <strong>Relancer les échecs</strong> : relance uniquement les entrées dont le synopsis n'a pas pu être récupéré lors du dernier run.
        </div>
      </section>
    </div>
  );
}
