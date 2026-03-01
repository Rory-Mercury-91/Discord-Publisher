import { useMemo } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';
import { useApp } from '../../state/appContext';
import { useAuth } from '../../state/authContext';
import type { Tag } from '../../state/types';
import { removeLeadingEmojis, TAG_SELECTOR_GROUP_ORDER } from './constants';
import TagSelectorBanner from './components/TagSelectorBanner';
import TagSelectorContent from './components/TagSelectorContent';
import TagSelectorFooter from './components/TagSelectorFooter';
import TagSelectorHeader from './components/TagSelectorHeader';

export interface TagSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTag: (tagId: string) => void;
  selectedTagIds: string[];
  position?: { top: number; left: number; width: number };
  controlledTranslatorId?: string;
  controlledTranslatorKind?: 'profile' | 'external';
}

export default function TagSelectorModal({
  isOpen,
  onClose,
  onSelectTag,
  selectedTagIds,
  position,
  controlledTranslatorId,
  controlledTranslatorKind,
}: TagSelectorModalProps) {
  const { savedTags } = useApp();
  const { profile } = useAuth();

  useEscapeKey(() => isOpen && onClose(), isOpen);
  useModalScrollLock(isOpen);

  const isControlled = !!controlledTranslatorId;
  const activeTranslatorId = isControlled ? controlledTranslatorId! : (profile?.id ?? '');
  const activeTranslatorKind = isControlled ? (controlledTranslatorKind ?? 'profile') : 'profile';

  const myTags = useMemo(() => {
    if (!activeTranslatorId) return [];
    const personal = savedTags.filter((t) =>
      activeTranslatorKind === 'profile'
        ? t.profileId === activeTranslatorId
        : t.externalTranslatorId === activeTranslatorId
    );
    if (personal.length > 0) return personal;
    if (!isControlled && activeTranslatorId === profile?.id)
      return savedTags.filter((t) => t.tagType !== 'translator');
    return [];
  }, [savedTags, activeTranslatorId, activeTranslatorKind, profile?.id, isControlled]);

  const availableTags = useMemo(
    () =>
      myTags.filter((t) => {
        if (t.tagType === 'translator') return false;
        if (t.tagType === 'sites') return false;
        const tagId = t.id || t.name;
        const discordId = String(t.discordTagId ?? '');
        const alreadySelected =
          selectedTagIds.includes(tagId) || (discordId && selectedTagIds.includes(discordId));
        return !alreadySelected;
      }),
    [myTags, selectedTagIds]
  );

  const sortTags = (tags: Tag[]) =>
    [...tags].sort((a, b) =>
      removeLeadingEmojis(a.name).localeCompare(removeLeadingEmojis(b.name))
    );

  const grouped = useMemo(
    () => ({
      translationType: sortTags(availableTags.filter((t) => t.tagType === 'translationType')),
      gameStatus: sortTags(availableTags.filter((t) => t.tagType === 'gameStatus')),
      sites: sortTags(availableTags.filter((t) => t.tagType === 'sites')),
      other: sortTags(availableTags.filter((t) => t.tagType === 'other')),
    }),
    [availableTags]
  );

  const hasAnyTag = TAG_SELECTOR_GROUP_ORDER.some((k) => (grouped[k] ?? []).length > 0);

  const { requiredCount, optionalCount } = useMemo(() => {
    let required = 0;
    let optional = 0;
    for (const id of selectedTagIds) {
      const tag = savedTags.find(
        (t) =>
          (t.id || t.name) === id || String(t.discordTagId ?? '') === id
      );
      if (!tag) continue;
      if (tag.tagType === 'translator') continue;
      if (tag.tagType === 'sites' || tag.tagType === 'translationType' || tag.tagType === 'gameStatus') required++;
      else if (tag.tagType === 'other') optional++;
    }
    return { requiredCount: required, optionalCount: optional };
  }, [selectedTagIds, savedTags]);

  if (!isOpen) return null;

  const panelStyle: React.CSSProperties = position
    ? {
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: position.width,
        maxWidth: '90vw',
        maxHeight: '70vh',
        zIndex: 2000,
      }
    : {};

  return (
    <>
      <div className="tag-selector-backdrop" />
      <div
        className={`tag-selector-panel ${position ? 'tag-selector-panel--positioned' : ''}`}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <TagSelectorHeader />
        <TagSelectorBanner
          isControlled={isControlled}
          requiredCount={requiredCount}
          optionalCount={optionalCount}
        />
        <div className="tag-selector__content styled-scrollbar">
          <TagSelectorContent
            grouped={grouped}
            hasAnyTag={hasAnyTag}
            myTagsLength={myTags.length}
            onSelectTag={onSelectTag}
          />
        </div>
        <TagSelectorFooter onClose={onClose} />
      </div>
    </>
  );
}
