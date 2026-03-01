export const STORAGE_KEY_MASTER_ADMIN = 'discord-publisher:master-admin-code';

export const PREFIX_PROFILE = 'p:';
export const PREFIX_EXTERNAL = 'e:';

export type OwnerOption = { id: string; label: string; kind: 'profile' | 'external' };

export function ownerKey(kind: 'profile' | 'external', entityId: string): string {
  return kind === 'profile' ? PREFIX_PROFILE + entityId : PREFIX_EXTERNAL + entityId;
}

export function normalizeOwnerStored(
  stored: string | undefined,
  myProfileId: string | undefined
): string {
  if (!stored) return myProfileId ? PREFIX_PROFILE + myProfileId : '';
  if (stored.startsWith(PREFIX_PROFILE) || stored.startsWith(PREFIX_EXTERNAL)) return stored;
  return PREFIX_PROFILE + stored;
}
