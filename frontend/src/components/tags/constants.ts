import type { TagType } from '../../state/types';

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
