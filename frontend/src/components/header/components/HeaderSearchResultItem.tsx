import type { PublishedPost } from '../../../state/appContext';

interface HeaderSearchResultItemProps {
  post: PublishedPost;
  translatorsLabel: string;
  dateLabel: string;
  canEdit: boolean;
  onSelect: () => void;
}

export default function HeaderSearchResultItem({
  post,
  translatorsLabel,
  dateLabel,
  canEdit,
  onSelect,
}: HeaderSearchResultItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => e.key === 'Enter' && onSelect()}
      className={
        canEdit
          ? 'app-header-search-result'
          : 'app-header-search-result app-header-search-result--disabled'
      }
    >
      <div className="app-header-search-result__thumb">
        {post.imagePath ? (
          <img src={post.imagePath} alt="" />
        ) : (
          <div className="app-header-search-result__thumb-placeholder">🎮</div>
        )}
      </div>
      <div className="app-header-search-result__body">
        <div className="app-header-search-result__title">{post.title || 'Sans titre'}</div>
        <div className="app-header-search-result__meta">👤 {translatorsLabel}</div>
        <div className="app-header-search-result__date">📅 {dateLabel}</div>
      </div>
      <div className="app-header-search-result__action">
        {canEdit ? (
          <span className="app-header-search-result__action-edit">✏️</span>
        ) : (
          <span className="app-header-search-result__lock" title="Vous n'êtes pas l'auteur">
            🔒
          </span>
        )}
      </div>
    </div>
  );
}
