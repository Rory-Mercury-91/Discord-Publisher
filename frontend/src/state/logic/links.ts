import type { LinkConfig } from '../types';

/**
 * Nettoie les liens F95/Lewd : on ne garde que l'ID entre threads/ et le reste.
 * Accepte #post-XXXXX ou /post-XXXXX ; on conserve la forme fournie (on n'ajoute jamais de hash si absent).
 */
export function cleanGameLinkUrl(url: string): string {
  if (!url || !url.trim()) return url;
  const trimmed = url.trim().replace(/^<|>$/g, '');
  const f95Match = trimmed.match(/f95zone\.to\/threads\/([^\/#]+)(?:\/(post-\d+))?(?:\/)?(#post-\d+)?/);
  if (f95Match) {
    const segment = f95Match[1];
    const postPath = f95Match[2];
    const postHash = f95Match[3];
    const suffix = postHash || (postPath ? `/${postPath}` : '');
    const id = segment.includes('.') ? (segment.match(/\.(\d+)$/)?.[1] ?? segment) : segment;
    const base = `https://f95zone.to/threads/${id}/`;
    return base + (suffix.startsWith('/') ? suffix.slice(1) : suffix);
  }
  const lewdMatch = trimmed.match(/lewdcorner\.com\/threads\/([^\/#]+)(?:\/(post-\d+))?(?:\/)?(#post-\d+)?/);
  if (lewdMatch) {
    const segment = lewdMatch[1];
    const postPath = lewdMatch[2];
    const postHash = lewdMatch[3];
    const suffix = postHash || (postPath ? `/${postPath}` : '');
    const id = segment.includes('.') ? (segment.match(/\.(\d+)$/)?.[1] ?? segment) : segment;
    const base = `https://lewdcorner.com/threads/${id}/`;
    return base + (suffix.startsWith('/') ? suffix.slice(1) : suffix);
  }
  return trimmed;
}

/**
 * Construit l'URL finale à partir d'une LinkConfig (F95, Lewd ou Autre).
 */
export function buildFinalLink(config: LinkConfig): string {
  const v = config.value.trim();
  if (!v) return '';

  const isOtherFullUrl =
    v.toLowerCase().startsWith('http') &&
    !v.toLowerCase().includes('f95zone.to') &&
    !v.toLowerCase().includes('lewdcorner.com');
  if (isOtherFullUrl) return v;

  if (config.source === 'F95' && v.toLowerCase().includes('f95zone.to')) return cleanGameLinkUrl(v);
  if (config.source === 'Lewd' && v.toLowerCase().includes('lewdcorner.com')) return cleanGameLinkUrl(v);
  if (config.source === 'F95') return `https://f95zone.to/threads/${v}/`;
  if (config.source === 'Lewd') return `https://lewdcorner.com/threads/${v}/`;
  return v;
}
