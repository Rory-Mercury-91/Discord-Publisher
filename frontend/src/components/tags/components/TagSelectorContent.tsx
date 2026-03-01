import type { Tag } from '../../../state/types';
import { TAG_SELECTOR_GROUP_ORDER, TAG_SELECTOR_TYPE_LABELS } from '../constants';

interface TagSelectorContentProps {
  grouped: Record<string, Tag[]>;
  hasAnyTag: boolean;
  myTagsLength: number;
  onSelectTag: (tagId: string) => void;
}

export default function TagSelectorContent({
  grouped,
  hasAnyTag,
  myTagsLength,
  onSelectTag,
}: TagSelectorContentProps) {
  if (!hasAnyTag) {
    return (
      <div className="tag-selector__empty">
        {myTagsLength === 0
          ? 'Aucun tag secondaire configuré pour ce traducteur'
          : 'Tous les tags ont été ajoutés'}
      </div>
    );
  }

  return (
    <div className="tag-selector__content-inner">
      {TAG_SELECTOR_GROUP_ORDER.map((tagType) => {
        const tagsInType = grouped[tagType] ?? [];
        if (tagsInType.length === 0) return null;
        return (
          <div key={tagType} className="tag-selector__group">
            <h4 className="tag-selector__group-title">
              {TAG_SELECTOR_TYPE_LABELS[tagType]}
              <span className="tag-selector__group-count">({tagsInType.length})</span>
            </h4>
            <div className="tag-selector__group-list">
              {tagsInType.map((tag) => {
                const tagId = tag.id || tag.name;
                return (
                  <button
                    key={tagId}
                    type="button"
                    className="tag-selector__card"
                    onClick={() => onSelectTag(tagId)}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
