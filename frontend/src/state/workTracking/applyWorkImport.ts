import { applyWorkImportImage } from './applyWorkImportImage';

/** Données importables depuis Nautiljon, WEBTOON, etc. (Tampermonkey ou presse-papiers). */
export interface WorkImportPayload {
  domain?: string;
  kind?: string;
  name?: string;
  genres_themes?: string;
  tags?: string | string[];
  image?: string;
  /** Data URL base64 (Tampermonkey) — contourne l'anti-hotlink Nautiljon. */
  image_data?: string;
  synopsis?: string;
  link?: string;
  official_site_label?: string;
}

const OFFICIAL_PLATFORM_DOMAINS = new Set(['WEBTOON', 'Webtoon', 'Tapas', 'Kakao']);

export function isOfficialPlatformDomain(domain?: string): boolean {
  if (!domain) return false;
  return OFFICIAL_PLATFORM_DOMAINS.has(domain);
}

export function isWorkImportPayload(data: unknown): data is WorkImportPayload {
  if (!data || typeof data !== 'object') return false;
  const d = data as WorkImportPayload;
  if (d.kind === 'work_tracking') return true;
  if (d.domain === 'Nautiljon' || d.domain === 'WEBTOON') return true;
  if (typeof d.genres_themes === 'string' && !!d.genres_themes.trim()) return true;
  if (isOfficialPlatformDomain(d.domain) && !!(d.link?.trim() || d.name?.trim())) return true;
  return false;
}

export type WorkImportDeps = {
  setInput: (key: string, value: string) => void;
  addImageFromUrl: (url: string, options?: { previewUrl?: string }) => void;
};

export function applyWorkImportFields(payload: WorkImportPayload, deps: WorkImportDeps): void {
  const { setInput } = deps;

  if (payload.name?.trim()) {
    setInput('Nom_Oeuvre', payload.name.trim());
  }

  const genresRaw = payload.genres_themes?.trim()
    || (Array.isArray(payload.tags) ? payload.tags.join(' - ') : (payload.tags || '').trim());
  if (genresRaw) {
    setInput('Genres_Themes', genresRaw);
  }

  if (payload.synopsis?.trim()) {
    setInput('Synopsis_Oeuvre', payload.synopsis.trim());
  }

  const officialLink = payload.link?.trim();
  if (officialLink && isOfficialPlatformDomain(payload.domain)) {
    const label = payload.official_site_label?.trim() || payload.domain || 'WEBTOON';
    setInput('Official_Site_Label', label);
    setInput('Official_Site_Link', officialLink);
  }
}

export async function applyWorkImportAsync(
  payload: WorkImportPayload,
  deps: WorkImportDeps,
): Promise<{ imageOk: boolean }> {
  applyWorkImportFields(payload, deps);
  const imageOk = await applyWorkImportImage(payload, deps);
  return { imageOk };
}
