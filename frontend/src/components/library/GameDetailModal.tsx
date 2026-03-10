import { useEffect, useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';
import { tauriAPI } from '../../lib/tauri-api';
import { getSupabase } from '../../lib/supabase';
import { trackTranslationClick, createApiHeaders } from '../../lib/api-helpers';
import type { GameF95 } from './library-types';
import type { CollectionLabel, ExecutablePathEntry } from '../../state/hooks/useCollection';
import { normalizeExecutablePaths } from '../../state/hooks/useCollection';
import { useTagAvoirs } from '../../state/hooks/useTagAvoirs';
import CollectionLabelsModal from './components/CollectionLabelsModal';

interface GameDetailModalProps {
  game: GameF95;
  onClose: () => void;
  onAddToCollection?: (game: GameF95) => void;
  isInCollection?: boolean;
  /** Contexte Ma collection : entrée pour afficher et gérer les labels et chemins exécutables */
  collectionEntry?: {
    id: string;
    labels?: CollectionLabel[] | null;
    executable_paths?: ExecutablePathEntry[] | string[] | null;
  };
  allLabels?: CollectionLabel[];
  onUpdateLabels?: (entryId: string, labels: CollectionLabel[]) => Promise<{ ok: boolean; error?: string }>;
  onUpdateExecutablePaths?: (entryId: string, paths: ExecutablePathEntry[]) => Promise<{ ok: boolean; error?: string }>;
  onLabelsUpdated?: () => void;
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
}: GameDetailModalProps) {
  const [showLabelsModal, setShowLabelsModal] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Ne pas fermer la modale détail avec Escape quand une sous-modale est ouverte
  useEscapeKey(onClose, !showLabelsModal && !lightboxOpen);
  useEscapeKey(() => setLightboxOpen(false), lightboxOpen);
  useModalScrollLock();
  const { getAvoir, setAvoir, cycleAvoir } = useTagAvoirs();
  const [tags, setTags] = useState<string[]>([]);
  const [detailLabels, setDetailLabels] = useState<CollectionLabel[]>(() => collectionEntry?.labels ?? []);
  const [detailExecutablePaths, setDetailExecutablePaths] = useState<ExecutablePathEntry[]>(
    () => normalizeExecutablePaths(collectionEntry?.executable_paths)
  );
  useEffect(() => {
    setDetailLabels(collectionEntry?.labels ?? []);
  }, [collectionEntry?.labels]);
  useEffect(() => {
    setDetailExecutablePaths(normalizeExecutablePaths(collectionEntry?.executable_paths));
  }, [collectionEntry?.executable_paths]);
  const [synopsisFr, setSynopsisFr] = useState<string>(() => game.synopsis_fr ?? '');
  const [synopsisEn, setSynopsisEn] = useState<string>(() => game.synopsis_en ?? '');
  const [editingSynopsis, setEditingSynopsis] = useState(false);
  const [savingSynopsis, setSavingSynopsis] = useState(false);
  const [downloadCount, setDownloadCount] = useState<number | null>(null);
  /** ID de la ligne f95_jeux pour l'édition (bibliothèque = game.id, collection = game.f95_jeux_id) */
  const f95JeuId = game.f95_jeux_id ?? game.id;
  const canEditSynopsis = typeof f95JeuId === 'number' && f95JeuId > 0;

  useEffect(() => {
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

    if (game.synopsis_en) setSynopsisEn(game.synopsis_en);
    if (game.synopsis_fr) setSynopsisFr(game.synopsis_fr);

    const loadSynopsis = async () => {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY
        );
        // Préférer site_id pour éviter de récupérer le synopsis d'une autre version/jeu (plusieurs lignes peuvent partager nom_url)
        if (game.site_id) {
          const { data, error } = await supabase
            .from('f95_jeux')
            .select('synopsis_fr, synopsis_en')
            .eq('site_id', game.site_id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!error && data) {
            if (data.synopsis_fr) setSynopsisFr(data.synopsis_fr);
            if (data.synopsis_en) setSynopsisEn(data.synopsis_en);
          }
        } else if (game.nom_url) {
          const { data, error } = await supabase
            .from('f95_jeux')
            .select('synopsis_fr, synopsis_en')
            .eq('nom_url', game.nom_url)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!error && data) {
            if (data.synopsis_fr) setSynopsisFr(data.synopsis_fr);
            if (data.synopsis_en) setSynopsisEn(data.synopsis_en);
          }
        }
      } catch (e) {
        console.warn('Erreur chargement synopsis:', e);
      }
    };
    loadSynopsis();
  }, [game]);

  useEffect(() => {
    if (!game.nom_url) {
      setDownloadCount(null);
      return;
    }
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
      } catch {
        if (!cancelled) setDownloadCount(null);
      }
    })();
    return () => { cancelled = true; };
  }, [game.nom_url]);

  const openLink = (url: string) => {
    if (!url) return;
    tauriAPI.openUrl(url);
  };

  const isCollectionView = !!collectionEntry;

  return (
    <div className="library-detail-backdrop">
      <div
        className={`library-detail-panel styled-scrollbar ${isCollectionView ? 'library-detail-panel--collection' : 'library-detail-panel--library'}`}
        onClick={e => e.stopPropagation()}
      >
        <div
          className={`library-detail-header${game.image ? ' library-detail-header--has-image' : ''}`}
          style={
            game.image
              ? { ['--library-detail-header-bg' as string]: `linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.7)), url(${game.image}) center/contain no-repeat` }
              : undefined
          }
          onClick={game.image ? () => setLightboxOpen(true) : undefined}
          title={game.image ? 'Cliquer pour voir l\'image en plein écran' : undefined}
        >
          <div>
            <h2 className="library-detail-title">{game.nom_du_jeu || 'Sans titre'}</h2>
            <div className="library-detail-versions">
              <span className="library-detail-version-badge">🎮 {game.version || 'v?'}</span>
              <span>→</span>
              <span className="library-detail-version-badge library-detail-version-badge--trad">🇫🇷 {game.trad_ver || 'N/A'}</span>
            </div>
          </div>
        </div>

        <div className={`library-detail-body library-detail-body--two-cols ${isCollectionView ? 'library-detail-body--collection' : 'library-detail-body--library'}`}>
          {/* Bibliothèque : 2+2 (gauche: Détails, Tags | droite: Synopsis, Liens) */}
          {/* Ma collection : 3+3 (gauche: Détails, Tags, Synopsis | droite: Liens, Labels, Chemins exécutables) */}
          <div className="library-detail-col library-detail-col--left">
            <div className="library-detail-block library-detail-block--details">
              <h3 className="library-detail-block-title library-detail-block-title--green">ℹ️ Détails</h3>
              <div className="library-detail-grid">
                <InfoRow label="Statut" value={game.statut} />
                <InfoRow label="Type de trad" value={game.type_de_traduction} />
                <InfoRow label="Traducteur" value={game.traducteur} showWhenEmpty />
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
                            onClick={async () => {
                              const next = cycleAvoir(tag);
                              await setAvoir(tag, next);
                            }}
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
                  synopsisFr={synopsisFr}
                  synopsisEn={synopsisEn}
                  setSynopsisFr={setSynopsisFr}
                  setSynopsisEn={setSynopsisEn}
                  editingSynopsis={editingSynopsis}
                  setEditingSynopsis={setEditingSynopsis}
                  savingSynopsis={savingSynopsis}
                  setSavingSynopsis={setSavingSynopsis}
                  f95JeuId={f95JeuId}
                  canEditSynopsis={canEditSynopsis}
                />
              </div>
            )}
          </div>

          <div className="library-detail-col library-detail-col--right">
            {!isCollectionView && (
              <div className="library-detail-block library-detail-block--synopsis">
                <SynopsisBlock
                  synopsisFr={synopsisFr}
                  synopsisEn={synopsisEn}
                  setSynopsisFr={setSynopsisFr}
                  setSynopsisEn={setSynopsisEn}
                  editingSynopsis={editingSynopsis}
                  setEditingSynopsis={setEditingSynopsis}
                  savingSynopsis={savingSynopsis}
                  setSavingSynopsis={setSavingSynopsis}
                  f95JeuId={f95JeuId}
                  canEditSynopsis={canEditSynopsis}
                />
              </div>
            )}

            <div className="library-detail-block library-detail-block--links">
              <h3 className="library-detail-block-title library-detail-block-title--yellow">🔗 Liens utiles</h3>
              <div className="library-detail-links-row">
                {game.lien_trad && (
                  <LinkButton
                    href={game.lien_trad}
                    label={game.trad_ver ? `Traduction — ${game.trad_ver}` : 'Lien de la traduction'}
                    icon="🇫🇷"
                    variant="trad"
                    onBeforeOpen={async () => {
                      if (game.nom_url) {
                        await trackTranslationClick({
                          f95Url: game.nom_url,
                          translationUrl: game.lien_trad,
                          source: 'detail_modal',
                        });
                        setDownloadCount(c => (c ?? 0) + 1);
                      }
                    }}
                  />
                )}
                {game.variants?.map((v, i) => v.lien_trad && (
                  <LinkButton
                    key={v.id ?? i}
                    href={v.lien_trad}
                    label={v.trad_ver ? `Traduction — ${v.trad_ver}` : 'Traduction'}
                    icon="🇫🇷"
                    variant="trad"
                    onBeforeOpen={async () => {
                      if (game.nom_url) {
                        await trackTranslationClick({
                          f95Url: game.nom_url,
                          translationUrl: v.lien_trad!,
                          source: 'detail_modal',
                        });
                        setDownloadCount(c => (c ?? 0) + 1);
                      }
                    }}
                  />
                ))}
                {game.nom_url && (
                  <LinkButton href={game.nom_url} label="Lien du jeu original" icon="🎮" variant="game" />
                )}
                {game.traducteur_url && (
                  <LinkButton href={game.traducteur_url} label="Page du traducteur" icon="👤" variant="traducteur" />
                )}
                {onAddToCollection && !isInCollection && (
                  <button
                    type="button"
                    className="library-detail-link-btn library-detail-link-btn--collection"
                    onClick={() => onAddToCollection(game)}
                    title="Ajouter à ma collection"
                  >
                    <span>➕</span>
                    <span>Ma collection</span>
                  </button>
                )}
                {onAddToCollection && isInCollection && (
                  <span className="library-detail-in-collection-info" title="Ce jeu est déjà dans votre collection">
                    📁 Déjà dans la collection
                  </span>
                )}
              </div>
            </div>

            {isCollectionView && collectionEntry && onUpdateLabels && (
              <div className="library-detail-block library-detail-block--labels">
                <h3 className="library-detail-block-title">🏷️ Labels personnalisés</h3>
                {detailLabels.length > 0 ? (
                  <div className="library-labels-list">
                    {detailLabels.map((l) => (
                      <span
                        key={l.label}
                        className="library-labels-badge"
                        style={{
                          background: `${l.color}22`,
                          borderColor: `${l.color}66`,
                          color: l.color,
                        }}
                      >
                        {l.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="library-labels-empty">Aucun label.</p>
                )}
                <button
                  type="button"
                  className="form-btn form-btn--secondary"
                  onClick={() => setShowLabelsModal(true)}
                  style={{ marginTop: 8 }}
                >
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
                        <li key={i} className="library-detail-executable-item">
                          <div className="library-detail-executable-item-body">
                            <p className="library-detail-executable-last-session">
                              Dernière session :{' '}
                              {entry.last_launch
                                ? new Date(entry.last_launch).toLocaleString('fr-FR', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  })
                                : 'Jamais'}
                            </p>
                            <span className="library-detail-executable-path" title={entry.path}>
                              {entry.path}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="library-detail-executable-launch"
                            onClick={async () => {
                              const res = await tauriAPI.openPath(entry.path);
                              if (!res.ok) {
                                alert(res.error ?? 'Impossible de lancer l’exécutable.');
                                return;
                              }
                              const next = detailExecutablePaths.map((e, j) =>
                                j === i ? { ...e, last_launch: new Date().toISOString() } : e
                              );
                              setDetailExecutablePaths(next);
                              await onUpdateExecutablePaths(collectionEntry.id, next);
                              // Pas de onLabelsUpdated() ici pour éviter un refresh qui fermerait la modale
                            }}
                            title="Lancer l’exécutable"
                          >
                            ▶️
                          </button>
                          <button
                            type="button"
                            className="library-detail-executable-remove"
                            onClick={async () => {
                              const next = detailExecutablePaths.filter((_, j) => j !== i);
                              setDetailExecutablePaths(next);
                              await onUpdateExecutablePaths(collectionEntry.id, next);
                              onLabelsUpdated?.();
                            }}
                            title="Retirer ce chemin"
                          >
                            🗑️
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    className="library-detail-executable-add form-btn form-btn--secondary"
                    onClick={async () => {
                      const win = window as unknown as {
                        __TAURI__?: { dialog?: { open: (opts: unknown) => Promise<string | string[] | null> } };
                        __TAURI_PLUGIN_DIALOG__?: { open: (opts: unknown) => Promise<string | string[] | null> };
                      };
                      const dialogOpen = win.__TAURI__?.dialog?.open ?? win.__TAURI_PLUGIN_DIALOG__?.open;
                      if (!dialogOpen) {
                        alert('Sélection de fichier non disponible (application Tauri).');
                        return;
                      }
                      try {
                        const selected = await dialogOpen({
                          title: 'Choisir un exécutable',
                          filters: [
                            { name: 'Exécutables', extensions: ['exe', 'bat', 'cmd'] },
                            { name: 'Tous', extensions: ['*'] },
                          ],
                          multiple: false,
                          directory: false,
                        });
                        if (selected && typeof selected === 'string') {
                          const next = [...detailExecutablePaths, { path: selected, last_launch: null }];
                          setDetailExecutablePaths(next);
                          const res = await onUpdateExecutablePaths(collectionEntry.id, next);
                          if (res.ok) onLabelsUpdated?.();
                          else alert(res.error ?? 'Erreur lors de l’ajout.');
                        }
                      } catch (e) {
                        console.warn('Dialog exécutable:', e);
                      }
                    }}
                  >
                    ➕ Ajouter un exécutable
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

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
          <button type="button" onClick={onClose} className="form-btn form-btn--ghost">↩️ Fermer</button>
        </div>
      </div>
      {lightboxOpen && game.image && (
        <div
          className="game-lightbox"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-label="Image en plein écran"
        >
          <button
            type="button"
            className="game-lightbox__close"
            onClick={() => setLightboxOpen(false)}
            title="Fermer"
          >
            ✕
          </button>
          <img
            src={game.image}
            alt={game.nom_du_jeu ?? 'Image du jeu'}
            className="game-lightbox__img"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
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

function InfoRow({ label, value, showWhenEmpty }: { label: string; value?: string; showWhenEmpty?: boolean }) {
  const display = value && value !== 'N/A' ? value : (showWhenEmpty ? '—' : null);
  if (display === null) return null;
  return (
    <div className="library-detail-info-row">
      <span className="library-detail-info-label">{label}</span>
      <span className="library-detail-info-value">{display}</span>
    </div>
  );
}

function SynopsisBlock({
  synopsisFr,
  synopsisEn,
  setSynopsisFr,
  setSynopsisEn,
  editingSynopsis,
  setEditingSynopsis,
  savingSynopsis,
  setSavingSynopsis,
  f95JeuId,
  canEditSynopsis,
}: {
  synopsisFr: string;
  synopsisEn: string;
  setSynopsisFr: (v: string) => void;
  setSynopsisEn: (v: string) => void;
  editingSynopsis: boolean;
  setEditingSynopsis: (v: boolean) => void;
  savingSynopsis: boolean;
  setSavingSynopsis: (v: boolean) => void;
  f95JeuId: number;
  canEditSynopsis: boolean;
}) {
  const handleSaveSynopsis = async () => {
    const base = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
    const key = localStorage.getItem('apiKey') || '';
    if (!base || !key) {
      alert('API non configurée (URL et clé).');
      return;
    }
    setSavingSynopsis(true);
    try {
      const headers = await createApiHeaders(key);
      const res = await fetch(`${base}/api/f95-jeux/${f95JeuId}/synopsis`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ synopsis_fr: synopsisFr, synopsis_en: synopsisEn }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setEditingSynopsis(false);
      } else {
        alert(data?.error || `Erreur ${res.status}`);
      }
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
          <textarea
            className="app-input form-textarea styled-scrollbar"
            rows={4}
            value={synopsisFr}
            onChange={e => setSynopsisFr(e.target.value)}
            placeholder="Synopsis en français"
          />
          <label className="library-detail-synopsis-label">Synopsis EN</label>
          <textarea
            className="app-input form-textarea styled-scrollbar"
            rows={4}
            value={synopsisEn}
            onChange={e => setSynopsisEn(e.target.value)}
            placeholder="Synopsis in English"
          />
          <div className="library-detail-synopsis-actions">
            <button
              type="button"
              className="form-btn form-btn--secondary"
              onClick={() => setEditingSynopsis(false)}
              disabled={savingSynopsis}
            >
              Annuler
            </button>
            <button
              type="button"
              className="form-btn form-btn--primary"
              onClick={handleSaveSynopsis}
              disabled={savingSynopsis}
            >
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
            <button
              type="button"
              className="form-btn form-btn--secondary"
              style={{ marginTop: 8 }}
              onClick={() => setEditingSynopsis(true)}
            >
              ✏️ Modifier le synopsis
            </button>
          )}
        </>
      )}
    </>
  );
}

function LinkButton({
  href,
  label,
  icon,
  variant,
  onBeforeOpen,
}: {
  href: string;
  label: string;
  icon: string;
  variant: 'trad' | 'game' | 'traducteur';
  onBeforeOpen?: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      className={`library-detail-link-btn library-detail-link-btn--${variant}`}
      onClick={async () => {
        try {
          if (onBeforeOpen) await onBeforeOpen();
        } finally {
          tauriAPI.openUrl(href);
        }
      }}
    >
      <span className={icon === '🇫🇷' ? 'library-detail-link-btn-emoji' : undefined}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
