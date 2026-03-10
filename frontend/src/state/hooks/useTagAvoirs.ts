/**
 * Avis sur les tags (Like / Dislike / Neutre) stockés dans owner_data (data_key = 'tag_avoirs').
 * Gestion globale par utilisateur, pas par jeu.
 */

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from '../authContext';

export type TagAvoir = 'like' | 'dislike' | 'neutral';

const DATA_KEY = 'tag_avoirs';

export function useTagAvoirs() {
  const { profile } = useAuth();
  const [tagAvoirs, setTagAvoirsState] = useState<Record<string, TagAvoir>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !profile?.id) {
      setTagAvoirsState({});
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await sb
        .from('owner_data')
        .select('value')
        .eq('owner_type', 'profile')
        .eq('owner_id', profile.id)
        .eq('data_key', DATA_KEY)
        .maybeSingle();
      if (!error && data?.value && typeof data.value === 'object' && !Array.isArray(data.value)) {
        setTagAvoirsState(data.value as Record<string, TagAvoir>);
      } else {
        setTagAvoirsState({});
      }
    } catch {
      setTagAvoirsState({});
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const getAvoir = useCallback(
    (tag: string): TagAvoir => {
      const key = tag.trim();
      if (!key) return 'neutral';
      return tagAvoirs[key] ?? 'neutral';
    },
    [tagAvoirs]
  );

  const setAvoir = useCallback(
    async (tag: string, avis: TagAvoir) => {
      const sb = getSupabase();
      if (!sb || !profile?.id) return { ok: false, error: 'Non connecté' };
      const key = tag.trim();
      if (!key) return { ok: false, error: 'Tag vide' };
      const next = { ...tagAvoirs, [key]: avis };
      setTagAvoirsState(next);
      try {
        await sb
          .from('owner_data')
          .upsert(
            {
              owner_type: 'profile',
              owner_id: profile.id,
              data_key: DATA_KEY,
              value: next,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'owner_type,owner_id,data_key' }
          );
        return { ok: true };
      } catch (e) {
        setTagAvoirsState(tagAvoirs);
        return { ok: false, error: (e as Error)?.message ?? 'Erreur sauvegarde' };
      }
    },
    [profile?.id, tagAvoirs]
  );

  /** Cycle: like → dislike → neutral → like */
  const cycleAvoir = useCallback(
    (tag: string): TagAvoir => {
      const current = getAvoir(tag);
      if (current === 'like') return 'dislike';
      if (current === 'dislike') return 'neutral';
      return 'like';
    },
    [getAvoir]
  );

  return {
    tagAvoirs,
    getAvoir,
    setAvoir,
    cycleAvoir,
    loading,
    refresh: load,
  };
}
