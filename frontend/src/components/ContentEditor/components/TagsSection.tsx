// frontend/src/components/ContentEditorComponents/TagsSection.tsx
import { useRef } from 'react';

interface TagsSectionProps {
  selectedTagIds: string[];
  savedTags: any[];
  onOpenTagSelector: () => void;
  onRemoveTag: (tagId: string) => void;
}

export default function TagsSection({
  selectedTagIds,
  savedTags,
  onOpenTagSelector,
  onRemoveTag,
}: TagsSectionProps) {
  const tagButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="form-field">
      <label className="form-label">Tags</label>
      <div className="tags-list">
        <button
          ref={tagButtonRef}
          type="button"
          onClick={onOpenTagSelector}
          className="form-btn form-btn--sm"
        >
          ➕ Ajouter
        </button>

        {selectedTagIds.map((tagId) => {
          const tag = savedTags.find(t =>
            (t.id || t.name) === tagId || String(t.discordTagId ?? '') === tagId
          );
          const isProtected = tag?.tagType === 'translator' || tag?.tagType === 'sites' || tag?.tagType === 'translationType';

          return (
            <div key={tagId} className="tag-badge">
              <span>{tag?.name || tagId}</span>
              {!isProtected && (
                <button
                  type="button"
                  onClick={() => onRemoveTag(tagId)}
                  title="Retirer"
                  className="tag-badge__remove"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
