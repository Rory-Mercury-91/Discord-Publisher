// frontend/src/components/Settings/components/CollectionSettings.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import Toggle from '../../shared/Toggle';
import { tauriAPI } from '../../../lib/tauri-api';
import scriptTampermonkeyRaw from '../../../assets/DiscordPublisherDataExtractor.js?raw';
import { useUserPreferences } from '../../../state/hooks/useUserPreferences';
import { useNexusImport, type ImportOptions } from '../../../state/hooks/useNexusImport';
import { useF95Import } from '../../../state/hooks/useF95Import';
import type { GameF95 } from '../../library/library-types';
import { useEnrichment } from '../../../state/enrichmentContext';
import { getSupabase } from '../../../lib/supabase';
import { useAuth } from '../../../state/authContext';
import { useToast } from '../../shared/ToastProvider';

export default function CollectionSettings() {
  const { showToast } = useToast();
  const { user } = useAuth();

  const {
    enrichAutoFrequency, enrichAutoHour, enrichAutoDay, setEnrichSchedule,
    loading: prefsLoading,
  } = useUserPreferences();

  const {
    isRunning: enrichRunning, progress: enrichProgress, logs: enrichLogs,
    summary: enrichSummary, startEnrich, stopEnrich, reset: enrichReset,
  } = useEnrichment();

  const [enrichScrapeMissing, setEnrichScrapeMissing] = useState(false);
  const [enrichF95Cookies, setEnrichF95Cookies] = useState(() =>
    (typeof window !== 'undefined' ? localStorage.getItem('f95_cookies') : null) ?? ''
  );
  const [enrichScrapeDelay, setEnrichScrapeDelay] = useState(2);
  const enrichLogsContainerRef = useRef<HTMLDivElement>(null);

  const {
    preview, previewLoading, previewError, fetchPreview,
    isImporting: f95Importing, progress: f95Progress, logs: f95Logs, summary: f95Summary,
    startImport: f95StartImport, stopImport: f95StopImport, reset: f95Reset,
  } = useF95Import();

  const [selectedTraducteur, setSelectedTraducteur] = useState('');
  const [f95SkipExisting, setF95SkipExisting] = useState(true);
  const [f95OverwriteAll, setF95OverwriteAll] = useState(false);
  const [f95SelectedIds, setF95SelectedIds] = useState<Set<number>>(new Set());

  const [importOptions, setImportOptions] = useState<ImportOptions>({
    skipExisting: true, overwriteLabels: false, overwritePaths: false, overwriteAll: false,
  });

  const {
    parseStatus, parseError, parseWarnings, parseStats, fileEntries,
    parseDbFile, isImporting, progress, logs, summary, startImport, stopImport, reset,
  } = useNexusImport();

  const dbInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const f95LogsContainerRef = useRef<HTMLDivElement>(null);

  const [collSynopsisRunning, setCollSynopsisRunning] = useState(false);
  const [collSynopsisLogs, setCollSynopsisLogs] = useState<string[]>([]);
  const [collSynopsisProgress, setCollSynopsisProgress] = useState({ current: 0, total: 0 });
  const [collSynopsisSummary, setCollSynopsisSummary] = useState<{ updated: number; skipped: number; errors: number } | null>(null);
  const [collSynopsisForce, setCollSynopsisForce] = useState(false);
  const collSynopsisLogsRef = useRef<HTMLDivElement>(null);
  const collSynopsisAbortRef = useRef<AbortController | null>(null);

  const [traducteurs, setTraducteurs] = useState<string[]>([]);
  const [traducteursLoading, setTraducteursLoading] = useState(false);

  const fetchTraducteurs = useCallback(async () => {
    setTraducteursLoading(true);
    try {
      const base = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
      const key  = localStorage.getItem('apiKey') || '';
      const res  = await fetch(`${base}/api/jeux`, { headers: { 'X-API-KEY': key } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: GameF95[] = Array.isArray(data) ? data : (data.jeux ?? []);
      const unique = [...new Set(list.map((g) => g.traducteur).filter(Boolean))].sort() as string[];
      setTraducteurs(unique);
    } catch (e) {
      console.error('Impossible de charger les traducteurs :', e);
    } finally {
      setTraducteursLoading(false);
    }
  }, []);

  useEffect(() => { fetchTraducteurs(); }, [fetchTraducteurs]);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  useEffect(() => { const el = f95LogsContainerRef.current; if (el) el.scrollTop = el.scrollHeight; }, [f95Logs]);
  useEffect(() => { const el = enrichLogsContainerRef.current; if (el) el.scrollTop = el.scrollHeight; }, [enrichLogs]);
  useEffect(() => { const el = collSynopsisLogsRef.current; if (el) el.scrollTop = el.scrollHeight; }, [collSynopsisLogs]);

  const f95Items = preview?.items ?? preview?.sample ?? [];

  const f95SelectAll = useCallback(() => {
    const ids = new Set<number>();
    f95Items.forEach(j => { const sid = j.site_id; if (sid != null) ids.add(sid); });
    setF95SelectedIds(ids);
  }, [f95Items]);
  const f95SelectNone = useCallback(() => setF95SelectedIds(new Set()), []);
  const f95ToggleItem = useCallback((siteId: number) => {
    setF95SelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId); else next.add(siteId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (preview?.items?.length) {
      setF95SelectedIds(prev => {
        const allIds = new Set(preview.items!.map(j => j.site_id).filter((x): x is number => x != null));
        if (prev.size === 0) return prev;
        const next = new Set<number>();
        prev.forEach(id => { if (allIds.has(id)) next.add(id); });
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

  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  const logLineClass = (line: string) =>
    line.startsWith('✅') || line.startsWith('🔄') ? 'settings-enrichment-log-line--success'
    : line.startsWith('❌') ? 'settings-enrichment-log-line--error'
    : line.startsWith('⏭️') ? 'settings-enrichment-log-line--skip'
    : '';

  const handleCollectionSynopsis = useCallback(async () => {
    if (!user?.id || collSynopsisRunning) return;
    const sb = getSupabase();
    if (!sb) { showToast('Supabase non configuré', 'error'); return; }

    const base = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
    const key = localStorage.getItem('apiKey') || '';
    if (!base || !key) { showToast('API non configurée (URL et clé manquantes)', 'error'); return; }

    setCollSynopsisRunning(true);
    setCollSynopsisLogs(['🔍 Recherche des jeux de votre collection…']);
    setCollSynopsisSummary(null);
    setCollSynopsisProgress({ current: 0, total: 0 });

    try {
      const { data: collItems, error: collError } = await sb
        .from('user_collection')
        .select('id, f95_thread_id, scraped_data')
        .eq('owner_id', user.id)
        .not('f95_thread_id', 'is', null);

      if (collError) throw new Error(collError.message);

      const itemsToProcess = (collItems ?? []).filter((item: any) => {
        if (collSynopsisForce) return true;
        return !item.scraped_data || !item.scraped_data.synopsis_fr;
      });

      if (itemsToProcess.length === 0) {
        setCollSynopsisLogs(['ℹ️ Votre collection est vide ou tous les jeux ont déjà un synopsis.']);
        showToast('Tous les synopsis sont déjà traduits ! 🎉', 'success');
        setCollSynopsisRunning(false);
        return;
      }

      const threadIds = itemsToProcess.map((i: any) => i.f95_thread_id);
      setCollSynopsisLogs(p => [...p, `📚 ${itemsToProcess.length} jeu(x) nécessitent une vérification.`]);

      const { data: f95Items, error: f95Error } = await sb
        .from('f95_jeux')
        .select('id, site_id, synopsis_fr')
        .in('site_id', threadIds);

      if (f95Error) throw new Error(f95Error.message);

      const gamesToCopy: any[] = [];
      const gamesToScrape: any[] = [];

      for (const item of itemsToProcess) {
        const f95Data = (f95Items ?? []).find((f: any) => f.site_id === item.f95_thread_id);
        if (!f95Data) continue;
        if (f95Data.synopsis_fr && !collSynopsisForce) {
          gamesToCopy.push({ collId: item.id, f95Data, scrapedData: item.scraped_data });
        } else {
          gamesToScrape.push({ collId: item.id, f95Id: f95Data.id, scrapedData: item.scraped_data });
        }
      }

      let updatedCount = 0;

      if (gamesToCopy.length > 0) {
        setCollSynopsisLogs(p => [...p, `⚡ Copie locale de ${gamesToCopy.length} synopsis déjà existants...`]);
        for (const g of gamesToCopy) {
          const newData = { ...(g.scrapedData || {}), synopsis_fr: g.f95Data.synopsis_fr };
          await sb.from('user_collection').update({ scraped_data: newData }).eq('id', g.collId);
          updatedCount++;
        }
      }

      const targetIds = gamesToScrape.map(g => g.f95Id);

      if (targetIds.length > 0) {
        setCollSynopsisLogs(p => [...p, `🎯 ${targetIds.length} jeu(x) à traduire via l'API. Lancement…`]);
        collSynopsisAbortRef.current = new AbortController();
        const res = await fetch(`${base}/api/scrape/enrich`, {
          method: 'POST',
          headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: collSynopsisForce, target_ids: targetIds }),
          signal: collSynopsisAbortRef.current.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const line of decoder.decode(value, { stream: true }).split('\n').filter(Boolean)) {
              try {
                const d = JSON.parse(line);
                if (d.progress) setCollSynopsisProgress(d.progress);
                if (d.log) setCollSynopsisLogs(p => [...p, d.log]);
                if (d.status === 'completed') {
                  setCollSynopsisLogs(p => [...p, '🔄 Resynchronisation vers votre collection...']);
                  const { data: updatedF95 } = await sb
                    .from('f95_jeux')
                    .select('id, synopsis_fr')
                    .in('id', targetIds);
                  let apiUpdatedCount = 0;
                  for (const g of gamesToScrape) {
                    const freshF95 = (updatedF95 ?? []).find((f: any) => f.id === g.f95Id);
                    if (freshF95?.synopsis_fr) {
                      const newData = { ...(g.scrapedData || {}), synopsis_fr: freshF95.synopsis_fr };
                      await sb.from('user_collection').update({ scraped_data: newData }).eq('id', g.collId);
                      apiUpdatedCount++;
                      updatedCount++;
                    }
                  }
                  const errorsCount = d.failed_entries?.length ?? 0;
                  const skippedCount = targetIds.length - apiUpdatedCount;
                  setCollSynopsisSummary({ updated: updatedCount, skipped: skippedCount, errors: errorsCount });
                  setCollSynopsisLogs(p => [...p, '✅ Enrichissement terminé.']);
                  showToast(
                    `Synopsis : ${updatedCount} mis à jour, ${skippedCount} ignoré(s)${errorsCount > 0 ? `, ${errorsCount} erreur(s)` : ''}`,
                    errorsCount > 0 ? 'warning' : 'success'
                  );
                }
                if (d.error) setCollSynopsisLogs(p => [...p, `❌ Erreur : ${d.error}`]);
              } catch { /* Ligne NDJSON invalide */ }
            }
          }
        }
      } else {
        setCollSynopsisSummary({ updated: updatedCount, skipped: 0, errors: 0 });
        setCollSynopsisLogs(p => [...p, '✅ Toutes les copies locales sont terminées.']);
        showToast(`Synopsis : ${updatedCount} mis à jour localement ! 🎉`, 'success');
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        setCollSynopsisLogs(p => [...p, '⏸️ Enrichissement annulé.']);
        showToast('Enrichissement annulé', 'warning');
      } else {
        const msg = (err as Error)?.message ?? 'Erreur inconnue';
        setCollSynopsisLogs(p => [...p, `❌ Erreur : ${msg}`]);
        showToast(`Erreur : ${msg}`, 'error');
      }
    } finally {
      setCollSynopsisRunning(false);
    }
  }, [user?.id, collSynopsisRunning, collSynopsisForce, showToast]);

  const handleStopCollectionSynopsis = () => { collSynopsisAbortRef.current?.abort(); };
  const resetCollectionSynopsis = () => {
    setCollSynopsisLogs([]);
    setCollSynopsisSummary(null);
    setCollSynopsisProgress({ current: 0, total: 0 });
  };
  const collSynopsisProgressPct = collSynopsisProgress.total > 0
    ? Math.round((collSynopsisProgress.current / collSynopsisProgress.total) * 100)
    : 0;

  const handleDownloadScript = () => {
    const blob = new Blob([scriptTampermonkeyRaw], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'DiscordPublisherDataExtractor.user.js';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Script Tampermonkey téléchargé', 'success');
  };

  return (
    <>
      {/* ════════════════════════════════════════════════════════
          GROUPE 1 — Importer des jeux
      ════════════════════════════════════════════════════════ */}
      <div className="settings-section__intro" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, color: 'var(--muted)', marginBottom: 6, paddingLeft: 2 }}>
        📥 Importer des jeux
      </div>

      <div className="settings-grid" style={{ marginBottom: 24 }}>

        {/* ─── Script Tampermonkey ─── */}
        <section className="settings-section settings-grid--full">
          <h4 className="settings-section__title">🐒 Ajouter via Tampermonkey</h4>
          <p className="settings-section__intro settings-section__intro--mb-16">
            Installez ce script dans Tampermonkey pour ajouter n&apos;importe quel jeu depuis F95Zone ou
            LewdCorner en un clic. L&apos;application doit être ouverte — le script se connecte
            automatiquement via <code>localhost:7832</code>.
          </p>
          <div className="settings-form-actions__row" style={{ gap: '10px' }}>
            <button type="button" onClick={handleDownloadScript} className="form-btn form-btn--primary">
              📥 Télécharger le script
            </button>
            <button
              type="button"
              onClick={() => tauriAPI.openUrl('https://www.tampermonkey.net/')}
              className="form-btn form-btn--ghost"
            >
              🌐 Installer Tampermonkey
            </button>
          </div>
          <p className="settings-section__intro settings-section__intro--hint">
            Tableau de bord Tampermonkey → « Créer un nouveau script » → collez le fichier → enregistrez.
          </p>
        </section>

        {/* ─── Import depuis la bibliothèque F95 ─── */}
        <section className="settings-section">
          <h4 className="settings-section__title">📚 Import depuis la bibliothèque F95</h4>
          <p className="settings-log-description">Sélectionnez un traducteur pour importer ses jeux directement dans votre collection.</p>

          <div className="collection-f95-select-row">
            <select
              className="app-input collection-f95-select"
              value={selectedTraducteur}
              onChange={e => setSelectedTraducteur(e.target.value)}
              disabled={traducteursLoading}
            >
              <option value="">— Choisir un traducteur —</option>
              {traducteurs.map(t => <option key={t} value={t}>{t}</option>)}
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
                  onChange={v => { setF95SkipExisting(v); if (v) setF95OverwriteAll(false); }}
                  disabled={f95Importing || f95OverwriteAll}
                  size="sm"
                />
                <Toggle
                  label="Écraser les données des jeux déjà en collection"
                  checked={f95OverwriteAll}
                  onChange={v => { setF95OverwriteAll(v); if (v) setF95SkipExisting(false); }}
                  disabled={f95Importing}
                  size="sm"
                />
              </div>

              <div className="collection-f95-list-toolbar">
                <button type="button" className="form-btn form-btn--ghost form-btn--xs" onClick={f95SelectAll}>Tout sélectionner</button>
                <button type="button" className="form-btn form-btn--ghost form-btn--xs" onClick={f95SelectNone}>Tout désélectionner</button>
                <span className="collection-f95-selected-count">{f95SelectedIds.size} / {f95Items.length} sélectionné(s)</span>
              </div>

              <div className="collection-f95-list styled-scrollbar">
                {f95Items.map(j => {
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
                  <button type="button" className="form-btn form-btn--ghost" onClick={f95Reset}>← Changer de traducteur</button>
                  {!f95Importing ? (
                    <button
                      type="button"
                      className="form-btn form-btn--primary"
                      onClick={() => f95StartImport(selectedTraducteur, { skipExisting: f95SkipExisting, overwriteAll: f95OverwriteAll }, f95SelectedIds.size > 0 ? [...f95SelectedIds] : undefined)}
                      disabled={f95SelectedIds.size === 0}
                    >
                      🚀 Lancer ({f95SelectedIds.size} jeu(x))
                    </button>
                  ) : (
                    <button type="button" className="form-btn form-btn--danger" onClick={f95StopImport}>⏹️ Arrêter</button>
                  )}
                </div>
              ) : (
                <>
                  <div className="collection-import-summary">
                    <div className="collection-import-summary-item collection-import-summary-item--success"><span>✅</span><strong>{f95Summary.imported}</strong><span>importé(s)</span></div>
                    <div className="collection-import-summary-item collection-import-summary-item--skip"><span>⏭️</span><strong>{f95Summary.skipped}</strong><span>ignoré(s)</span></div>
                    <div className={`collection-import-summary-item${f95Summary.errors > 0 ? ' collection-import-summary-item--error' : ''}`}><span>❌</span><strong>{f95Summary.errors}</strong><span>erreur(s)</span></div>
                  </div>
                  <div className="collection-import-actions">
                    <button type="button" className="form-btn form-btn--ghost" onClick={f95Reset}>🔄 Nouvel import</button>
                  </div>
                </>
              )}
            </>
          )}

          {(f95Importing || f95Logs.length > 0) && (
            <>
              {f95Progress.total > 0 && (
                <div className="settings-enrichment-progress-row">
                  <div className="settings-enrichment-progress-track">
                    <div className="settings-enrichment-progress-fill" style={{ ['--progress-pct' as string]: `${f95Progress.total ? Math.round((f95Progress.current / f95Progress.total) * 100) : 0}%` }} />
                  </div>
                  <span className="settings-enrichment-progress-label">{f95Progress.current} / {f95Progress.total}</span>
                </div>
              )}
              <div ref={f95LogsContainerRef} className="settings-logs-box styled-scrollbar" style={{ maxHeight: 200 }}>
                {f95Logs.map((log, idx) => <div key={idx} className={`settings-enrichment-log-line ${logLineClass(log)}`}>{log}</div>)}
              </div>
            </>
          )}
        </section>

        {/* ─── Import depuis Nexus ─── */}
        <section className="settings-section">
          <div className="settings-log-header">
            <div>
              <h4 className="settings-section__title">📦 Import depuis Nexus</h4>
              <p className="settings-log-description">Importez vos jeux adultes directement depuis le fichier <code>.db</code> de l&apos;application Nexus.</p>
            </div>
            {parseStatus !== 'idle' && (
              <button type="button" onClick={reset} className="form-btn form-btn--ghost form-btn--sm" disabled={isImporting}>🔄 Recommencer</button>
            )}
          </div>

          {parseStatus === 'idle' && (
            <div className="collection-import-drop-zone">
              <input ref={dbInputRef} type="file" accept=".db,application/x-sqlite3,application/octet-stream" onChange={handleDbChange} style={{ display: 'none' }} />
              <div className="collection-import-drop-inner">
                <span className="collection-import-drop-icon">🗄️</span>
                <p className="collection-import-drop-label">Sélectionnez le fichier <strong>.db</strong> exporté depuis Nexus</p>
                <p className="collection-import-db-hint">Dans Nexus : Paramètres → Base de données → <strong>Exporter la base de données</strong></p>
                <button type="button" className="form-btn form-btn--primary" onClick={() => dbInputRef.current?.click()}>📂 Choisir le fichier .db…</button>
              </div>
            </div>
          )}

          {parseStatus === 'parsing' && (
            <div className="collection-import-parsing"><span className="collection-import-parsing-icon">⏳</span><span>Analyse du fichier en cours…</span></div>
          )}

          {parseStatus === 'error' && (
            <div className="collection-import-parse-error">
              <p>❌ {parseError}</p>
              <button type="button" className="form-btn form-btn--ghost form-btn--sm" onClick={reset}>Réessayer</button>
            </div>
          )}

          {parseStatus === 'ready' && parseStats && fileEntries && (
            <>
              <div className="collection-import-preview">
                <div className="collection-import-preview-stat"><span className="collection-import-stat-value">{parseStats.total}</span><span className="collection-import-stat-label">jeux détectés</span></div>
                <div className="collection-import-preview-stat"><span className="collection-import-stat-value">{parseStats.with_f95}</span><span className="collection-import-stat-label">avec ID F95</span></div>
                <div className="collection-import-preview-stat"><span className="collection-import-stat-value">{parseStats.with_lc}</span><span className="collection-import-stat-label">Lewdcorner seul</span></div>
                <div className="collection-import-preview-stat"><span className="collection-import-stat-value">{parseStats.with_paths}</span><span className="collection-import-stat-label">avec chemins exe</span></div>
                <div className="collection-import-preview-stat"><span className="collection-import-stat-value">{parseStats.with_labels}</span><span className="collection-import-stat-label">avec labels</span></div>
              </div>

              {parseWarnings.length > 0 && (
                <div className="collection-import-warnings">
                  {parseWarnings.map((w, i) => <p key={i} className="collection-import-warning-line">⚠️ {w}</p>)}
                </div>
              )}

              {!summary && (
                <>
                  <div className="collection-import-options">
                    <Toggle label="Ignorer les jeux déjà en collection (recommandé)" checked={importOptions.skipExisting && !importOptions.overwriteAll} onChange={v => setImportOptions(o => ({ ...o, skipExisting: v, overwriteAll: v ? false : o.overwriteAll }))} disabled={isImporting || importOptions.overwriteAll} size="sm" />
                    <Toggle label="Écraser les labels si le jeu est déjà en collection" checked={importOptions.overwriteLabels || importOptions.overwriteAll} onChange={v => setImportOptions(o => ({ ...o, overwriteLabels: v }))} disabled={isImporting || importOptions.overwriteAll} size="sm" />
                    <Toggle label="Écraser les chemins exécutables si le jeu est déjà en collection" checked={importOptions.overwritePaths || importOptions.overwriteAll} onChange={v => setImportOptions(o => ({ ...o, overwritePaths: v }))} disabled={isImporting || importOptions.overwriteAll} size="sm" />
                    <div className="collection-import-options-separator" />
                    <Toggle label="Forcer la réimportation complète (écrase toutes les données)" checked={importOptions.overwriteAll} onChange={v => setImportOptions(o => ({ ...o, overwriteAll: v, skipExisting: v ? false : true, overwriteLabels: v ? true : false, overwritePaths: v ? true : false }))} disabled={isImporting} size="sm" title="Réimporte et écrase titre, données, labels et chemins, même si le jeu est déjà en collection" />
                  </div>
                  <div className="collection-import-actions">
                    {!isImporting ? (
                      <button type="button" className="form-btn form-btn--primary" onClick={() => startImport(importOptions)}>▶️ Lancer l&apos;import ({fileEntries.length} jeux)</button>
                    ) : (
                      <button type="button" className="form-btn form-btn--danger" onClick={stopImport}>⏹️ Arrêter</button>
                    )}
                  </div>
                </>
              )}

              {summary && (
                <div className="collection-import-summary">
                  <div className="collection-import-summary-item collection-import-summary-item--success"><span>✅</span><strong>{summary.imported}</strong><span>importé(s)</span></div>
                  <div className="collection-import-summary-item collection-import-summary-item--skip"><span>⏭️</span><strong>{summary.skipped}</strong><span>ignoré(s)</span></div>
                  <div className={`collection-import-summary-item${summary.errors > 0 ? ' collection-import-summary-item--error' : ''}`}><span>❌</span><strong>{summary.errors}</strong><span>erreur(s)</span></div>
                </div>
              )}
            </>
          )}

          {(isImporting || logs.length > 0) && (
            <>
              {progress.total > 0 && (
                <div className="settings-enrichment-progress-row">
                  <div className="settings-enrichment-progress-track">
                    <div className="settings-enrichment-progress-fill" style={{ ['--progress-pct' as string]: `${progressPercent}%` }} />
                  </div>
                  <span className="settings-enrichment-progress-label">{progress.current} / {progress.total} ({progressPercent}%)</span>
                </div>
              )}
              <div className="settings-logs-box styled-scrollbar">
                {logs.map((log, idx) => <div key={idx} className={`settings-enrichment-log-line ${logLineClass(log)}`}>{log}</div>)}
                <div ref={logsEndRef} />
              </div>
            </>
          )}
        </section>
      </div>

      {/* ════════════════════════════════════════════════════════
          GROUPE 2 — Enrichir les données
      ════════════════════════════════════════════════════════ */}
      <div className="settings-section__intro" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, color: 'var(--muted)', marginBottom: 6, paddingLeft: 2 }}>
        ✨ Enrichir les données
      </div>

      <div className="settings-grid">

        {/* ─── Traduction synopsis Ma collection ─── */}
        <section className="settings-section">
          <h4 className="settings-section__title">📝 Traduction synopsis</h4>
          <p className="settings-log-description">
            Récupère et traduit EN→FR les synopsis des jeux de votre collection liés à la base F95.
            Utile après un import ou un ajout via Tampermonkey.
          </p>

          <div className="f95-enrich-scrape-section">
            <Toggle
              label="🔄 Forcer la re-traduction (même pour les jeux qui ont déjà un synopsis FR)"
              checked={collSynopsisForce}
              onChange={setCollSynopsisForce}
              disabled={collSynopsisRunning}
              size="sm"
            />
          </div>

          <div className="collection-enrich-actions">
            {!collSynopsisSummary ? (
              !collSynopsisRunning ? (
                <button
                  type="button"
                  className="form-btn form-btn--primary"
                  onClick={handleCollectionSynopsis}
                  disabled={!user}
                >
                  🚀 Lancer la traduction
                </button>
              ) : (
                <>
                  {collSynopsisProgress.total > 0 && (
                    <div className="settings-enrichment-progress-row">
                      <div className="settings-enrichment-progress-track">
                        <div
                          className="settings-enrichment-progress-fill"
                          style={{ ['--progress-pct' as string]: `${collSynopsisProgressPct}%` }}
                        />
                      </div>
                      <span className="settings-enrichment-progress-label">
                        {collSynopsisProgress.current} / {collSynopsisProgress.total || '…'}
                      </span>
                    </div>
                  )}
                  <div ref={collSynopsisLogsRef} className="settings-logs-box styled-scrollbar" style={{ maxHeight: 220 }}>
                    {collSynopsisLogs.map((l, i) => (
                      <div key={i} className={`settings-enrichment-log-line ${logLineClass(l)}`}>{l}</div>
                    ))}
                  </div>
                  <button type="button" className="form-btn form-btn--danger" onClick={handleStopCollectionSynopsis}>
                    ⏹️ Arrêter
                  </button>
                </>
              )
            ) : (
              <>
                <div className="collection-import-summary">
                  <div className="collection-import-summary-item collection-import-summary-item--success">
                    <span>✅</span><strong>{collSynopsisSummary.updated}</strong><span>traduit(s)</span>
                  </div>
                  <div className="collection-import-summary-item collection-import-summary-item--skip">
                    <span>⏭️</span><strong>{collSynopsisSummary.skipped}</strong><span>ignoré(s)</span>
                  </div>
                  {collSynopsisSummary.errors > 0 && (
                    <div className="collection-import-summary-item collection-import-summary-item--error">
                      <span>❌</span><strong>{collSynopsisSummary.errors}</strong><span>erreur(s)</span>
                    </div>
                  )}
                </div>
                <div ref={collSynopsisLogsRef} className="settings-logs-box styled-scrollbar" style={{ maxHeight: 180 }}>
                  {collSynopsisLogs.map((l, i) => (
                    <div key={i} className={`settings-enrichment-log-line ${logLineClass(l)}`}>{l}</div>
                  ))}
                </div>
                <div className="collection-import-actions">
                  <button type="button" className="form-btn form-btn--ghost" onClick={resetCollectionSynopsis}>
                    🔄 Relancer
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ─── Enrichissement des données ─── */}
        <section className="settings-section">
          <h4 className="settings-section__title">🔄 Enrichir les données</h4>
          <p className="settings-log-description">
            Met à jour les données de vos jeux (version, statut, synopsis…) depuis la base F95.
            Peut aussi scraper F95Zone directement pour les ajouts sans correspondance.
          </p>

          {/* Planification automatique */}
          <div className="collection-enrich-schedule">
            <h5 className="collection-enrich-schedule-title">⏰ Enrichissement automatique</h5>
            <div className="collection-enrich-schedule-row">
              <label className="form-label">Fréquence</label>
              <select
                className="app-input collection-enrich-schedule-select"
                value={enrichAutoFrequency}
                onChange={e => setEnrichSchedule({ enrich_auto_frequency: e.target.value as 'manual' | 'daily' | 'weekly' })}
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
                    onChange={e => setEnrichSchedule({ enrich_auto_hour: Number(e.target.value) })}
                    disabled={prefsLoading}
                  >
                    {Array.from({ length: 21 }, (_, i) => i + 3).map(h => (
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
                      onChange={e => setEnrichSchedule({ enrich_auto_day: Number(e.target.value) })}
                      disabled={prefsLoading}
                    >
                      <option value={0}>Dimanche</option><option value={1}>Lundi</option>
                      <option value={2}>Mardi</option><option value={3}>Mercredi</option>
                      <option value={4}>Jeudi</option><option value={5}>Vendredi</option>
                      <option value={6}>Samedi</option>
                    </select>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="f95-enrich-scrape-section">
            <Toggle
              label="🕷️ Scraper F95Zone pour les entrées sans données (ajouts manuels ou jeux non encore dans la bibliothèque)"
              checked={enrichScrapeMissing}
              onChange={setEnrichScrapeMissing}
              disabled={enrichRunning}
              size="sm"
            />
            {enrichScrapeMissing && (
              <div className="f95-enrich-scrape-options">
                <div className="f95-lib-import-field">
                  <label className="form-label">🍪 Cookie F95 <em>(utilise ceux enregistrés dans « Cookies F95 » si vide)</em></label>
                  <input type="password" className="app-input" value={enrichF95Cookies} onChange={e => setEnrichF95Cookies(e.target.value)} placeholder="Valeur du cookie xf_session…" disabled={enrichRunning} />
                </div>
                <div className="f95-lib-import-field f95-lib-import-field--limit">
                  <label className="form-label">⏱️ Délai entre les scrapes</label>
                  <select className="app-input" value={enrichScrapeDelay} onChange={e => setEnrichScrapeDelay(Number(e.target.value))} disabled={enrichRunning}>
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
                  🚀 Lancer l&apos;enrichissement
                </button>
              ) : (
                <>
                  <div className="settings-enrichment-progress-row">
                    <div className="settings-enrichment-progress-track">
                      <div className="settings-enrichment-progress-fill" style={{ ['--progress-pct' as string]: `${enrichProgress.total > 0 ? Math.round((enrichProgress.current / enrichProgress.total) * 100) : 0}%` }} />
                    </div>
                    <span className="settings-enrichment-progress-label">{enrichProgress.current} / {enrichProgress.total || '…'}</span>
                  </div>
                  <div ref={enrichLogsContainerRef} className="settings-logs-box styled-scrollbar" style={{ maxHeight: 220 }}>
                    {enrichLogs.map((l, i) => <div key={i} className={`settings-enrichment-log-line ${logLineClass(l)}`}>{l}</div>)}
                  </div>
                  <button type="button" className="form-btn form-btn--danger" onClick={stopEnrich}>⏹️ Arrêter</button>
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
                  {enrichLogs.map((l, i) => <div key={i} className={`settings-enrichment-log-line ${logLineClass(l)}`}>{l}</div>)}
                </div>
                <div className="collection-import-actions">
                  <button type="button" className="form-btn form-btn--ghost" onClick={enrichReset}>🔄 Relancer</button>
                </div>
              </>
            )}
          </div>
        </section>

      </div>
    </>
  );
}