/**
 * Modale de gestion des avis sur les tags (J'aime / J'aime pas / Neutre).
 * Tous les tags dans un même conteneur ; un clic change l'avis sur place (vert / rouge / neutre).
 */
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../../hooks/useModalScrollLock';
import type { TagAvoir } from '../../../state/hooks/useTagAvoirs';

interface TagAvoirsModalProps {
  allTags: string[];
  getAvoir: (tag: string) => TagAvoir;
  onSetAvoir: (tag: string, avis: TagAvoir) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}

const AVOIR_LABELS: Record<TagAvoir, string> = {
  like: 'J\'aime',
  dislike: 'J\'aime pas',
  neutral: 'Neutre',
};

export default function TagAvoirsModal({
  allTags,
  getAvoir,
  onSetAvoir,
  onClose,
}: TagAvoirsModalProps) {
  useEscapeKey(onClose, true);
  useModalScrollLock();

  const handleTagClick = async (tag: string) => {
    const current = getAvoir(tag);
    const next: TagAvoir = current === 'like' ? 'dislike' : current === 'dislike' ? 'neutral' : 'like';
    await onSetAvoir(tag, next);
  };

  return (
    <div className="library-detail-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="tag-avoirs-modal-title">
      <div
        className="tag-avoirs-modal tag-avoirs-modal-panel styled-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tag-avoirs-modal-header">
          <h2 id="tag-avoirs-modal-title" className="tag-avoirs-modal-title">
            Avis sur les tags
          </h2>
          <p className="tag-avoirs-modal-desc">
            Ces préférences s&apos;affichent sur les fiches détail des jeux (vert = J&apos;aime, rouge = J&apos;aime pas). Un clic sur un tag change l&apos;avis, le tag reste à sa place.
          </p>
        </header>

        <div className="tag-avoirs-modal-body">
          {allTags.length === 0 ? (
            <p className="tag-avoirs-modal-empty">Aucun tag dans votre collection.</p>
          ) : (
            <div className="tag-avoirs-modal-list">
              {allTags.map((tag) => {
                const avis = getAvoir(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`tag-avoir-badge tag-avoir-badge--${avis}`}
                    onClick={() => handleTagClick(tag)}
                    title={`${tag} — ${AVOIR_LABELS[avis]} (clic pour changer)`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <footer className="tag-avoirs-modal-footer">
          <button type="button" onClick={onClose} className="form-btn form-btn--ghost">
            ↩️ Fermer
          </button>
        </footer>
      </div>
    </div>
  );
}
