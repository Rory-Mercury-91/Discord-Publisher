import type { Tag, TagType } from '../../state/types';

/** Tags injectés automatiquement en vue traduction (absents en vue Webtoon). */
export const AUTO_INJECTED_TAG_TYPES: TagType[] = ['translator', 'translationType', 'sites'];

export function isAutoInjectedTagType(tagType: TagType | undefined): boolean {
  return !!tagType && AUTO_INJECTED_TAG_TYPES.includes(tagType);
}

export function filterWebtoonSelectableTagIds(tagIds: string[], savedTags: Tag[]): string[] {
  return tagIds.filter(id => {
    const tag = savedTags.find(
      t => (t.id || t.name) === id || String(t.discordTagId ?? '') === id
    );
    return tag && !isAutoInjectedTagType(tag.tagType);
  });
}

/** Limite Discord / métier pour les posts calendrier Webtoon. */
export const WEBTOON_TAGS_MAX = 5;

export const WEBTOON_WORK_STATUS_LABEL = '📖 Statut de l\'œuvre';

export function countWebtoonActiveTags(selectedTagIds: string[], savedTags: Tag[]): number {
  return filterWebtoonSelectableTagIds(selectedTagIds, savedTags).length;
}

/** Largeur du panneau de sélection de tags (alignée sur .tag-selector-panel). */
export const TAG_SELECTOR_PANEL_WIDTH = 500;

export type TagSelectorPanelPosition = { top: number; left: number; width: number };

/** Position sous un bouton ancre, largeur fixe et repli si débordement viewport. */
export function computeTagSelectorPositionBelowAnchor(anchorRect: DOMRect): TagSelectorPanelPosition {
  const width = TAG_SELECTOR_PANEL_WIDTH;
  let left = anchorRect.left;
  if (left + width > window.innerWidth - 16) {
    left = Math.max(16, window.innerWidth - width - 16);
  }
  return { top: anchorRect.bottom + 8, left, width };
}

/** Même emplacement que la vue traduction : colonne aperçu Discord ([data-preview-container]). */
export function computeTagSelectorPositionFromPreview(): TagSelectorPanelPosition {
  const previewElement = document.querySelector('[data-preview-container]') as HTMLElement | null;
  if (previewElement) {
    const rect = previewElement.getBoundingClientRect();
    return {
      top: rect.top - 10,
      left: rect.left + 16,
      width: Math.min(rect.width - 32, TAG_SELECTOR_PANEL_WIDTH),
    };
  }
  return {
    top: 120,
    left: window.innerWidth * 0.65 + 16,
    width: TAG_SELECTOR_PANEL_WIDTH,
  };
}

export const TAG_SELECTOR_GROUP_ORDER: Exclude<TagType, 'translator'>[] = [
  'translationType',
  'sites',
  'gameStatus',
  'other',
];

export const TAG_SELECTOR_TYPE_LABELS: Record<Exclude<TagType, 'translator'>, string> = {
  translationType: '📋 Type de traduction',
  gameStatus: '🎮 Statut du jeu',
  sites: '🌐 Sites',
  other: '📦 Autres',
};

export function removeLeadingEmojis(text: string): string {
  return text
    .replace(
      /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\s]+/gu,
      ''
    )
    .trim();
}
