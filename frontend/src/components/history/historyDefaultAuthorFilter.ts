import { PREFIX_EXT, PREFIX_PROFILE } from './constants';

const STORAGE_PREFIX = 'historyDefaultAuthorFilter';

function storageKey(profileId: string): string {
  return `${STORAGE_PREFIX}:${profileId}`;
}

export function getHistoryDefaultAuthorFilter(profileId: string | undefined): string | null {
  if (!profileId) return null;
  try {
    const raw = localStorage.getItem(storageKey(profileId));
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

export function setHistoryDefaultAuthorFilter(
  profileId: string | undefined,
  filterAuthorId: string | null
): void {
  if (!profileId) return;
  try {
    const key = storageKey(profileId);
    if (!filterAuthorId?.trim()) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, filterAuthorId.trim());
  } catch {
    /* ignore */
  }
}

export type AuthorFilterOption = { id: string; label: string; group: 'all' | 'me' | 'profile' | 'external' };

export function buildAuthorFilterOptions(params: {
  currentUserPseudo?: string;
  allProfiles: { id: string; pseudo?: string; discord_id?: string }[];
  externalTranslators: { id: string; name: string }[];
  currentUserDiscordId?: string;
  includeAllAuthors?: boolean;
}): AuthorFilterOption[] {
  const {
    currentUserPseudo,
    allProfiles,
    externalTranslators,
    currentUserDiscordId,
    includeAllAuthors = true,
  } = params;

  const options: AuthorFilterOption[] = [];
  if (includeAllAuthors) {
    options.push({ id: '', label: 'Tous les auteurs', group: 'all' });
  }
  options.push({ id: 'me', label: currentUserPseudo?.trim() || 'Moi', group: 'me' });

  for (const p of allProfiles) {
    if (p.discord_id === currentUserDiscordId) continue;
    options.push({
      id: PREFIX_PROFILE + p.id,
      label: p.pseudo?.trim() || p.discord_id || p.id,
      group: 'profile',
    });
  }

  for (const ext of externalTranslators) {
    options.push({
      id: PREFIX_EXT + ext.id,
      label: ext.name?.trim() || ext.id,
      group: 'external',
    });
  }

  return options;
}

export function isAuthorFilterIdValid(
  filterAuthorId: string,
  options: AuthorFilterOption[]
): boolean {
  return options.some((o) => o.id === filterAuthorId);
}
