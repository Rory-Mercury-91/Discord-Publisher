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
    <div>
      <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
        Tags
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Bouton Ajouter */}
        <button
          ref={tagButtonRef}
          type="button"
          onClick={onOpenTagSelector}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--panel)',
            color: 'var(--text)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.2s',
          }}
        >
          ➕ Ajouter
        </button>

        {/* Badges des tags sélectionnés */}
        {selectedTagIds.map((tagId) => {
          const tag = savedTags.find(t =>
            (t.id || t.name) === tagId || String(t.discordTagId ?? '') === tagId
          );

          const isProtected = tag?.tagType === 'translator' || tag?.tagType === 'sites' || tag?.tagType === 'translationType';

          return (
            <div
              key={tagId}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px',
                borderRadius: 999,
                background: 'rgba(99, 102, 241, 0.14)',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                fontSize: 13,
                lineHeight: 1.2,
                fontWeight: 600,
              }}
            >
              <span style={{ color: 'var(--text)' }}>{tag?.name || tagId}</span>
              {!isProtected && (
                <button
                  type="button"
                  onClick={() => onRemoveTag(tagId)}
                  title="Retirer"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    padding: 0,
                    lineHeight: 1,
                    fontSize: 14,
                  }}
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
