import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

export type SavedInstructionRow = {
  owner_type?: 'profile' | 'external';
  owner_id: string;
  value: Record<string, string> | string;
};

/**
 * Fusionne les instructions Supabase avec les instructions locales.
 * Supabase peut renvoyer owner_type + owner_id (profil ou traducteur externe).
 * - owner_type absent (legacy) → traité comme 'profile'.
 */
export function mergeInstructionsFromSupabase(
  supabaseData: SavedInstructionRow[],
  currentInstructions: Record<string, string>,
  currentOwners: Record<string, string>
): { merged: Record<string, string>; owners: Record<string, string> } {
  const supabaseInstructions: Record<string, string> = {};
  const supabaseOwners: Record<string, string> = {};
  const visibleOwnerIds = new Set<string>();
  const PREFIX_PROFILE_MERGE = 'p:';
  const PREFIX_EXTERNAL_MERGE = 'e:';

  for (const row of supabaseData) {
    const kind = row.owner_type === 'external' ? 'external' : 'profile';
    const prefixedOwner = kind === 'profile' ? PREFIX_PROFILE_MERGE + row.owner_id : PREFIX_EXTERNAL_MERGE + row.owner_id;
    visibleOwnerIds.add(row.owner_id);
    visibleOwnerIds.add(prefixedOwner);
    try {
      const val = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        for (const [k, v] of Object.entries(val)) {
          if (typeof v === 'string') {
            supabaseInstructions[k] = v;
            supabaseOwners[k] = prefixedOwner;
          }
        }
      }
    } catch {
      /* ignorer */
    }
  }

  // Fusionner : garder les locales sans owner, supprimer les révoquées, ajouter les Supabase
  const merged: Record<string, string> = {};
  const owners: Record<string, string> = {};

  // 1. Parcourir les instructions locales existantes
  for (const [k, v] of Object.entries(currentInstructions)) {
    const existingOwner = currentOwners[k];
    const normalizedExisting = existingOwner?.startsWith('p:') || existingOwner?.startsWith('e:') ? existingOwner : (existingOwner ? 'p:' + existingOwner : '');
    if (!existingOwner) {
      // Instruction locale pure (pas de owner connu) → garder
      merged[k] = v;
    } else if (visibleOwnerIds.has(normalizedExisting) || visibleOwnerIds.has(existingOwner)) {
      // Le owner est toujours accessible → sera écrasé par Supabase si présent
      // (ne pas ajouter ici, sera ajouté depuis supabaseInstructions)
    } else {
      // Le owner était connu mais n'est plus accessible → RÉVOQUÉ, supprimer
    }
  }

  // 2. Ajouter/écraser avec les instructions Supabase
  for (const [k, v] of Object.entries(supabaseInstructions)) {
    merged[k] = v;
    owners[k] = supabaseOwners[k];
  }

  // Ordre stable des clés (alphabétique) pour éviter que les instructions "switchent" de position
  const sortedMerged = Object.fromEntries(Object.entries(merged).sort((a, b) => a[0].localeCompare(b[0])));
  const sortedOwners = Object.fromEntries(Object.entries(owners).sort((a, b) => a[0].localeCompare(b[0])));
  return { merged: sortedMerged, owners: sortedOwners };
}

const PREFIX_PROFILE = 'p:';
const PREFIX_EXTERNAL = 'e:';
const STORAGE_KEY_MASTER_ADMIN = 'discord-publisher:master-admin-code';

function groupInstructionsByOwner(
  instructions: Record<string, string>,
  owners: Record<string, string>
): Array<{ owner_type: 'profile' | 'external'; owner_id: string; value: Record<string, string> }> {
  const buckets: Record<string, Record<string, string>> = {};
  for (const [name, text] of Object.entries(instructions)) {
    const key = owners[name];
    if (!key) continue;
    const ownerType = key.startsWith(PREFIX_EXTERNAL) ? 'external' : 'profile';
    const ownerId = key.startsWith(PREFIX_EXTERNAL) ? key.slice(2) : key.startsWith(PREFIX_PROFILE) ? key.slice(2) : key;
    const bucketKey = `${ownerType}:${ownerId}`;
    if (!buckets[bucketKey]) buckets[bucketKey] = {};
    buckets[bucketKey][name] = text;
  }
  return Object.entries(buckets).map(([bucketKey, value]) => {
    const [owner_type, owner_id] = bucketKey.split(':', 2) as ['profile' | 'external', string];
    return { owner_type, owner_id, value };
  });
}

