import { useCallback, useEffect, useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';
import { tauriAPI } from '../../lib/tauri-api';
import { getSupabase } from '../../lib/supabase';
import { trackTranslationClick, createApiHeaders } from '../../lib/api-helpers';
import { useToast } from '../shared/ToastProvider';
import type { GameF95 } from './library-types';
import type { CollectionLabel, ExecutablePathEntry } from '../../state/hooks/useCollection';
import {
  normalizeExecutablePaths,
  getExecutableDisplayName,
  formatExecutableLastSession,
} from '../../state/hooks/useCollection';
import { useTagAvoirs } from '../../state/hooks/useTagAvoirs';
import CollectionLabelsModal from './components/CollectionLabelsModal';
import ExecutablePathModal from './components/ExecutablePathModal';

interface GameDetailModalProps {
  game: GameF95;
  onClose: () => void;
  onAddToCollection?: (game: GameF95) => void;
  isInCollection?: boolean;
  collectionEntry?: {
    id: string;
    labels?: CollectionLabel[] | null;
    executable_paths?: ExecutablePathEntry[] | string[] | null;
  };
  allLabels?: CollectionLabel[];
  onUpdateLabels?: (entryId: string, labels: CollectionLabel[]) => Promise<{ ok: boolean; error?: string }>;
  onUpdateExecutablePaths?: (entryId: string, paths: ExecutablePathEntry[]) => Promise<{ ok: boolean; error?: string }>;
  onLabelsUpdated?: () => void;
  /** Ouvre la modale d'édition de l'entrée collection (footer) */
  onOpenEdit?: () => void;
  /** Appelé après un resync ou une mise à jour réussie (pour rafraîchir la liste parente).
   *  Reçoit le site_id du jeu resynced pour permettre la ré-ouverture de la modale. */
  onGameUpdated?: (siteId?: number) => void;
}

export default function GameDetailModal({
  game,
  onClose,
  onAddToCollection,
  isInCollection,
  collectionEntry,
  allLabels = [],
  onUpdateLabels,
  onUpdateExecutablePaths,
  onLabelsUpdated,
  onOpenEdit,
  onGameUpdated,
}: GameDetailModalProps) {
  const { showToast } = useToast();
  const [showLabelsModal, setShowLabelsModal] = useState(false);
  const [executableModal, setExecutableModal] = useState<{ mode: 'add' } | { mode: 'edit'; index: number } | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  useEscapeKey(onClose, !showLabelsModal && !lightboxOpen && !executableModal);
  useEscapeKey(() => setLightboxOpen(false), lightboxOpen);
  useModalScrollLock();

  const { getAvoir, setAvoir, cycleAvoir } = useTagAvoirs();
  const [tags, setTags] = useState<string[]>([]);
  const [detailLabels, setDetailLabels] = useState<CollectionLabel[]>(() => collectionEntry?.labels ?? []);
  const [detailExecutablePaths, setDetailExecutablePaths] = useState<ExecutablePathEntry[]>(
    () => normalizeExecutablePaths(collectionEntry?.executable_paths)
  );
  useEffect(() => { setDetailLabels(collectionEntry?.labels ?? []); }, [collectionEntry?.labels]);
  useEffect(() => { setDetailExecutablePaths(normalizeExecutablePaths(collectionEntry?.executable_paths)); }, [collectionEntry?.executable_paths]);

  /** Sauvegarde silencieuse (pas de refresh collection) pour rester sur la modale détail. */
  const saveExecutablePaths = useCallback(async (next: ExecutablePathEntry[]) => {
    if (!collectionEntry || !onUpdateExecutablePaths) return { ok: false as const, error: 'Non disponible' };
    setDetailExecutablePaths(next);
    const res = await onUpdateExecutablePaths(collectionEntry.id, next);
    if (!res.ok) {
      setDetailExecutablePaths(normalizeExecutablePaths(collectionEntry.executable_paths));
      showToast(res.error ?? 'Erreur lors de la mise à jour.', 'error');
    }
    return res;
  }, [collectionEntry, onUpdateExecutablePaths, showToast]);

  const [synopsisFr, setSynopsisFr] = useState<string>(() => game.synopsis_fr ?? '');
  const [synopsisEn, setSynopsisEn] = useState<string>(() => game.synopsis_en ?? '');
  const [editingSynopsis, setEditingSynopsis] = useState(false);
  const [savingSynopsis, setSavingSynopsis] = useState(false);
  const [downloadCount, setDownloadCount] = useState<number | null>(null);

  // Enrichissement synopsis depuis la modale
  const [enrichingSynopsis, setEnrichingSynopsis] = useState(false);

  // Resync depuis l'API publique
  const [syncingFromApi, setSyncingFromApi] = useState(false);

  const f95JeuId = game.f95_jeux_id ?? game.id;
  const canEditSynopsis = typeof f95JeuId === 'number' && f95JeuId > 0;
  const canSyncFromApi  = typeof game.site_id === 'number' && game.site_id > 0;

  // ── Chargement synopsis Supabase ──────────────────────────────────────────
  const loadSynopsisData = useCallback(async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      );
      const selector = supabase.from('f95_jeux').select('synopsis_fr, synopsis_en');
      const query = game.site_id
        ? selector.eq('site_id', game.site_id)
        : game.nom_url
          ? selector.eq('nom_url', game.nom_url)
          : null;
      if (!query) return;
      const { data, error } = await query
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        if (data.synopsis_fr) setSynopsisFr(data.synopsis_fr);
        if (data.synopsis_en) setSynopsisEn(data.synopsis_en);
      }
    } catch (e) {
      console.warn('Erreur chargement synopsis:', e);
    }
  }, [game.site_id, game.nom_url]);

  useEffect(() => {
    if (game.synopsis_en) setSynopsisEn(game.synopsis_en);
    if (game.synopsis_fr) setSynopsisFr(game.synopsis_fr);
    if (game.tags) {
      try {
        const tagList = typeof game.tags === 'string'
          ? game.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
          : game.tags;
        setTags(tagList);
      } catch (e) {
        console.warn('Erreur parsing tags:', e);
      }
    }
    loadSynopsisData();
  }, [game, loadSynopsisData]);

  useEffect(() => {
    if (!game.nom_url) { setDownloadCount(null); return; }
    let cancelled = false;
    (async () => {
      const sb = getSupabase();
      if (!sb) return;
      try {
        const { count, error } = await sb
          .from('translation_clicks')
          .select('*', { count: 'exact', head: true })
          .eq('f95_url', game.nom_url);
        if (!cancelled && !error) setDownloadCount(count ?? 0);
      } catch { if (!cancelled) setDownloadCount(null); }
    })();
    return () => { cancelled = true; };
  }, [game.nom_url]);

  // ── Enrichissement synopsis depuis la modale ──────────────────────────────
  const handleEnrichSynopsis = async () => {
    if (!canEditSynopsis || enrichingSynopsis) return;
    const base = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
    const key = localStorage.getItem('apiKey') || '';
    if (!base || !key) {
      showToast('API non configurée (URL et clé)', 'error');
      return;
    }
    setEnrichingSynopsis(true);
    try {
      const res = await fetch(`${base}/api/scrape/enrich`, {
        method: 'POST',
        headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: false, target_ids: [f95JeuId] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let enriched = false;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of decoder.decode(value, { stream: true }).split('\n').filter(Boolean)) {
            try {
              const d = JSON.parse(line);
              if (d.status === 'completed') enriched = true;
            } catch { /* ndjson partiel */ }
          }
        }
      }

      // Recharger le synopsis depuis Supabase
      await loadSynopsisData();

      if (enriched) {
        showToast('Synopsis enrichi avec succès', 'success');
      } else {
        showToast('Enrichissement terminé (pas de changement)', 'warning');
      }
    } catch (err: unknown) {
      showToast(`Erreur enrichissement : ${(err as Error)?.message}`, 'error');
    } finally {
      setEnrichingSynopsis(false);
    }
  };

  // ── Resync depuis l'API publique F95FR ───────────────────────────────────
  const handleSyncFromApi = async () => {
    if (!canSyncFromApi || syncingFromApi) return;
    const base = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
    const key  = localStorage.getItem('apiKey') || '';
    if (!base || !key) { showToast('API non configurée (URL et clé)', 'error'); return; }

    setSyncingFromApi(true);
    try {
      const headers = await createApiHeaders(key);
      const res = await fetch(`${base}/api/jeux/sync-game`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body   : JSON.stringify({ site_id: game.site_id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showToast(data.error || `Erreur HTTP ${res.status}`, 'error');
        return;
      }
      // Recharger le synopsis depuis Supabase après la resync
      await loadSynopsisData();
      // Rafraîchir la liste parente (Bibliothèque ou Collection) pour refléter les nouvelles données
      // On passe le site_id pour permettre la ré-ouverture automatique de la modale
      onGameUpdated?.(game.site_id);
      showToast(
        `Jeu resynchronisé depuis l'API (${data.synced_count} entrée${data.synced_count > 1 ? 's' : ''})`,
        'success',
      );
    } catch (err: unknown) {
      showToast(`Erreur resync : ${(err as Error)?.message}`, 'error');
    } finally {
      setSyncingFromApi(false);
    }
  };

  const openLink = (url: string) => { if (url) tauriAPI.openUrl(url); };
  const isCollectionView = !!collectionEntry;

  return (
    <div className="library-detail-backdrop">
      <div
        className={`library-detail-panel styled-scrollbar ${isCollectionView ? 'library-detail-panel--collection' : 'library-detail-panel--library'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className={`library-detail-header${game.image ? ' library-detail-header--has-image' : ''}`}
          style={
            game.image
              ? { ['--library-detail-header-bg' as string]: `linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.7)), url(${game.image}) center/contain no-repeat` }
              : undefined
          }
          onClick={game.image ? () => setLightboxOpen(true) : undefined}
          title={game.image ? "Cliquer pour voir l'image en plein écran" : undefined}
        >
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 className="library-detail-title" style={{ margin: 0 }}>{game.nom_du_jeu || 'Sans titre'}</h2>
            <div className="library-detail-versions">
              <span className="library-detail-version-badge">🎮 {game.version || 'v?'}</span>
              <span>→</span>
              <span className="library-detail-version-badge library-detail-version-badge--trad">
                🇫🇷 {game.trad_ver === 'Intégrée' ? game.version || 'v?' : game.trad_ver || 'N/A'}
                {game.trad_ver === 'Intégrée' && <span style={{ fontSize: '0.8em', opacity: 0.7, marginLeft: 4 }}>(Intégrée)</span>}
              </span>
            </div>
          </div>

              {/* Lien vers le thread du jeu — juste après le titre */}
              {game.nom_url && (
                <button
                  type="button"
                  className="library-detail-header-link-btn"
                  onClick={e => { e.stopPropagation(); tauriAPI.openUrl(game.nom_url!); }}
                  title={`Ouvrir le thread F95Zone — ${game.nom_url}`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  Lien du jeu
                </button>
              )}
            </div>
        </div>

        {/* ── Body ── */}
        <div className={`library-detail-body library-detail-body--two-cols ${isCollectionView ? 'library-detail-body--collection' : 'library-detail-body--library'}`}>
          <div className="library-detail-col library-detail-col--left">
            <div className="library-detail-block library-detail-block--details">
              <h3 className="library-detail-block-title library-detail-block-title--green">ℹ️ Détails</h3>
              <div className="library-detail-grid">
                <InfoRow label="Statut" value={game.statut} />
                <InfoRow label="Type de trad" value={game.type_de_traduction} />
                {/* Traducteurs : primary + variantes avec traducteurs différents */}
                {(() => {
                  // Construire la liste dédupliquée des traducteurs (primary + variantes)
                  const seen = new Set<string>();
                  const trad_list: { name: string; url?: string }[] = [];
                  const addTrad = (name?: string, url?: string) => {
                    if (!name || name === 'N/A') return;
                    if (seen.has(name)) return;
                    seen.add(name);
                    trad_list.push({ name, url: url || undefined });
                  };
                  addTrad(game.traducteur, game.traducteur_url);
                  game.variants?.forEach(v => addTrad(v.traducteur, v.traducteur_url));
                  if (trad_list.length === 0) return <InfoRow label="Traducteur" showWhenEmpty />;
                  return (
                    <div className="library-detail-info-row">
                      <span className="library-detail-info-label">Traducteur{trad_list.length > 1 ? 's' : ''}</span>
                      <span className="library-detail-info-value" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {trad_list.map(({ name, url }, i) => (
                          <span key={name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {i > 0 && <span style={{ opacity: 0.4, marginRight: 2 }}>·</span>}
                            {name}
                            {url && (
                              <button
                                type="button"
                                className="library-detail-inline-link-btn"
                                onClick={() => tauriAPI.openUrl(url)}
                                title={url}
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                  <polyline points="15 3 21 3 21 9"/>
                                  <line x1="10" y1="14" x2="21" y2="3"/>
                                </svg>
                              </button>
                            )}
                          </span>
                        ))}
                      </span>
                    </div>
                  );
                })()}
                <InfoRow label="Type de jeu" value={game.type} />
              </div>
            </div>

            <div className="library-detail-block library-detail-block--tags">
              <h3 className="library-detail-block-title">🏷️ Tags</h3>
              <div className="library-detail-tags-list">
                {tags.length > 0
                  ? tags.map((tag, i) => {
                      const avis = isCollectionView ? getAvoir(tag) : 'neutral';
                      const className = `library-detail-tag library-detail-tag--${avis}`;
                      if (isCollectionView) {
                        return (
                          <button
                            key={i}
                            type="button"
                            className={`${className} tag-avoir-badge`}
                            onClick={async () => { const next = cycleAvoir(tag); await setAvoir(tag, next); }}
                            title={`Clic : ${avis} → ${cycleAvoir(tag)}`}
                          >
                            {tag}
                          </button>
                        );
                      }
                      return <span key={i} className={className}>{tag}</span>;
                    })
                  : <span className="library-detail-tags-empty">Aucun tag</span>}
              </div>
            </div>

            {isCollectionView && (
              <div className="library-detail-block library-detail-block--synopsis">
                <SynopsisBlock
                  synopsisFr={synopsisFr} synopsisEn={synopsisEn}
                  setSynopsisFr={setSynopsisFr} setSynopsisEn={setSynopsisEn}
                  editingSynopsis={editingSynopsis} setEditingSynopsis={setEditingSynopsis}
                  savingSynopsis={savingSynopsis} setSavingSynopsis={setSavingSynopsis}
                  f95JeuId={f95JeuId} canEditSynopsis={canEditSynopsis}
                />
              </div>
            )}
          </div>

          <div className="library-detail-col library-detail-col--right">
            {!isCollectionView && (
              <div className="library-detail-block library-detail-block--synopsis">
                <SynopsisBlock
                  synopsisFr={synopsisFr} synopsisEn={synopsisEn}
                  setSynopsisFr={setSynopsisFr} setSynopsisEn={setSynopsisEn}
                  editingSynopsis={editingSynopsis} setEditingSynopsis={setEditingSynopsis}
                  savingSynopsis={savingSynopsis} setSavingSynopsis={setSavingSynopsis}
                  f95JeuId={f95JeuId} canEditSynopsis={canEditSynopsis}
                />
              </div>
            )}

            <div className="library-detail-block library-detail-block--links">
              <h3 className="library-detail-block-title library-detail-block-title--yellow">🇫🇷 Traductions</h3>
              <div className="library-detail-links-row">
                {(() => {
                  // Détecter si plusieurs traducteurs distincts existent (primary + variantes)
                  const allTrads = [
                    game.traducteur,
                    ...(game.variants?.map(v => v.traducteur) ?? []),
                  ].filter(Boolean);
                  const uniqueTrads = new Set(allTrads);
                  const multiTrad = uniqueTrads.size > 1;

                  // Construit le label d'un bouton de traduction
                  const makeLabel = (trad_ver?: string, traducteur?: string, version?: string) => {
                    const ver = trad_ver === 'Intégrée'
                      ? `Intégrée — ${version || 'v?'}`
                      : trad_ver;
                    // Plusieurs traducteurs : préfixer par le nom du traducteur
                    if (multiTrad && traducteur) return traducteur + (ver ? ` — ${ver}` : '');
                    // Un seul traducteur : juste la version (section déjà titrée "Traductions")
                    return ver || 'Voir la traduction';
                  };

                  return (
                    <>
                      {/* Traduction principale */}
                      {(game.lien_trad || game.trad_ver) && (() => {
                        const href  = game.lien_trad || game.nom_url || '';
                        const label = makeLabel(game.trad_ver, game.traducteur, game.version);
                        if (!href) return null;
                        return (
                          <LinkButton
                            href={href}
                            label={label}
                            icon="🇫🇷" variant="trad"
                            onBeforeOpen={async () => {
                              if (game.nom_url && game.lien_trad) {
                                await trackTranslationClick({ f95Url: game.nom_url, translationUrl: game.lien_trad, source: 'detail_modal' });
                                setDownloadCount(c => (c ?? 0) + 1);
                              }
                            }}
                          />
                        );
                      })()}
                      {/* Variantes de traduction */}
                      {game.variants?.map((v, i) => {
                        const href  = v.lien_trad || game.nom_url || '';
                        const label = makeLabel(v.trad_ver, v.traducteur, v.version || game.version);
                        if (!href || !(v.trad_ver || v.lien_trad)) return null;
                        return (
                          <LinkButton
                            key={v.id ?? i}
                            href={href}
                            label={label}
                            icon="🇫🇷" variant="trad"
                            onBeforeOpen={async () => {
                              if (game.nom_url && v.lien_trad) {
                                await trackTranslationClick({ f95Url: game.nom_url, translationUrl: v.lien_trad!, source: 'detail_modal' });
                                setDownloadCount(c => (c ?? 0) + 1);
                              }
                            }}
                          />
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            </div>

            {isCollectionView && collectionEntry && onUpdateLabels && (
              <div className="library-detail-block library-detail-block--labels">
                <h3 className="library-detail-block-title">🏷️ Labels personnalisés</h3>
                {detailLabels.length > 0 ? (
                  <div className="library-labels-list">
                    {detailLabels.map(l => (
                      <span key={l.label} className="library-labels-badge" style={{ background: `${l.color}22`, borderColor: `${l.color}66`, color: l.color }}>{l.label}</span>
                    ))}
                  </div>
                ) : (
                  <p className="library-labels-empty">Aucun label.</p>
                )}
                <button type="button" className="form-btn form-btn--secondary" onClick={() => setShowLabelsModal(true)} style={{ marginTop: 8 }}>
                  {detailLabels.length > 0 ? 'Gérer les labels' : 'Ajouter des labels'}
                </button>
              </div>
            )}

            {isCollectionView && collectionEntry && onUpdateExecutablePaths && (
              <div className="library-detail-block library-detail-block--executables">
                <h3 className="library-detail-block-title">📁 Chemins des exécutables</h3>
                <div className="library-detail-executables-list">
                  {detailExecutablePaths.length === 0 ? (
                    <p className="library-detail-executables-empty">Aucun exécutable configuré.</p>
                  ) : (
                    <ul className="library-detail-executables-items">
                      {detailExecutablePaths.map((entry, i) => (
                        <li
                          key={`${entry.path}-${i}`}
                          className="library-detail-executable-item"
                          title={entry.path}
                        >
                          <div className="library-detail-executable-item-body">
                            <p className="library-detail-executable-summary">
                              <span className="library-detail-executable-display-name">
                                {getExecutableDisplayName(entry)}
                              </span>
                              <span className="library-detail-executable-summary-sep"> : </span>
                              <span className="library-detail-executable-session">
                                {formatExecutableLastSession(entry.last_launch)}
                              </span>
                            </p>
                          </div>
                          <button
                            type="button"
                            className="library-detail-executable-launch"
                            onClick={async () => {
                              const res = await tauriAPI.openPath(entry.path);
                              if (!res.ok) { showToast(res.error ?? "Impossible de lancer l'exécutable.", 'error'); return; }
                              const next = detailExecutablePaths.map((e, j) =>
                                j === i ? { ...e, last_launch: new Date().toISOString() } : e
                              );
                              void saveExecutablePaths(next);
                            }}
                            title="Lancer l'exécutable"
                          >▶️</button>
                          <button
                            type="button"
                            className="library-detail-executable-edit"
                            onClick={() => setExecutableModal({ mode: 'edit', index: i })}
                            title="Modifier"
                          >✏️</button>
                          <button
                            type="button"
                            className="library-detail-executable-remove"
                            onClick={() => {
                              const next = detailExecutablePaths.filter((_, j) => j !== i);
                              void saveExecutablePaths(next);
                            }}
                            title="Retirer"
                          >🗑️</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    className="library-detail-executable-add form-btn form-btn--secondary"
                    onClick={() => setExecutableModal({ mode: 'add' })}
                  >➕ Ajouter un exécutable</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="library-detail-footer">
          <div>
            {downloadCount !== null && (
              <p className="library-detail-downloads">Ce jeu a été téléchargé {downloadCount} fois.</p>
            )}
            <p className="library-detail-discord">
              💬 Une question ? Rejoignez-nous sur{' '}
              <span onClick={() => openLink('https://discord.gg/JuYSbQmxqF')} className="library-detail-discord-link">Discord</span>
            </p>
          </div>

          <div className="library-detail-footer-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* Bouton Ma collection — vue Bibliothèque uniquement */}
            {onAddToCollection && !isInCollection && (
              <button
                type="button"
                className="form-btn form-btn--secondary"
                onClick={() => onAddToCollection(game)}
                title="Ajouter à ma collection"
              >
                ➕ Ma collection
              </button>
            )}
            {onAddToCollection && isInCollection && (
              <span className="form-btn form-btn--ghost" style={{ cursor: 'default', opacity: 0.6 }} title="Ce jeu est déjà dans votre collection">
                📁 Dans la collection
              </span>
            )}

            {/* Bouton modifier — seulement en vue collection avec callback */}
            {isCollectionView && onOpenEdit && (
              <button
                type="button"
                className="form-btn form-btn--secondary"
                onClick={() => { onOpenEdit(); onClose(); }}
                title="Modifier les données de ce jeu"
              >
                ✏️ Modifier
              </button>
            )}

            {/* Resync depuis l'API publique F95FR */}
            {canSyncFromApi && (
              <button
                type="button"
                className="form-btn form-btn--secondary"
                onClick={handleSyncFromApi}
                disabled={syncingFromApi || enrichingSynopsis}
                title="Resynchroniser ce jeu depuis l'API publique F95FR (version, statut, traductions, synopsis…)"
              >
                {syncingFromApi ? '⏳ Resync…' : '🔄 Resync catalogue'}
              </button>
            )}

            {/* Bouton traduire le synopsis — disponible si API configurée */}
            {canEditSynopsis && (
              <button
                type="button"
                className="form-btn form-btn--secondary"
                onClick={handleEnrichSynopsis}
                disabled={enrichingSynopsis || editingSynopsis || syncingFromApi}
                title="Traduire le synopsis EN → FR pour ce jeu"
              >
                {enrichingSynopsis ? '⏳ Enrichissement…' : '🌐 Enrichir synopsis (API)'}
              </button>
            )}

            <button type="button" onClick={onClose} className="form-btn form-btn--ghost">↩️ Fermer</button>
          </div>
        </div>
      </div>

      {/* Lightbox image */}
      {lightboxOpen && game.image && (
        <div className="game-lightbox" onClick={() => setLightboxOpen(false)} role="dialog" aria-label="Image en plein écran">
          <button type="button" className="game-lightbox__close" onClick={() => setLightboxOpen(false)} title="Fermer">✕</button>
          <img src={game.image} alt={game.nom_du_jeu ?? 'Image du jeu'} className="game-lightbox__img" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Modale exécutable (ajout / édition) */}
      {executableModal && collectionEntry && onUpdateExecutablePaths && (
        <ExecutablePathModal
          gameTitle={game.nom_du_jeu ?? ''}
          mode={executableModal.mode}
          initial={executableModal.mode === 'edit' ? detailExecutablePaths[executableModal.index] : undefined}
          onClose={() => setExecutableModal(null)}
          onConfirm={async (entry) => {
            const next =
              executableModal.mode === 'add'
                ? [...detailExecutablePaths, entry]
                : detailExecutablePaths.map((e, j) => (j === executableModal.index ? entry : e));
            return saveExecutablePaths(next);
          }}
        />
      )}

      {/* Modale labels */}
      {showLabelsModal && collectionEntry && onUpdateLabels && (
        <CollectionLabelsModal
          entryId={collectionEntry.id}
          gameTitle={game.nom_du_jeu ?? ''}
          labels={detailLabels}
          allLabels={allLabels}
          onUpdate={async (id, labels) => {
            const res = await onUpdateLabels(id, labels);
            if (res.ok) setDetailLabels(labels);
            return res;
          }}
          onClose={() => setShowLabelsModal(false)}
          onLabelsUpdated={onLabelsUpdated}
        />
      )}
    </div>
  );
}

// ── Sous-composants ───────────────────────────────────────────────────────────

function InfoRow({
  label, value, showWhenEmpty, href, onLinkClick,
}: {
  label: string;
  value?: string;
  showWhenEmpty?: boolean;
  href?: string;
  onLinkClick?: () => void;
}) {
  const display = value && value !== 'N/A' ? value : (showWhenEmpty ? '—' : null);
  if (display === null) return null;
  return (
    <div className="library-detail-info-row">
      <span className="library-detail-info-label">{label}</span>
      <span className="library-detail-info-value" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {display}
        {href && (
          <button
            type="button"
            className="library-detail-inline-link-btn"
            onClick={onLinkClick ?? (() => tauriAPI.openUrl(href))}
            title={href}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
        )}
      </span>
    </div>
  );
}

function SynopsisBlock({
  synopsisFr, synopsisEn, setSynopsisFr, setSynopsisEn,
  editingSynopsis, setEditingSynopsis, savingSynopsis, setSavingSynopsis,
  f95JeuId, canEditSynopsis,
}: {
  synopsisFr: string; synopsisEn: string;
  setSynopsisFr: (v: string) => void; setSynopsisEn: (v: string) => void;
  editingSynopsis: boolean; setEditingSynopsis: (v: boolean) => void;
  savingSynopsis: boolean; setSavingSynopsis: (v: boolean) => void;
  f95JeuId: number; canEditSynopsis: boolean;
}) {
  const handleSaveSynopsis = async () => {
    const base = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
    const key = localStorage.getItem('apiKey') || '';
    if (!base || !key) { alert('API non configurée (URL et clé).'); return; }
    setSavingSynopsis(true);
    try {
      const headers = await createApiHeaders(key);
      const res = await fetch(`${base}/api/f95-jeux/${f95JeuId}/synopsis`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ synopsis_fr: synopsisFr, synopsis_en: synopsisEn }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) setEditingSynopsis(false);
      else alert(data?.error || `Erreur ${res.status}`);
    } catch (e) {
      alert((e as Error)?.message || 'Erreur réseau');
    } finally {
      setSavingSynopsis(false);
    }
  };

  return (
    <>
      <h3 className="library-detail-block-title library-detail-block-title--blue">📖 Synopsis</h3>
      {editingSynopsis ? (
        <div className="library-detail-synopsis-edit">
          <label className="library-detail-synopsis-label">Synopsis FR</label>
          <textarea className="app-input form-textarea styled-scrollbar" rows={4} value={synopsisFr} onChange={e => setSynopsisFr(e.target.value)} placeholder="Synopsis en français" />
          <label className="library-detail-synopsis-label">Synopsis EN</label>
          <textarea className="app-input form-textarea styled-scrollbar" rows={4} value={synopsisEn} onChange={e => setSynopsisEn(e.target.value)} placeholder="Synopsis in English" />
          <div className="library-detail-synopsis-actions">
            <button type="button" className="form-btn form-btn--secondary" onClick={() => setEditingSynopsis(false)} disabled={savingSynopsis}>Annuler</button>
            <button type="button" className="form-btn form-btn--primary" onClick={handleSaveSynopsis} disabled={savingSynopsis}>
              {savingSynopsis ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="library-detail-synopsis-text">
            {synopsisFr || synopsisEn || 'Aucun synopsis disponible pour le moment.'}
          </div>
          {canEditSynopsis && (
            <button type="button" className="form-btn form-btn--secondary" style={{ marginTop: 8 }} onClick={() => setEditingSynopsis(true)}>
              ✏️ Modifier le synopsis
            </button>
          )}
        </>
      )}
    </>
  );
}

function LinkButton({ href, label, icon, variant, onBeforeOpen }: {
  href: string; label: string; icon: string;
  variant: 'trad' | 'game' | 'traducteur';
  onBeforeOpen?: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      className={`library-detail-link-btn library-detail-link-btn--${variant}`}
      onClick={async () => {
        try { if (onBeforeOpen) await onBeforeOpen(); } finally { tauriAPI.openUrl(href); }
      }}
    >
      <span className={icon === '🇫🇷' ? 'library-detail-link-btn-emoji' : undefined}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}