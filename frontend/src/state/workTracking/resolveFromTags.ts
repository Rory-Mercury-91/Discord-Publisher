import type { Tag } from '../types';
import { normalizeWorkTagName } from './normalizeTagName';
import {
  PAID_MODIFIER_LABEL_KEYS,
  WORK_STATUS_LABEL_KEYS,
  WORK_STATUS_META,
  WORK_STATUS_ORDER,
  WORK_TYPE_LABEL_KEYS,
  WORK_TYPE_META,
} from './registry';
import type { ResolvedWorkTracking, WorkStatus, WorkTypeKey } from './types';

type TagLike = Pick<Tag, 'id' | 'name' | 'tagType' | 'labelKey' | 'discordTagId'>;

function findTagByPostId(id: string, savedTags: TagLike[]): TagLike | undefined {
  return savedTags.find(
    t => (t.id || t.name) === id || String(t.discordTagId ?? '') === id
  );
}

function matchStatusFromNormalizedName(normalized: string): WorkStatus | null {
  if (normalized === 'termine' || normalized.endsWith(' termine') || normalized === 'completed') {
    return 'completed';
  }
  if (
    normalized === 'abandonnee' ||
    normalized.endsWith(' abandonnee') ||
    normalized === 'abandonne' ||
    normalized.endsWith(' abandonne') ||
    normalized === 'abandoned'
  ) {
    return 'abandoned';
  }
  if (
    normalized.includes('pause') ||
    normalized.includes('fin de saison') ||
    normalized.includes('season pause')
  ) {
    return 'season_pause';
  }
  if (
    normalized.includes('en cours') ||
    normalized === 'ongoing' ||
    normalized.includes('diffusion gratuite') ||
    normalized.includes('gratuit')
  ) {
    return 'ongoing';
  }
  return null;
}

function matchTypeFromNormalizedName(normalized: string): WorkTypeKey | null {
  for (const [key, meta] of Object.entries(WORK_TYPE_META) as [WorkTypeKey, { label: string }][]) {
    const labelNorm = normalizeWorkTagName(meta.label);
    if (normalized === labelNorm || normalized.endsWith(` ${labelNorm}`)) return key;
  }
  if (normalized.includes('webcomic') || normalized.includes('web comic') || normalized.includes('webtoon')) {
    return 'webtoon';
  }
  if (normalized.includes('manhwa')) return 'manhwa';
  if (normalized.includes('manhua')) return 'manhua';
  if (normalized.includes('manga') && !normalized.includes('manhwa') && !normalized.includes('manhua')) return 'manga';
  if (normalized.includes('light novel') || normalized.includes('light_novel') || normalized.includes('lightnovel')) {
    return 'light_novel';
  }
  if (normalized.includes('roman') || normalized === 'novel') return 'novel';
  return null;
}

function resolveStatusFromTag(tag: TagLike): WorkStatus | null {
  const key = (tag.labelKey || '').trim().toLowerCase();
  if (key && WORK_STATUS_LABEL_KEYS[key]) return WORK_STATUS_LABEL_KEYS[key];
  const tagType = (tag.tagType || '').toLowerCase();
  if (tagType === 'workstatus' && key) return WORK_STATUS_LABEL_KEYS[key] ?? null;
  return matchStatusFromNormalizedName(normalizeWorkTagName(tag.name || ''));
}

function resolveTypeFromTag(tag: TagLike): WorkTypeKey | null {
  const key = (tag.labelKey || '').trim().toLowerCase();
  if (key && WORK_TYPE_LABEL_KEYS[key]) return WORK_TYPE_LABEL_KEYS[key];
  const tagType = (tag.tagType || '').toLowerCase();
  if (tagType === 'worktype' && key) return WORK_TYPE_LABEL_KEYS[key] ?? null;
  return matchTypeFromNormalizedName(normalizeWorkTagName(tag.name || ''));
}

function isPaidModifierTag(tag: TagLike): boolean {
  const key = (tag.labelKey || '').trim().toLowerCase();
  if (PAID_MODIFIER_LABEL_KEYS.has(key)) return true;
  const tagType = (tag.tagType || '').toLowerCase();
  if (tagType === 'workmodifier' && PAID_MODIFIER_LABEL_KEYS.has(key)) return true;
  const normalized = normalizeWorkTagName(tag.name || '');
  return (
    normalized === 'incomplet' ||
    normalized.endsWith(' incomplet') ||
    normalized === 'incomplete' ||
    normalized.endsWith(' incomplete') ||
    normalized === 'payant' ||
    normalized.endsWith(' payant') ||
    normalized === 'paid'
  );
}

/** Analyse les tags sélectionnés (priorité statuts selon WORK_STATUS_ORDER). */
export function resolveWorkTrackingFromTags(
  selectedTagIds: string[],
  savedTags: TagLike[]
): ResolvedWorkTracking {
  const selected = selectedTagIds
    .map(id => findTagByPostId(id, savedTags))
    .filter((t): t is TagLike => !!t);

  let status: WorkStatus | null = null;
  for (const priority of WORK_STATUS_ORDER) {
    if (selected.some(tag => resolveStatusFromTag(tag) === priority)) {
      status = priority;
      break;
    }
  }

  let workType: WorkTypeKey | null = null;
  for (const tag of selected) {
    const t = resolveTypeFromTag(tag);
    if (t) {
      workType = t;
      break;
    }
  }

  const isPaidModifier = selected.some(isPaidModifierTag);
  let resolvedStatus: WorkStatus = status ?? 'ongoing';
  if (resolvedStatus === 'ongoing' && isPaidModifier) {
    resolvedStatus = 'ongoing_paid';
  }

  const meta = WORK_STATUS_META[resolvedStatus];
  const typeMeta = workType ? WORK_TYPE_META[workType] : null;

  return {
    status: resolvedStatus,
    workType,
    workTypeLabel: typeMeta?.label ?? '',
    statusLabel: meta.label,
    statusEmoji: meta.emoji,
    isPaid: resolvedStatus === 'ongoing_paid' || isPaidModifier,
    chapterControlDefault: meta.chapterControlDefault,
  };
}

/** Rétrocompat : ancien type WebtoonWorkStatus. */
export type LegacyWebtoonWorkStatus = 'ongoing' | 'terminated' | 'abandoned';

export function toLegacyWebtoonStatus(status: WorkStatus): LegacyWebtoonWorkStatus {
  if (status === 'completed') return 'terminated';
  if (status === 'abandoned') return 'abandoned';
  return 'ongoing';
}

export function resolveLegacyWebtoonStatusFromTags(
  selectedTagIds: string[],
  savedTags: TagLike[]
): LegacyWebtoonWorkStatus {
  return toLegacyWebtoonStatus(resolveWorkTrackingFromTags(selectedTagIds, savedTags).status);
}
