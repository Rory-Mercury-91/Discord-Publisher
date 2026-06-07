import { computeNextChapter } from '../calendarTemplate';
import type { Tag } from '../types';
import { applyWorkImportImage } from './applyWorkImportImage';
import { normalizeWorkTagName } from './normalizeTagName';
import { WORK_TYPE_LABEL_KEYS, WORK_TYPE_META } from './registry';
import type { WorkTypeKey } from './types';

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
  /** Type d'œuvre (Nautiljon uniquement) : webtoon, manhua, manhwa, manga… */
  work_type?: string;
  /** Dernier chapitre publié (WEBTOON). */
  progress_current?: string;
  chapter_next_release?: string;
  date_next_release?: string;
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
  if (d.work_type?.trim()) return true;
  if (d.progress_current?.trim()) return true;
  return false;
}

type TagLike = Pick<Tag, 'id' | 'name' | 'tagType' | 'labelKey' | 'discordTagId'>;

export type WorkImportDeps = {
  setInput: (key: string, value: string) => void;
  addImageFromUrl: (url: string, options?: { previewUrl?: string }) => void;
  /** Sélectionne le tag type d'œuvre correspondant (import Nautiljon). */
  applyWorkTypeTag?: (workType: WorkTypeKey) => void;
};

function resolveWorkTypeKey(raw?: string): WorkTypeKey | null {
  const key = (raw || '').trim().toLowerCase();
  if (!key) return null;
  if (key in WORK_TYPE_META) return key as WorkTypeKey;
  if (WORK_TYPE_LABEL_KEYS[key]) return WORK_TYPE_LABEL_KEYS[key];
  return null;
}

/** Remplace le tag workType actif par celui correspondant à l'import. */
export function mergeWorkTypeTagId(
  workType: WorkTypeKey,
  selectedTagIds: string[],
  savedTags: TagLike[],
): string[] {
  const withoutType = selectedTagIds.filter(id => {
    const tag = savedTags.find(
      t => (t.id || t.name) === id || String(t.discordTagId ?? '') === id,
    );
    return tag?.tagType !== 'workType';
  });

  const targetLabel = WORK_TYPE_META[workType].label;
  const targetNorm = normalizeWorkTagName(targetLabel);

  const typeTag = savedTags.find(tag => {
    if (tag.tagType !== 'workType') return false;
    const labelKey = (tag.labelKey || '').trim().toLowerCase();
    if (WORK_TYPE_LABEL_KEYS[labelKey] === workType) return true;
    return normalizeWorkTagName(tag.name || '') === targetNorm;
  });

  if (!typeTag) return selectedTagIds;
  const tagId = typeTag.id || typeTag.name;
  return [...withoutType, tagId];
}

export function applyWorkImportFields(payload: WorkImportPayload, deps: WorkImportDeps): void {
  const { setInput } = deps;

  if (payload.name?.trim()) {
    setInput('Nom_Oeuvre', payload.name.trim());
  }

  // Genres / thèmes : Nautiljon uniquement (WEBTOON n'écrase pas).
  if (payload.domain === 'Nautiljon') {
    const genresRaw = payload.genres_themes?.trim()
      || (Array.isArray(payload.tags) ? payload.tags.join(' - ') : (payload.tags || '').trim());
    if (genresRaw) {
      setInput('Genres_Themes', genresRaw);
    }
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

  const currentChapter = payload.progress_current?.trim();
  if (currentChapter) {
    setInput('Progress_Current', currentChapter);
    setInput('Chapitre_Actuel', currentChapter);
    const nextChapter = payload.chapter_next_release?.trim() || computeNextChapter(currentChapter);
    if (nextChapter) setInput('Chapitre_Suivant', nextChapter);
  } else if (payload.chapter_next_release?.trim()) {
    setInput('Chapitre_Suivant', payload.chapter_next_release.trim());
  }

  if (payload.date_next_release?.trim()) {
    setInput('Date_Suivant', payload.date_next_release.trim());
  }

  if (payload.domain === 'Nautiljon' && deps.applyWorkTypeTag) {
    const workType = resolveWorkTypeKey(payload.work_type);
    if (workType) deps.applyWorkTypeTag(workType);
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
