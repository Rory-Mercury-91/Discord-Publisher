import { useState } from 'react';
import { tauriAPI } from '../../../lib/tauri-api';
import type { GameF95 } from '../library-types';
import type { CollectionLabel, ExecutablePathEntry } from '../../../state/hooks/useCollection';
import { SYNC_META, typeMajStyle, formatDateFr, getStatutData, getTypeMajData, getTradTypeData } from '../library-constants';
import VersionBadge from './VersionBadge';
import GameDetailModal from '../GameDetailModal';
import CollectionLabelsModal from './CollectionLabelsModal';

interface GameCardProps {
  game: GameF95;
  post: any;
  onEdit: (p: any) => void;
  showDateBadge: boolean;
  onAddToCollection?: (game: GameF95) => void;
  isInCollection?: boolean;
  /** Contexte Ma collection : entrée pour afficher et gérer les labels et chemins exécutables */
  collectionEntry?: { id: string; labels?: CollectionLabel[] | null; executable_paths?: ExecutablePathEntry[] | string[] | null };
  allLabels?: CollectionLabel[];
  onUpdateLabels?: (entryId: string, labels: CollectionLabel[]) => Promise<{ ok: boolean; error?: string }>;
  onUpdateExecutablePaths?: (entryId: string, paths: ExecutablePathEntry[]) => Promise<{ ok: boolean; error?: string }>;
  onLabelsUpdated?: () => void;
  /** Désactive le clic sur la carte (utilisé en mode suppression multiple) */
  clickDisabled?: boolean;
}

export default function GameCard({
  game,
  post,
  onEdit,
  showDateBadge,
  onAddToCollection,
  isInCollection,
  collectionEntry,
  allLabels = [],
  onUpdateLabels,
  onUpdateExecutablePaths,
  onLabelsUpdated,
  clickDisabled = false,
}: GameCardProps) {
  const sync = SYNC_META[game._sync!];
  const [imgErr, setImgErr] = useState(false);
  const tmStyle = typeMajStyle(game.type_maj);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showLabelsModal, setShowLabelsModal] = useState(false);
  const collectionLabels = collectionEntry?.labels ?? [];
  const hasCollectionLabels = !!collectionEntry && collectionLabels.length > 0;

  return (
    <>
      <div
        className={`library-card${clickDisabled ? '' : ' library-card--clickable'}`}
        data-sync={game._sync ?? undefined}
        role={clickDisabled ? undefined : 'button'}
        tabIndex={clickDisabled ? undefined : 0}
        onClick={clickDisabled ? undefined : () => setShowDetailModal(true)}
        onKeyDown={clickDisabled ? undefined : e => e.key === 'Enter' && setShowDetailModal(true)}
      >
        <div className="library-card-sync-bar" />
        <div className="library-card-image-wrap">
          {game.image && !imgErr ? (
            <img src={game.image} alt="" onError={() => setImgErr(true)} className="library-card-image" />
          ) : (
            <div className="library-card-image-placeholder">🎮</div>
          )}
          <div className="library-card-badge-sync">{sync.label}</div>
          <div className="library-card-badges">
            {post && <span className="library-card-badge library-card-badge--published">✓ Publié</span>}
            {(game.statut || '—') !== '—' && <span className="library-card-badge" data-statut={getStatutData(game.statut!)}>{game.statut}</span>}
          </div>
          {showDateBadge && game.type_maj && (
            <div className="library-card-badge-date" data-type-maj={getTypeMajData(game.type_maj)}>{tmStyle.icon} {game.type_maj}</div>
          )}
        </div>
        <div className="library-card-body">
          <div className="library-card-title">{game.nom_du_jeu}</div>
          <VersionBadge game={game.version} trad={game.trad_ver} sync={game._sync!} />
          {game.traducteur && <div className="library-version-text library-version-text--sm">👤 <span>{game.traducteur}</span></div>}
          {game.type_de_traduction && <div className="library-card-trad-type" data-trad-type={getTradTypeData(game.type_de_traduction)}>⚙ {game.type_de_traduction}</div>}
          {(game.date_maj || game.type) && (
            <div className="library-card-meta-row">
              {game.date_maj && <span className={`library-version-muted ${showDateBadge ? 'library-card-date--highlight' : 'library-card-date--muted'}`}>📅 {formatDateFr(game.date_maj)}</span>}
              {game.type && <span className="library-card-type-tag">{game.type}</span>}
            </div>
          )}
          {collectionEntry && (
            <div className="library-card-labels" onClick={e => e.stopPropagation()}>
              {hasCollectionLabels ? (
                <>
                    {collectionEntry?.labels && collectionEntry.labels.length > 0 && collectionEntry.labels.map(({ label, color }) => (
                    <span
                      key={label}
                      className="library-labels-badge"
                      style={{ background: `${color}22`, borderColor: `${color}66`, color }}
                      title={label}
                    >
                      {label}
                    </span>
                  ))}
                  {onUpdateLabels && (
                    <button
                      type="button"
                      className="library-card-label-btn"
                      onClick={e => { e.stopPropagation(); setShowLabelsModal(true); }}
                      title="Gérer les labels"
                    >
                      🏷️
                    </button>
                  )}
                </>
              ) : (
                onUpdateLabels && (
                  <button
                    type="button"
                    className="library-card-label-btn"
                    onClick={e => { e.stopPropagation(); setShowLabelsModal(true); }}
                    title="Ajouter des labels"
                  >
                    🏷️ Labels
                  </button>
                )
              )}
            </div>
          )}
        </div>
        <div className="library-card-footer" onClick={e => e.stopPropagation()}>
          {game.nom_url && (
            <button type="button" className="library-card-btn" onClick={() => tauriAPI.openUrl(game.nom_url)} title="Ouvrir le jeu">🔗 Jeu</button>
          )}
          {game.lien_trad && (
            <button type="button" className="library-card-btn library-card-btn--trad" onClick={() => tauriAPI.openUrl(game.lien_trad)} title="Ouvrir la traduction">
              <span className="library-card-emoji">🇫🇷</span> Trad.
            </button>
          )}
          {onAddToCollection && (
            <button
              type="button"
              className="library-card-btn library-card-btn--collection"
              onClick={e => { e.stopPropagation(); onAddToCollection(game); }}
              title={isInCollection ? 'Déjà dans ma collection' : 'Ajouter à ma collection'}
              disabled={!!isInCollection}
            >
              {isInCollection ? '📁 Collection' : '➕ Collection'}
            </button>
          )}
          {post && (
            <button type="button" className="library-card-btn library-card-btn--edit" onClick={() => onEdit(post)} title="Modifier le post">✏️</button>
          )}
        </div>
      </div>
      {showDetailModal && (
        <GameDetailModal
          game={game}
          onClose={() => setShowDetailModal(false)}
          onAddToCollection={onAddToCollection}
          isInCollection={isInCollection}
          collectionEntry={collectionEntry}
          allLabels={allLabels}
          onUpdateLabels={onUpdateLabels}
          onUpdateExecutablePaths={onUpdateExecutablePaths}
          onLabelsUpdated={onLabelsUpdated}
        />
      )}
      {showLabelsModal && collectionEntry && onUpdateLabels && (
        <CollectionLabelsModal
          entryId={collectionEntry.id}
          gameTitle={game.nom_du_jeu ?? ''}
          labels={collectionLabels}
          allLabels={allLabels}
          onUpdate={onUpdateLabels}
          onClose={() => setShowLabelsModal(false)}
          onLabelsUpdated={onLabelsUpdated}
        />
      )}
    </>
  );
}
