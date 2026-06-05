/** Convertit une URL couverture Nautiljon (pleine taille) en miniature /mini/ (affichable). */
export function toNautiljonMiniImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed || !trimmed.includes('nautiljon.com') || trimmed.includes('/mini/')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const fileName = segments.pop();
    if (!fileName || segments[segments.length - 1] === 'mini') {
      return trimmed;
    }
    segments.push('mini', fileName);
    parsed.pathname = `/${segments.join('/')}`;
    return parsed.toString();
  } catch {
    return trimmed.replace(
      /(\/images\/[^/]+\/\d+\/\d+\/)(?!mini\/)/,
      '$1mini/',
    );
  }
}

export function isNautiljonImageUrl(url: string): boolean {
  return url.includes('nautiljon.com');
}
