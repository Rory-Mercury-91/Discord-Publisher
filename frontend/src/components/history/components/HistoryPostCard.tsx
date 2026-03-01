import type { PublishedPost } from '../../../state/appContext';
import Toggle from '../../shared/Toggle';
import { formatHistoryDate } from '../constants';

interface HistoryPostCardProps {
  post: PublishedPost;
  canEdit: boolean;
  onArchiveChange: (archived: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function HistoryPostCard({
  post,
  canEdit,
  onArchiveChange,
  onEdit,
  onDelete,
}: HistoryPostCardProps) {
  const created = formatHistoryDate(post.createdAt ?? post.timestamp);
  const updated = formatHistoryDate(post.updatedAt ?? post.timestamp);
  const tooltip = `Créé le ${created}\nModifié le ${updated}`;

  return (
    <div className="history-card">
      <div
        className="history-card__title"
        title={tooltip}
      >
        {post.title || 'Sans titre'}
      </div>
      <Toggle
        checked={!!post.archived}
        onChange={onArchiveChange}
        label="Archivé"
        size="sm"
        title={post.archived ? "Retirer de l'archive" : "Mettre dans l'archive"}
      />
      {canEdit && (
        <>
          <button
            type="button"
            className="history-card__btn history-card__btn--edit"
            onClick={onEdit}
            title="Modifier"
          >
            ✏️
          </button>
          <button
            type="button"
            className="history-card__btn history-card__btn--delete"
            onClick={onDelete}
            title="Supprimer définitivement (historique, base et Discord)"
          >
            🗑️
          </button>
        </>
      )}
    </div>
  );
}
