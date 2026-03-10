// frontend/src/components/Settings/components/CollectionSettings.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import Toggle from '../../shared/Toggle';
import { useUserPreferences } from '../../../state/hooks/useUserPreferences';
import { useNexusImport, type ImportOptions } from '../../../state/hooks/useNexusImport';
import { useF95Import } from '../../../state/hooks/useF95Import';
import { useEnrichment } from '../../../state/enrichmentContext';

export default function CollectionSettings() {
  const {
    showMaCollection,
    setShowMaCollection,
    enrichAutoFrequency,
    enrichAutoHour,
    enrichAutoDay,
    setEnrichSchedule,
    loading: prefsLoading,
  } = useUserPreferences();

  const {
    isRunning: enrichRunning,
    progress: enrichProgress,
    logs: enrichLogs,
    summary: enrichSummary,
    startEnrich,
    stopEnrich,
    reset: enrichReset,
  } = useEnrichment();

  const [enrichScrapeMissing, setEnrichScrapeMissing] = useState(false);
  const [enrichF95Cookies, setEnrichF95Cookies] = useState(() =>
    (typeof window !== 'undefined' ? localStorage.getItem('f95_cookies') : null) ?? ''
  );
  const [enrichScrapeDelay, setEnrichScrapeDelay] = useState(2);
  const enrichLogsContainerRef = useRef<HTMLDivElement>(null);

  const {
    traducteurs,
    traducteursLoading,
    fetchTraducteurs,
    preview,
    previewLoading,
    previewError,
    fetchPreview,
    isImporting: f95Importing,
    progress: f95Progress,
    logs: f95Logs,
    summary: f95Summary,
    startImport: f95StartImport,
    stopImport: f95StopImport,
    reset: f95Reset,
  } = useF95Import();

  const [selectedTraducteur, setSelectedTraducteur] = useState('');
  const [f95SkipExisting, setF95SkipExisting] = useState(true);
  const [f95OverwriteAll, setF95OverwriteAll] = useState(false);
  const [f95SelectedIds, setF95SelectedIds] = useState<Set<number>>(new Set());

  const [importOptions, setImportOptions] = useState<ImportOptions>({
    skipExisting:    true,
    overwriteLabels: false,
    overwritePaths:  false,
    overwriteAll:    false,
  });

  const {
    parseStatus, parseError, parseWarnings, parseStats,
    fileEntries,
    parseDbFile,
    isImporting, progress, logs, summary,
    startImport, stopImport, reset,
  } = useNexusImport();

  const dbInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const f95LogsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTraducteurs();
  }, [fetchTraducteurs]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    const el = f95LogsContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [f95Logs]);

  useEffect(() => {
    const el = enrichLogsContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [enrichLogs]);

  const f95Items = preview?.items ?? preview?.sample ?? [];
  const f95SelectAll = useCallback(() => {
    const ids = new Set<number>();
    f95Items.forEach((j) => {
      const sid = j.site_id;
      if (sid != null) ids.add(sid);
    });
    setF95SelectedIds(ids);
  }, [f95Items]);
  const f95SelectNone = useCallback(() => setF95SelectedIds(new Set()), []);
  const f95ToggleItem = useCallback((siteId: number) => {
    setF95SelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (preview?.items?.length) {
      setF95SelectedIds((prev) => {
        const allIds = new Set(preview.items!.map((j) => j.site_id).filter((x): x is number => x != null));
        if (prev.size === 0) return prev;
        const next = new Set<number>();
        prev.forEach((id) => {
          if (allIds.has(id)) next.add(id);
        });
        return next;
      });
    } else if (!preview) {
      setF95SelectedIds(new Set());
    }
  }, [preview?.items]);

  const handleDbChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseDbFile(file);
    e.target.value = '';
  };

  const progressPercent =
    progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  const logLineClass = (line: string) =>
    line.startsWith('✅') || line.startsWith('🔄') ? 'settings-enrichment-log-line--success'
    : line.startsWith('❌')                          ? 'settings-enrichment-log-line--error'
    : line.startsWith('⏭️')                          ? 'settings-enrichment-log-line--skip'
    : '';

  return (
    <>
    <div className="settings-grid">

      {/* ─── Préférences d'affichage ─── */}
      <section className="settings-section">
        <h4 className="settings-section__title">🗂️ Affichage</h4>
        <div className="form-field">
          <Toggle
            label="Afficher l'onglet Ma Collection dans la bibliothèque"
            checked={showMaCollection}
            onChange={setShowMaCollection}
            disabled={prefsLoading}
          />
        </div>
      </section>

      {/* ─── Enrichissement des données ─── */}
      <section className="settings-section">
        <h4 className="settings-section__title">🔄 Enrichir les données</h4>
        <p className="settings-log-description">
          Met à jour les données de vos jeux (version, statut, synopsis…) depuis la base F95.
          Peut aussi scraper F95Zone directement pour les ajouts manuels sans correspondance.
        </p>

        {/* Planification automatique */}
        <div className="collection-enrich-schedule">
          <h5 className="collection-enrich-schedule-title">⏰ Enrichissement automatique</h5>
          <div className="collection-enrich-schedule-row">
            <label className="form-label">Fréquence</label>
            <select
              className="app-input collection-enrich-schedule-select"
              value={enrichAutoFrequency}
              onChange={(e) => setEnrichSchedule({ enrich_auto_frequency: e.target.value as 'manual' | 'daily' | 'weekly' })}
              disabled={prefsLoading}
            >
              <option value="manual">Manuel uniquement</option>
              <option value="daily">Quotidien</option>
              <option value="weekly">Hebdomadaire</option>
            </select>
          </div>
          {(enrichAutoFrequency === 'daily' || enrichAutoFrequency === 'weekly') && (
            <>
              <div className="collection-enrich-schedule-row">
                <label className="form-label">Heure (03h–23h, 00h–03h réservées)</label>
                <select
                  className="app-input collection-enrich-schedule-select"
                  value={enrichAutoHour}
                  onChange={(e) => setEnrichSchedule({ enrich_auto_hour: Number(e.target.value) })}
                  disabled={prefsLoading}
                >
                  {Array.from({ length: 21 }, (_, i) => i + 3).map((h) => (
                    <option key={h} value={h}>{h}h00</option>
                  ))}
                </select>
              </div>
              {enrichAutoFrequency === 'weekly' && (
                <div className="collection-enrich-schedule-row">
                  <label className="form-label">Jour</label>
                  <select
                    className="app-input collection-enrich-schedule-select"
                    value={enrichAutoDay}
                    onChange={(e) => setEnrichSchedule({ enrich_auto_day: Number(e.target.value) })}
                    disabled={prefsLoading}
                  >
                    <option value={0}>Dimanche</option>
                    <option value={1}>Lundi</option>
                    <option value={2}>Mardi</option>
                    <option value={3}>Mercredi</option>
                    <option value={4}>Jeudi</option>
                    <option value={5}>Vendredi</option>
                    <option value={6}>Samedi</option>
                  </select>
                </div>
              )}
            </>
          )}
        </div>

        {/* Options + Lancement manuel */}
        <div className="f95-enrich-scrape-section">
          <label className="f95-lib-import-toggle f95-enrich-toggle-main">
            <input
              type="checkbox"
              checked={enrichScrapeMissing}
              onChange={(e) => setEnrichScrapeMissing(e.target.checked)}
              disabled={enrichRunning}
            />
            <span>
              🕷️ Scraper F95Zone pour les entrées sans données
              <em> (ajouts manuels, ou jeux non encore dans la bibliothèque)</em>
            </span>
          </label>
          {enrichScrapeMissing && (
            <div className="f95-enrich-scrape-options">
              <div className="f95-lib-import-field">
                <label className="form-label">
                  🍪 Cookie F95 <em>(utilise ceux enregistrés dans « Cookies F95 » si vide)</em>
                </label>
                <input
                  type="password"
                  className="app-input"
                  value={enrichF95Cookies}
                  onChange={(e) => setEnrichF95Cookies(e.target.value)}
                  placeholder="Valeur du cookie xf_session…"
                  disabled={enrichRunning}
                />
              </div>
              <div className="f95-lib-import-field f95-lib-import-field--limit">
                <label className="form-label">⏱️ Délai entre les scrapes</label>
                <select
                  className="app-input"
                  value={enrichScrapeDelay}
                  onChange={(e) => setEnrichScrapeDelay(Number(e.target.value))}
                  disabled={enrichRunning}
                >
                  <option value={1.5}>1,5 s (rapide)</option>
                  <option value={2}>2 s (recommandé)</option>
                  <option value={3}>3 s (prudent)</option>
                  <option value={5}>5 s (très prudent)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="collection-enrich-actions">
          {!enrichSummary ? (
            !enrichRunning ? (
              <button
                type="button"
                className="form-btn form-btn--primary"
                onClick={() => {
                  const stored = typeof window !== 'undefined' ? localStorage.getItem('f95_cookies') : null;
                  const cookies = enrichScrapeMissing
                    ? (enrichF95Cookies.trim() || (stored ?? '').trim() || undefined)
                    : undefined;
                  startEnrich({ scrapeMissing: enrichScrapeMissing, f95Cookies: cookies, scrapeDelay: enrichScrapeDelay });
                }}
              >
                🚀 Lancer l'enrichissement
              </button>
            ) : (
              <>
                <div className="settings-enrichment-progress-row">
                  <div className="settings-enrichment-progress-track">
                    <div
                      className="settings-enrichment-progress-fill"
                      style={{ ['--progress-pct' as string]: `${enrichProgress.total > 0 ? Math.round((enrichProgress.current / enrichProgress.total) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="settings-enrichment-progress-label">
                    {enrichProgress.current} / {enrichProgress.total || '…'}
                  </span>
                </div>
                <div ref={enrichLogsContainerRef} className="settings-logs-box styled-scrollbar" style={{ maxHeight: 220 }}>
                  {enrichLogs.map((l, i) => (
                    <div key={i} className={`settings-enrichment-log-line ${logLineClass(l)}`}>{l}</div>
                  ))}
                </div>
                <button type="button" className="form-btn form-btn--danger" onClick={stopEnrich}>
                  ⏹️ Arrêter
                </button>
              </>
            )
          ) : (
            <>
              <div className="collection-import-summary">
                <div className="collection-import-summary-item collection-import-summary-item--success">
                  <span>✅</span><strong>{enrichSummary.updated}</strong><span>mise(s) à jour</span>
                </div>
                {enrichSummary.scraped > 0 && (
                  <div className="collection-import-summary-item collection-import-summary-item--success">
                    <span>🕷️</span><strong>{enrichSummary.scraped}</strong><span>scrappée(s)</span>
                  </div>
                )}
                <div className="collection-import-summary-item collection-import-summary-item--skip">
                  <span>⏭️</span><strong>{enrichSummary.skipped}</strong><span>ignorée(s)</span>
                </div>
              </div>
              <div ref={enrichLogsContainerRef} className="settings-logs-box styled-scrollbar" style={{ maxHeight: 180 }}>
                {enrichLogs.map((l, i) => (
                  <div key={i} className={`settings-enrichment-log-line ${logLineClass(l)}`}>{l}</div>
                ))}
              </div>
              <div className="collection-import-actions">
                <button type="button" className="form-btn form-btn--ghost" onClick={enrichReset}>
                  🔄 Relancer
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ─── Import depuis la bibliothèque F95 ─── */}
      <section className="settings-section">
        <h4 className="settings-section__title">📚 Import depuis la bibliothèque F95</h4>
        <p className="settings-log-description">
          Sélectionnez un traducteur pour importer ses jeux directement dans votre collection.
        </p>

        {/* Sélecteur + Importer */}
        <div className="collection-f95-select-row">
          <select
            className="app-input collection-f95-select"
            value={selectedTraducteur}
            onChange={(e) => setSelectedTraducteur(e.target.value)}
            disabled={traducteursLoading}
          >
            <option value="">— Choisir un traducteur —</option>
            {traducteurs.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button
            type="button"
            className="form-btn form-btn--primary"
            onClick={() => selectedTraducteur && fetchPreview(selectedTraducteur)}
            disabled={!selectedTraducteur || previewLoading}
          >
            {previewLoading ? '⏳ Chargement…' : '📋 Importer'}
          </button>
        </div>

        {previewError && <p className="collection-import-parse-error">❌ {previewError}</p>}

        {/* Prévisualisation + liste + toggles + lancer */}
        {preview && f95Items.length > 0 && (
          <>
            <div className="collection-import-preview">
              <div className="collection-import-preview-stat">
                <span className="collection-import-stat-value">{preview.count}</span>
                <span className="collection-import-stat-label">jeux</span>
              </div>
              <div className="collection-import-preview-stat">
                <span className="collection-import-stat-value">{preview.new_count}</span>
                <span className="collection-import-stat-label">nouveaux</span>
              </div>
              <div className="collection-import-preview-stat">
                <span className="collection-import-stat-value">{preview.already_in_collection}</span>
                <span className="collection-import-stat-label">déjà en collection</span>
              </div>
            </div>

            <div className="collection-import-options">
              <Toggle
                label="Ignorer les jeux déjà en collection (recommandé)"
                checked={f95SkipExisting && !f95OverwriteAll}
                onChange={(v) => { setF95SkipExisting(v); if (v) setF95OverwriteAll(false); }}
                disabled={f95Importing || f95OverwriteAll}
                size="sm"
              />
              <Toggle
                label="Écraser les données des jeux déjà en collection"
                checked={f95OverwriteAll}
                onChange={(v) => { setF95OverwriteAll(v); if (v) setF95SkipExisting(false); }}
                disabled={f95Importing}
                size="sm"
              />
            </div>

            <div className="collection-f95-list-toolbar">
              <button type="button" className="form-btn form-btn--ghost form-btn--xs" onClick={f95SelectAll}>
                Tout sélectionner
              </button>
              <button type="button" className="form-btn form-btn--ghost form-btn--xs" onClick={f95SelectNone}>
                Tout désélectionner
              </button>
              <span className="collection-f95-selected-count">
                {f95SelectedIds.size} / {f95Items.length} sélectionné(s)
              </span>
            </div>

            <div className="collection-f95-list styled-scrollbar">
              {f95Items.map((j) => {
                const meta = [j.version && `v${j.version}`, j.statut].filter(Boolean).join(' · ');
                const label = meta ? `${j.nom_du_jeu} — ${meta}` : j.nom_du_jeu;
                return (
                  <Toggle
                    key={j.site_id}
                    checked={f95SelectedIds.has(j.site_id)}
                    onChange={() => f95ToggleItem(j.site_id)}
                    label={label}
                    size="sm"
                    className="collection-f95-list-item"
                  />
                );
              })}
            </div>

            {!f95Summary ? (
              <div className="collection-import-actions">
                <button
                  type="button"
                  className="form-btn form-btn--ghost"
                  onClick={f95Reset}
                >
                  ← Changer de traducteur
                </button>
                {!f95Importing ? (
                  <button
                    type="button"
                    className="form-btn form-btn--primary"
                    onClick={() => f95StartImport(
                      selectedTraducteur,
                      { skipExisting: f95SkipExisting, overwriteAll: f95OverwriteAll },
                      f95SelectedIds.size > 0 ? [...f95SelectedIds] : undefined
                    )}
                    disabled={f95SelectedIds.size === 0}
                  >
                    🚀 Lancer ({f95SelectedIds.size} jeu(x))
                  </button>
                ) : (
                  <button type="button" className="form-btn form-btn--danger" onClick={f95StopImport}>
                    ⏹️ Arrêter
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="collection-import-summary">
                  <div className="collection-import-summary-item collection-import-summary-item--success">
                    <span>✅</span><strong>{f95Summary.imported}</strong><span>importé(s)</span>
                  </div>
                  <div className="collection-import-summary-item collection-import-summary-item--skip">
                    <span>⏭️</span><strong>{f95Summary.skipped}</strong><span>ignoré(s)</span>
                  </div>
                  <div className={`collection-import-summary-item${f95Summary.errors > 0 ? ' collection-import-summary-item--error' : ''}`}>
                    <span>❌</span><strong>{f95Summary.errors}</strong><span>erreur(s)</span>
                  </div>
                </div>
                <div className="collection-import-actions">
                  <button type="button" className="form-btn form-btn--ghost" onClick={f95Reset}>
                    🔄 Nouvel import
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* Logs F95 import */}
        {(f95Importing || f95Logs.length > 0) && (
          <>
            {f95Progress.total > 0 && (
              <div className="settings-enrichment-progress-row">
                <div className="settings-enrichment-progress-track">
                  <div
                    className="settings-enrichment-progress-fill"
                    style={{ ['--progress-pct' as string]: `${f95Progress.total ? Math.round((f95Progress.current / f95Progress.total) * 100) : 0}%` }}
                  />
                </div>
                <span className="settings-enrichment-progress-label">
                  {f95Progress.current} / {f95Progress.total}
                </span>
              </div>
            )}
            <div ref={f95LogsContainerRef} className="settings-logs-box styled-scrollbar" style={{ maxHeight: 200 }}>
              {f95Logs.map((log, idx) => (
                <div key={idx} className={`settings-enrichment-log-line ${logLineClass(log)}`}>
                  {log}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ─── Import depuis Nexus ─── (droite de Import F95) */}
      <section className="settings-section">
        <div className="settings-log-header">
          <div>
            <h4 className="settings-section__title">📦 Import depuis Nexus</h4>
            <p className="settings-log-description">
              Importez vos jeux adultes directement depuis le fichier <code>.db</code> de l'application Nexus.
            </p>
          </div>
          {parseStatus !== 'idle' && (
            <button
              type="button"
              onClick={reset}
              className="form-btn form-btn--ghost form-btn--sm"
              disabled={isImporting}
            >
              🔄 Recommencer
            </button>
          )}
        </div>

        {/* ── Étape 1 : sélection du .db ── */}
        {parseStatus === 'idle' && (
          <>
            <div className="collection-import-drop-zone">
              <input
                ref={dbInputRef}
                type="file"
                accept=".db,application/x-sqlite3,application/octet-stream"
                onChange={handleDbChange}
                style={{ display: 'none' }}
              />
              <div className="collection-import-drop-inner">
                <span className="collection-import-drop-icon">🗄️</span>
                <p className="collection-import-drop-label">
                  Sélectionnez le fichier <strong>.db</strong> exporté depuis Nexus
                </p>
                <p className="collection-import-db-hint">
                  Dans Nexus : Paramètres → Base de données → <strong>Exporter la base de données</strong>
                </p>
                <button
                  type="button"
                  className="form-btn form-btn--primary"
                  onClick={() => dbInputRef.current?.click()}
                >
                  📂 Choisir le fichier .db…
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Parsing en cours ── */}
        {parseStatus === 'parsing' && (
          <div className="collection-import-parsing">
            <span className="collection-import-parsing-icon">⏳</span>
            <span>Analyse du fichier en cours…</span>
          </div>
        )}

        {/* ── Erreur de parsing ── */}
        {parseStatus === 'error' && (
          <div className="collection-import-parse-error">
            <p>❌ {parseError}</p>
            <button type="button" className="form-btn form-btn--ghost form-btn--sm" onClick={reset}>
              Réessayer
            </button>
          </div>
        )}

        {/* ── Étape 2 : aperçu + options + import ── */}
        {parseStatus === 'ready' && parseStats && fileEntries && (
          <>
            {/* Statistiques du fichier */}
            <div className="collection-import-preview">
              <div className="collection-import-preview-stat">
                <span className="collection-import-stat-value">{parseStats.total}</span>
                <span className="collection-import-stat-label">jeux détectés</span>
              </div>
              <div className="collection-import-preview-stat">
                <span className="collection-import-stat-value">{parseStats.with_f95}</span>
                <span className="collection-import-stat-label">avec ID F95</span>
              </div>
              <div className="collection-import-preview-stat">
                <span className="collection-import-stat-value">{parseStats.with_lc}</span>
                <span className="collection-import-stat-label">Lewdcorner seul</span>
              </div>
              <div className="collection-import-preview-stat">
                <span className="collection-import-stat-value">{parseStats.with_paths}</span>
                <span className="collection-import-stat-label">avec chemins exe</span>
              </div>
              <div className="collection-import-preview-stat">
                <span className="collection-import-stat-value">{parseStats.with_labels}</span>
                <span className="collection-import-stat-label">avec labels</span>
              </div>
            </div>

            {/* Avertissements */}
            {parseWarnings.length > 0 && (
              <div className="collection-import-warnings">
                {parseWarnings.map((w, i) => (
                  <p key={i} className="collection-import-warning-line">⚠️ {w}</p>
                ))}
              </div>
            )}

            {/* Options d'import */}
            {!summary && (
              <>
                <div className="collection-import-options">
                  <Toggle
                    label="Ignorer les jeux déjà en collection (recommandé)"
                    checked={importOptions.skipExisting && !importOptions.overwriteAll}
                    onChange={(v) => setImportOptions((o) => ({ ...o, skipExisting: v, overwriteAll: v ? false : o.overwriteAll }))}
                    disabled={isImporting || importOptions.overwriteAll}
                    size="sm"
                  />
                  <Toggle
                    label="Écraser les labels si le jeu est déjà en collection"
                    checked={importOptions.overwriteLabels || importOptions.overwriteAll}
                    onChange={(v) => setImportOptions((o) => ({ ...o, overwriteLabels: v }))}
                    disabled={isImporting || importOptions.overwriteAll}
                    size="sm"
                  />
                  <Toggle
                    label="Écraser les chemins exécutables si le jeu est déjà en collection"
                    checked={importOptions.overwritePaths || importOptions.overwriteAll}
                    onChange={(v) => setImportOptions((o) => ({ ...o, overwritePaths: v }))}
                    disabled={isImporting || importOptions.overwriteAll}
                    size="sm"
                  />
                  <div className="collection-import-options-separator" />
                  <Toggle
                    label="Forcer la réimportation complète (écrase toutes les données)"
                    checked={importOptions.overwriteAll}
                    onChange={(v) => setImportOptions((o) => ({
                      ...o,
                      overwriteAll:    v,
                      skipExisting:    v ? false : true,
                      overwriteLabels: v ? true  : false,
                      overwritePaths:  v ? true  : false,
                    }))}
                    disabled={isImporting}
                    size="sm"
                    title="Réimporte et écrase titre, données, labels et chemins, même si le jeu est déjà en collection"
                  />
                </div>

                <div className="collection-import-actions">
                  {!isImporting ? (
                    <button
                      type="button"
                      className="form-btn form-btn--primary"
                      onClick={() => startImport(importOptions)}
                    >
                      ▶️ Lancer l'import ({fileEntries.length} jeux)
                    </button>
                  ) : (
                    <button type="button" className="form-btn form-btn--danger" onClick={stopImport}>
                      ⏹️ Arrêter
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Résumé final */}
            {summary && (
              <div className="collection-import-summary">
                <div className="collection-import-summary-item collection-import-summary-item--success">
                  <span>✅</span><strong>{summary.imported}</strong><span>importé(s)</span>
                </div>
                <div className="collection-import-summary-item collection-import-summary-item--skip">
                  <span>⏭️</span><strong>{summary.skipped}</strong><span>ignoré(s)</span>
                </div>
                <div className={`collection-import-summary-item${summary.errors > 0 ? ' collection-import-summary-item--error' : ''}`}>
                  <span>❌</span><strong>{summary.errors}</strong><span>erreur(s)</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Barre de progression + logs */}
        {(isImporting || logs.length > 0) && (
          <>
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
            <div className="settings-logs-box styled-scrollbar">
              {logs.map((log, idx) => (
                <div key={idx} className={`settings-enrichment-log-line ${logLineClass(log)}`}>
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </>
        )}
      </section>

    </div>
    </>
  );
}
