import type { PublishedPost } from '../../state/appContext';
import type { Profile } from '../../state/authContext';

export const GRID_COLUMNS = 3;
/** Minimum de lignes affichées (pagination dynamique selon la hauteur). */
export const MIN_GRID_ROWS = 4;
/** Hauteur estimée d'une carte + espacement (px). */
export const HISTORY_CARD_ROW_HEIGHT = 54;
export const HISTORY_GRID_GAP = 12;
/** Fallback si la mesure n'est pas encore disponible. */
export const POSTS_PER_PAGE_FALLBACK = MIN_GRID_ROWS * GRID_COLUMNS;

export type TabId = 'actifs' | 'archive';

export const PREFIX_PROFILE = 'profile:';
export const PREFIX_EXT = 'ext:';

export type ProfilePublic = Pick<Profile, 'id' | 'pseudo' | 'discord_id'>;
export type ExternalTranslatorPublic = { id: string; name: string };

/**
 * Historique personnel : publications dont je suis l'auteur Discord,
 * hors celles publiées au nom d'un traducteur externe.
 */
export function isPostInPersonalHistory(
  post: PublishedPost,
  currentUserDiscordId: string | undefined
): boolean {
  if (!currentUserDiscordId || post.authorDiscordId !== currentUserDiscordId) return false;
  return !post.authorExternalTranslatorId;
}

export function formatHistoryDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function resolveAuthorFilterLabel(
  filterAuthorId: string,
  currentUserPseudo: string | undefined,
  allProfiles: ProfilePublic[],
  externalTranslators: ExternalTranslatorPublic[]
): string {
  if (filterAuthorId === 'me') return currentUserPseudo?.trim() || 'Moi';
  if (filterAuthorId.startsWith(PREFIX_EXT)) {
    const ext = externalTranslators.find((e) => e.id === filterAuthorId.slice(PREFIX_EXT.length));
    return ext?.name?.trim() || 'Traducteur externe';
  }
  if (filterAuthorId.startsWith(PREFIX_PROFILE)) {
    const profile = allProfiles.find((p) => p.id === filterAuthorId.slice(PREFIX_PROFILE.length));
    return profile?.pseudo?.trim() || profile?.discord_id || 'Utilisateur';
  }
  return 'Auteur';
}
