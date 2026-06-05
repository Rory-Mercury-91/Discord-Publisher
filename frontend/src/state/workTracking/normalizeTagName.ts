/** Retire émojis / shortcodes Discord pour comparer les libellés de tags. */
export function normalizeWorkTagName(name: string): string {
  const withoutEmoji = name
    .replace(/:[a-z0-9_]+:/gi, '')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Component}\uFE0F\u200D]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return withoutEmoji
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}
