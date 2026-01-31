import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

/**
 * Fusionne les instructions Supabase avec les instructions locales.
 * - Instructions locales sans owner connu → conservées
 * - Instructions Supabase → ajoutées/mises à jour
 * - Instructions dont le owner était connu mais n'est plus accessible (révoqué) → supprimées
 */
export function mergeInstructionsFromSupabase(
  supabaseData: Array<{ owner_id: string; value: Record<string, string> | string }>,
  currentInstructions: Record<string, string>,
  currentOwners: Record<string, string>
): { merged: Record<string, string>; owners: Record<string, string> } {
  // Extraire toutes les instructions et owners depuis Supabase
  const supabaseInstructions: Record<string, string> = {};
  const supabaseOwners: Record<string, string> = {};
  const visibleOwnerIds = new Set<string>();

  for (const row of supabaseData) {
    visibleOwnerIds.add(row.owner_id);
    try {
      const val = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        for (const [k, v] of Object.entries(val)) {
          if (typeof v === 'string') {
            supabaseInstructions[k] = v;
            supabaseOwners[k] = row.owner_id;
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
    if (!existingOwner) {
      // Instruction locale pure (pas de owner connu) → garder
      merged[k] = v;
    } else if (visibleOwnerIds.has(existingOwner)) {
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

async function _syncMyInstructionsToSupabase(
  instructions: Record<string, string>,
  owners: Record<string, string>,
  userId: string
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const myInstructions: Record<string, string> = {};
  for (const [k, v] of Object.entries(instructions)) {
    if (!owners[k] || owners[k] === userId) myInstructions[k] = v;
  }

  await sb
    .from('saved_instructions')
    .upsert(
      { owner_id: userId, value: myInstructions, updated_at: new Date().toISOString() },
      { onConflict: 'owner_id' }
    );
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

  function saveInstruction(name: string, text: string) {
    const newInstructions = { ...savedInstructions, [name]: text };
    setSavedInstructions(newInstructions);
    getSupabase()?.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        const newOwners = { ...instructionOwners, [name]: session.user.id };
        setInstructionOwners(newOwners);
        _syncMyInstructionsToSupabase(newInstructions, newOwners, session.user.id).catch(() => {});
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
        _syncMyInstructionsToSupabase(newInstructions, newOwners, session.user.id).catch(() => {});
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
      const myInstructions: Record<string, string> = {};
      for (const [k, v] of Object.entries(savedInstructions)) {
        if (instructionOwners[k] === userId) myInstructions[k] = v;
      }
      const { error } = await sb
        .from('saved_instructions')
        .upsert(
          { owner_id: userId, value: myInstructions, updated_at: new Date().toISOString() },
          { onConflict: 'owner_id' }
        );
      if (error) throw new Error((error as { message?: string })?.message);
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function fetchInstructionsFromSupabase(): Promise<void> {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.from('saved_instructions').select('owner_id, value');
    if (error || !data?.length) return;

    // Lire les instructions locales depuis localStorage pour fusion
    let localInstructions: Record<string, string> = {};
    let localOwners: Record<string, string> = {};
    try {
      const rawInstr = localStorage.getItem('savedInstructions');
      const rawOwners = localStorage.getItem('instructionOwners');
      if (rawInstr) localInstructions = JSON.parse(rawInstr);
      if (rawOwners) localOwners = JSON.parse(rawOwners);
    } catch { /* ignorer */ }

    // Fusion intelligente : garder les locales sans owner, supprimer les révoquées, ajouter les Supabase
    const { merged, owners } = mergeInstructionsFromSupabase(
      data as Array<{ owner_id: string; value: Record<string, string> | string }>,
      localInstructions,
      localOwners
    );
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
