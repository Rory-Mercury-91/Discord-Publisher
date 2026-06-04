import { useMemo } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';
import { useApp } from '../../state/appContext';
import { useUserPreferences } from '../../state/hooks/useUserPreferences';
import { useForumChannelTags } from '../../state/hooks/useForumChannelTags';
import type { Tag } from '../../state/types';
import {
  countWebtoonActiveTags,
  isAutoInjectedTagType,
  removeLeadingEmojis,
  TAG_SELECTOR_PANEL_WIDTH,
  WEBTOON_TAGS_MAX,
  WEBTOON_WORK_STATUS_LABEL,
} from '../tags/constants';
import TagSelectorBanner from '../tags/components/TagSelectorBanner';
import TagSelectorContent from '../tags/components/TagSelectorContent';
import TagSelectorFooter from '../tags/components/TagSelectorFooter';
import TagSelectorHeader from '../tags/components/TagSelectorHeader';

interface TagSelectorModalWebtoonProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTag: (tagId: string) => void;
  selectedTagIds: string[];
  position?: { top: number; left: number; width: number };
}

/** Sélecteur de tags limité au salon Webtoon configuré dans les préférences. */
export default function TagSelectorModalWebtoon({
  isOpen,
  onClose,
  onSelectTag,
  selectedTagIds,
  position,
}: TagSelectorModalWebtoonProps) {
  const { savedTags } = useApp();
  const { calendarForumChannelId, loading: prefsLoading } = useUserPreferences();
  const { forumTags, loading: tagsLoading, hasForumChannel, hasTranslatorForForum } =
    useForumChannelTags(calendarForumChannelId);

  const webtoonActiveCount = useMemo(
    () => countWebtoonActiveTags(selectedTagIds, savedTags),
    [selectedTagIds, savedTags]
  );

  useEscapeKey(() => isOpen && onClose(), isOpen);
  useModalScrollLock(isOpen);

  const sortTags = (tags: Tag[]) =>
    [...tags].sort((a, b) =>
      removeLeadingEmojis(a.name).localeCompare(removeLeadingEmojis(b.name))
    );

  const availableTags = useMemo(
    () =>
      sortTags(
        forumTags.filter(t => {
          if (isAutoInjectedTagType(t.tagType)) return false;
          const tagId = t.id || t.name;
          const discordId = String(t.discordTagId ?? '');
          const alreadySelected =
            selectedTagIds.includes(tagId) || (discordId && selectedTagIds.includes(discordId));
          return !alreadySelected;
        })
      ),
    [forumTags, selectedTagIds]
  );

  const atTagLimit = webtoonActiveCount >= WEBTOON_TAGS_MAX;

  if (!isOpen) return null;

  const panelStyle = position
    ? {
        position: 'fixed' as const,
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: Math.max(position.width, TAG_SELECTOR_PANEL_WIDTH),
        minWidth: TAG_SELECTOR_PANEL_WIDTH,
        maxWidth: '90vw',
        maxHeight: '70vh',
        zIndex: 2000,
      }
    : undefined;

  const emptyMessage = prefsLoading
    ? 'Chargement de la configuration du salon…'
    : !hasForumChannel
      ? 'Aucun salon configuré : définissez le salon Webtoon dans Configuration → Préférences (admin), puis rouvrez ce sélecteur.'
      : !hasTranslatorForForum
        ? 'Aucun traducteur n’est lié à ce salon dans l’onglet Tags (section Routage).'
        : tagsLoading
          ? 'Chargement des tags du salon…'
          : availableTags.length === 0
            ? atTagLimit
              ? `Limite de ${WEBTOON_TAGS_MAX} tags atteinte.`
              : 'Tous les tags de ce salon sont déjà sélectionnés, ou aucun tag n’est configuré pour ce salon.'
            : null;

  return (
    <>
      <div className="tag-selector-backdrop" onClick={onClose} />
      <div
        className={`tag-selector-panel ${position ? 'tag-selector-panel--positioned' : ''}`}
        style={panelStyle}
        onClick={e => e.stopPropagation()}
      >
        <TagSelectorHeader />
        <TagSelectorBanner
          webtoonMode
          isControlled={false}
          requiredCount={0}
          optionalCount={0}
          webtoonActiveCount={webtoonActiveCount}
          webtoonMax={WEBTOON_TAGS_MAX}
        />
        <div className="tag-selector__content styled-scrollbar">
          {emptyMessage ? (
            <div className="tag-selector__empty">{emptyMessage}</div>
          ) : (
            <TagSelectorContent
              grouped={{}}
              hasAnyTag={availableTags.length > 0}
              myTagsLength={forumTags.length}
              onSelectTag={onSelectTag}
              flatGroupLabel={WEBTOON_WORK_STATUS_LABEL}
              flatTags={availableTags}
            />
          )}
        </div>
        <TagSelectorFooter onClose={onClose} />
      </div>
    </>
  );
}
