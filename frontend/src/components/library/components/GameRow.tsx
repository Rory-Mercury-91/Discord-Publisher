import { tauriAPI } from '../../../lib/tauri-api';
import { trackTranslationClick } from '../../../lib/api-helpers';
import type { GameF95 } from '../library-types';
import { SYNC_META, typeMajStyle, formatDateFr, getStatutData, getTradTypeData, getTypeMajData } from '../library-constants';

interface GameRowProps {
  game: GameF95;
  post: any;
  onEdit: (p: any) => void;
  /** En contexte Ma collection (post null) : ouvre la modale d'édition de l'entrée */
  onEditEntry?: () => void;
  onOpenDetail?: () => void;
  onAddToCollection?: (game: GameF95) => void;
  isInCollection?: boolean;
  deleteMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  collectionEntry?: { id: string; labels?: import('../../../state/hooks/useCollection').CollectionLabel[] | null };
}

export default function GameRow({ game, post, onEdit, onEditEntry, onOpenDetail, onAddToCollection, isInCollection, deleteMode, selected, onToggleSelect, collectionEntry }: GameRowProps) {
  const sync = SYNC_META[game._sync!];
  const tmStyle = typeMajStyle(game.type_maj);

  return (
    <tr
      className={`library-table-row${onOpenDetail ? ' library-table-row--clickable' : ''}${deleteMode ? ' library-table-row--delete-mode' : ''}${selected ? ' library-table-row--selected' : ''}`}
      role={deleteMode ? 'checkbox' : onOpenDetail ? 'button' : undefined}
      aria-checked={deleteMode ? selected : undefined}
      tabIndex={deleteMode || onOpenDetail ? 0 : undefined}
      onClick={deleteMode ? onToggleSelect : onOpenDetail ?? undefined}
      onKeyDown={
        deleteMode
          ? (e) => e.key === 'Enter' && onToggleSelect?.()
          : onOpenDetail
          ? (e) => e.key === 'Enter' && onOpenDetail()
          : undefined
      }
    >
      {deleteMode && (
        <td className="library-table-td library-table-td--checkbox" onClick={(e) => e.stopPropagation()}>
          <div
            className={`collection-row-checkbox${selected ? ' collection-row-checkbox--selected' : ''}`}
            onClick={onToggleSelect}
            role="checkbox"
            aria-checked={selected}
          >
            {selected && '✔'}
          </div>
        </td>
      )}
      <td className="library-table-td library-table-td--title">
        <div className="library-table-cell-title library-table-cell-title--with-type">{game.nom_du_jeu}</div>
        {game.type && <div className="library-version-muted">{game.type}</div>}
        {collectionEntry?.labels && collectionEntry.labels.length > 0 && (
          <div className="library-table-labels">
            {collectionEntry.labels.map(({ label, color }) => (
              <span
                key={label}
                className="library-labels-badge"
                style={{ background: `${color}22`, borderColor: `${color}66`, color }}
                title={label}
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="library-table-td library-table-td--version"><code>{game.version || '—'}</code></td>
      <td className={`library-table-td library-table-td--trad-${game._sync ?? 'unknown'}`}><code>{game.trad_ver || '—'}</code></td>
      <td className="library-table-td library-table-td--center">
        <span className="library-table-badge" data-sync={game._sync ?? undefined}>{sync.label}</span>
      </td>
      <td className="library-table-td library-table-td--center">
        <span className="library-table-badge" data-statut={getStatutData(game.statut || '')}>{game.statut || '—'}</span>
      </td>
      <td className={`library-table-td library-table-td--trad-type-${getTradTypeData(game.type_de_traduction || '')}`}>{game.type_de_traduction || '—'}</td>
      <td className="library-table-td library-table-td--traducteur">{game.traducteur || '—'}</td>
      <td className="library-table-td library-table-td--date library-version-muted">{formatDateFr(game.date_maj) || '—'}</td>
      <td className="library-table-td library-table-td--center">
        {game.type_maj ? (
          <span className="library-table-badge" data-type-maj={getTypeMajData(game.type_maj)}>{tmStyle.icon} {game.type_maj}</span>
        ) : '—'}
      </td>
      <td className="library-table-td library-table-td--center" onClick={(e) => e.stopPropagation()}>
        <div className="library-row-actions">
          {game.nom_url && (
            <button type="button" className="library-row-btn" onClick={() => tauriAPI.openUrl(game.nom_url)} title="Ouvrir la page du jeu">🔗</button>
          )}
          {game.lien_trad && (
            <button
              type="button"
              className="library-row-btn library-row-btn--trad library-row-btn-emoji"
              onClick={async () => {
                if (game.nom_url) {
                  await trackTranslationClick({ f95Url: game.nom_url, translationUrl: game.lien_trad, source: 'library_list' });
                }
                tauriAPI.openUrl(game.lien_trad);
              }}
              title="Ouvrir la page de traduction"
            >
              🇫🇷
            </button>
          )}
          {onAddToCollection && (
            <button
              type="button"
              className="library-row-btn library-row-btn--collection"
              onClick={e => { e.stopPropagation(); onAddToCollection(game); }}
              title={isInCollection ? 'Déjà dans ma collection' : 'Ajouter à ma collection'}
              disabled={!!isInCollection}
            >
              {isInCollection ? '📁' : '➕'}
            </button>
          )}
          {post ? (
            <button type="button" className="library-row-btn library-row-btn--edit" onClick={(e) => { e.stopPropagation(); onEdit(post); }} title="Modifier le post Discord">✏️</button>
          ) : onEditEntry ? (
            <button type="button" className="library-row-btn library-row-btn--edit" onClick={(e) => { e.stopPropagation(); onEditEntry(); }} title="Modifier les données de ce jeu">✏️</button>
          ) : (
            <span title="Aucun post Discord publié pour ce jeu" className="library-row-btn library-row-btn--empty">—</span>
          )}
        </div>
      </td>
    </tr>
  );
}