async function _syncAllInstructionsToSupabase(
  instructions: Record<string, string>,
  owners: Record<string, string>,
  userId: string
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const isMasterAdmin = !!localStorage.getItem(STORAGE_KEY_MASTER_ADMIN);
  const rows = groupInstructionsByOwner(instructions, owners);
  const toSync = rows.filter(
    r => r.owner_type === 'profile' && r.owner_id === userId
      || (r.owner_type === 'external' && isMasterAdmin)
  );
  const now = new Date().toISOString();
  for (const row of toSync) {
    await sb
      .from('saved_instructions')
      .upsert(
        { owner_type: row.owner_type, owner_id: row.owner_id, value: row.value, updated_at: now },
        { onConflict: 'owner_type,owner_id' }
      );
  }
}

export function useInstructionsState() {
  const [savedInstructions, setSavedInstructions] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('savedInstructions');
      if (raw) return JSON.parse(raw);
    } catch { }
    return {};
  });

  const [instructionOwners, setInstructionOwners] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('instructionOwners');
      if (raw) return JSON.parse(raw);
    } catch { }
    return {};
  });

  useEffect(() => {
    localStorage.setItem('savedInstructions', JSON.stringify(savedInstructions));
  }, [savedInstructions]);

  useEffect(() => {
    localStorage.setItem('instructionOwners', JSON.stringify(instructionOwners));
  }, [instructionOwners]);

  /** Enregistre une instruction. ownerId optionnel : profil auquel l'instruction est attribuée (ex. quand on publie pour un autre). */
  function saveInstruction(name: string, text: string, ownerId?: string) {
    const newInstructions = { ...savedInstructions, [name]: text };
    setSavedInstructions(newInstructions);
    getSupabase()?.auth.getSession().then(({ data: { session } }) => {
      const rawId = session?.user?.id;
      const effectiveOwnerId = ownerId ?? (rawId ? PREFIX_PROFILE + rawId : undefined);
      const newOwners = { ...instructionOwners, [name]: effectiveOwnerId ?? (rawId ? PREFIX_PROFILE + rawId : '') };
      setInstructionOwners(newOwners);
      if (rawId) {
        _syncAllInstructionsToSupabase(newInstructions, newOwners, rawId).catch(() => {});
      }
    });
  }

  function deleteInstruction(name: string) {
    const newInstructions = { ...savedInstructions };
    delete newInstructions[name];
    const newOwners = { ...instructionOwners };
    delete newOwners[name];
    setSavedInstructions(newInstructions);
    setInstructionOwners(newOwners);
    getSupabase()?.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        _syncAllInstructionsToSupabase(newInstructions, newOwners, session.user.id).catch(() => {});
      }
    });
  }

  async function syncInstructionsToSupabase(): Promise<{ ok: boolean; error?: string }> {
    const sb = getSupabase();
    if (!sb) return { ok: false, error: 'Supabase non configuré' };
    try {
      const { data: { session } } = await sb.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'Connectez-vous pour enregistrer les instructions' };
      await _syncAllInstructionsToSupabase(savedInstructions, instructionOwners, userId);
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function fetchInstructionsFromSupabase(): Promise<void> {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.from('saved_instructions').select('owner_type, owner_id, value');
    if (error) return;
    const rows = (data ?? []) as SavedInstructionRow[];
    if (rows.length === 0) return;

    let localInstructions: Record<string, string> = {};
    let localOwners: Record<string, string> = {};
    try {
      const rawInstr = localStorage.getItem('savedInstructions');
      const rawOwners = localStorage.getItem('instructionOwners');
      if (rawInstr) localInstructions = JSON.parse(rawInstr);
      if (rawOwners) localOwners = JSON.parse(rawOwners);
    } catch { /* ignorer */ }

    const { merged, owners } = mergeInstructionsFromSupabase(rows, localInstructions, localOwners);
    setSavedInstructions(merged);
    setInstructionOwners(owners);
  }

  return {
    savedInstructions,
    instructionOwners,
    saveInstruction,
    deleteInstruction,
    syncInstructionsToSupabase,
    fetchInstructionsFromSupabase,
    setSavedInstructions,
    setInstructionOwners
  };
}
