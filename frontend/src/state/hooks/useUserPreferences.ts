/**
 * Préférences utilisateur stockées dans owner_data (data_key = 'preferences').
 * Utilisé pour l'onglet "Ma collection" (show_ma_collection).
 */

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from '../authContext';

export type EnrichScheduleFrequency = 'manual' | 'daily' | 'weekly';

export type UserPreferences = {
  show_ma_collection: boolean;
  /** Fréquence d'enrichissement auto : manuel, quotidien, hebdomadaire */
  enrich_auto_frequency: EnrichScheduleFrequency;
  /** Heure d'exécution (3–23, 00h–03h réservés à l'appli) */
  enrich_auto_hour: number;
  /** Jour pour hebdomadaire (0=dim, 1=lun, …, 6=sam) */
  enrich_auto_day: number;
};

const DEFAULT_PREFERENCES: UserPreferences = {
  show_ma_collection: false,
  enrich_auto_frequency: 'manual',
  enrich_auto_hour: 8,
  enrich_auto_day: 1, // Lundi
};

export function useUserPreferences() {
  const { profile } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !profile?.id) {
      setPreferences(DEFAULT_PREFERENCES);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await sb
        .from('owner_data')
        .select('value')
        .eq('owner_type', 'profile')
        .eq('owner_id', profile.id)
        .eq('data_key', 'preferences')
        .maybeSingle();
      if (!error && data?.value && typeof data.value === 'object') {
        setPreferences({
          ...DEFAULT_PREFERENCES,
          ...(data.value as Partial<UserPreferences>),
        });
      } else {
        setPreferences(DEFAULT_PREFERENCES);
      }
    } catch {
      setPreferences(DEFAULT_PREFERENCES);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const setShowMaCollection = useCallback(
    async (value: boolean) => {
      const sb = getSupabase();
      if (!sb || !profile?.id) return;
      const next = { ...preferences, show_ma_collection: value };
      setPreferences(next);
      try {
        await sb
          .from('owner_data')
          .upsert(
            {
              owner_type: 'profile',
              owner_id: profile.id,
              data_key: 'preferences',
              value: next,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'owner_type,owner_id,data_key' }
          );
      } catch (e) {
        console.error('Erreur sauvegarde préférences:', e);
        setPreferences(preferences);
      }
    },
    [profile?.id, preferences]
  );

  const setEnrichSchedule = useCallback(
    async (updates: Partial<Pick<UserPreferences, 'enrich_auto_frequency' | 'enrich_auto_hour' | 'enrich_auto_day'>>) => {
      const sb = getSupabase();
      if (!sb || !profile?.id) return;
      const next = { ...preferences, ...updates };
      // Clamp hour 3–23, day 0–6
      if (next.enrich_auto_hour != null) next.enrich_auto_hour = Math.max(3, Math.min(23, next.enrich_auto_hour));
      if (next.enrich_auto_day != null) next.enrich_auto_day = Math.max(0, Math.min(6, next.enrich_auto_day));
      setPreferences(next);
      try {
        await sb
          .from('owner_data')
          .upsert(
            {
              owner_type: 'profile',
              owner_id: profile.id,
              data_key: 'preferences',
              value: next,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'owner_type,owner_id,data_key' }
          );
      } catch (e) {
        console.error('Erreur sauvegarde préférences enrich:', e);
        setPreferences(preferences);
      }
    },
    [profile?.id, preferences]
  );

  return {
    preferences,
    showMaCollection: preferences.show_ma_collection,
    setShowMaCollection,
    enrichAutoFrequency: preferences.enrich_auto_frequency,
    enrichAutoHour: preferences.enrich_auto_hour,
    enrichAutoDay: preferences.enrich_auto_day,
    setEnrichSchedule,
    loading,
    refresh: load,
  };
}
