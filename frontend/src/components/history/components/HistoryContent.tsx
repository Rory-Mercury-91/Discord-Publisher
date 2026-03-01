import type { PublishedPost } from '../../../state/appContext';
import HistoryPostCard from './HistoryPostCard';

interface HistoryContentProps {
  isLoading: boolean;
  error: string | null;
  paginatedPosts: PublishedPost[];
  filteredCount: number;
  totalPages: number;
  currentPage: number;
  searchQuery: string;
  activeTab: 'actifs' | 'archive';
  canEditPost: (post: PublishedPost) => boolean;
  onPagePrev: () => void;
  onPageNext: () => void;
  onArchiveChange: (post: PublishedPost, archived: boolean) => void;
  onEdit: (post: PublishedPost) => void;
  onDelete: (post: PublishedPost) => void;
}

export default function HistoryContent({
  isLoading,
  error,
  paginatedPosts,
  filteredCount,
  totalPages,
  currentPage,
  searchQuery,
  activeTab,
  canEditPost,
  onPagePrev,
  onPageNext,
  onArchiveChange,
  onEdit,
  onDelete,
}: HistoryContentProps) {
  return (
    <div className="history-content">
      {error && (
        <div className="history-content__error">
          ⚠️ {error}
        </div>
      )}

      {isLoading && (
        <div className="history-content__loading">
          ⏳ Chargement de l'historique...
        </div>
      )}

      {!isLoading && paginatedPosts.length === 0 && (
        <div className="history-content__empty">
          {searchQuery.trim()
            ? 'Aucune publication ne correspond à la recherche.'
            : activeTab === 'archive'
              ? "Aucune publication dans l'archive."
              : 'Aucune publication active.'}
        </div>
      )}

      {!isLoading && paginatedPosts.length > 0 && (
        <>
          {totalPages > 1 && (
            <div className="history-content__pagination">
              <span className="history-content__pagination-count">
                {filteredCount} résultat{filteredCount !== 1 ? 's' : ''}
              </span>
              <span className="history-content__pagination-controls">
                <button
                  type="button"
                  className="history-content__page-btn"
                  onClick={onPagePrev}
                  disabled={currentPage === 1}
                >
                  ← Préc.
                </button>
                <span className="history-content__page-info">
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="history-content__page-btn"
                  onClick={onPageNext}
                  disabled={currentPage === totalPages}
                >
                  Suiv. →
                </button>
              </span>
            </div>
          )}

          <div className="history-content__grid">
            {paginatedPosts.map((post) => (
              <HistoryPostCard
                key={post.id}
                post={post}
                canEdit={canEditPost(post)}
                onArchiveChange={(archived) => onArchiveChange(post, archived)}
                onEdit={() => onEdit(post)}
                onDelete={() => onDelete(post)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
