import type { Profile } from '../../state/authContext';

export const POSTS_PER_PAGE = 15;
export const GRID_COLUMNS = 3;

export type TabId = 'actifs' | 'archive';

export const PREFIX_PROFILE = 'profile:';
export const PREFIX_EXT = 'ext:';

export type ProfilePublic = Pick<Profile, 'id' | 'pseudo' | 'discord_id'>;
export type ExternalTranslatorPublic = { id: string; name: string };

export function formatHistoryDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
