/**
 * Préférences utilisateur partagées (une seule instance React pour toute l'app).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getSupabase } from '../lib/supabase';
import { useAuth } from './authContext';

export type EnrichScheduleFrequency = 'manual' | 'daily' | 'weekly';

export type UserPreferences = {
  show_ma_collection: boolean;
  enrich_auto_frequency: EnrichScheduleFrequency;
  enrich_auto_hour: number;
  enrich_auto_day: number;
};

const DEFAULT_PREFERENCES: UserPreferences = {
  show_ma_collection: false,
  enrich_auto_frequency: 'manual',
  enrich_auto_hour: 8,
  enrich_auto_day: 1,
};

function normalizePreferences(value: Partial<UserPreferences> | null | undefined): UserPreferences {
  const merged = { ...DEFAULT_PREFERENCES, ...(value ?? {}) };
  merged.enrich_auto_hour = Math.max(3, Math.min(23, merged.enrich_auto_hour));
  merged.enrich_auto_day = Math.max(0, Math.min(6, merged.enrich_auto_day));
  return merged;
}

function applyPreferencesPatch(
  base: UserPreferences,
  patch: Partial<UserPreferences>
): UserPreferences {
  return normalizePreferences({ ...base, ...patch });
}

type UserPreferencesContextValue = {
  preferences: UserPreferences;
  showMaCollection: boolean;
  setShowMaCollection: (value: boolean) => Promise<void>;
  enrichAutoFrequency: EnrichScheduleFrequency;
  enrichAutoHour: number;
  enrichAutoDay: number;
  setEnrichSchedule: (
    updates: Partial<Pick<UserPreferences, 'enrich_auto_frequency' | 'enrich_auto_hour' | 'enrich_auto_day'>>
  ) => Promise<void>;
  loading: boolean;
  refresh: () => Promise<void>;
};

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

export function UserPreferencesProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const loadTokenRef = useRef(0);

  const load = useCallback(async () => {
    const token = ++loadTokenRef.current;
    const sb = getSupabase();

    if (!sb || !profile?.id) {
      if (token !== loadTokenRef.current) return;
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

      if (token !== loadTokenRef.current) return;

      const profilePrefs = !error && data?.value && typeof data.value === 'object'
        ? normalizePreferences(data.value as Partial<UserPreferences>)
        : DEFAULT_PREFERENCES;

      setPreferences(profilePrefs);
    } catch {
      if (token === loadTokenRef.current) {
        setPreferences(DEFAULT_PREFERENCES);
      }
    } finally {
      if (token === loadTokenRef.current) {
        setLoading(false);
      }
    }
  }, [profile?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const persistPreferences = useCallback(
    async (patch: Partial<UserPreferences>) => {
      loadTokenRef.current++;

      setPreferences(prev => applyPreferencesPatch(prev, patch));

      const sb = getSupabase();
      if (!sb || !profile?.id) return;

      try {
        const { data, error: readError } = await sb
          .from('owner_data')
          .select('value')
          .eq('owner_type', 'profile')
          .eq('owner_id', profile.id)
          .eq('data_key', 'preferences')
          .maybeSingle();

        if (readError) throw readError;

        const remote = normalizePreferences(
          data?.value && typeof data.value === 'object'
            ? (data.value as Partial<UserPreferences>)
            : undefined
        );
        const merged = applyPreferencesPatch(remote, patch);

        const { error: upsertError } = await sb.from('owner_data').upsert(
          {
            owner_type: 'profile',
            owner_id: profile.id,
            data_key: 'preferences',
            value: merged,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'owner_type,owner_id,data_key' }
        );

        if (upsertError) throw upsertError;

        setPreferences(merged);
      } catch (e) {
        console.error('Erreur sauvegarde préférences:', e);
        await load();
      }
    },
    [profile?.id, load]
  );

  const setShowMaCollection = useCallback(
    (value: boolean) => persistPreferences({ show_ma_collection: value }),
    [persistPreferences]
  );

  const setEnrichSchedule = useCallback(
    (
      updates: Partial<Pick<UserPreferences, 'enrich_auto_frequency' | 'enrich_auto_hour' | 'enrich_auto_day'>>
    ) => persistPreferences(updates),
    [persistPreferences]
  );

  const value = useMemo<UserPreferencesContextValue>(
    () => ({
      preferences,
      showMaCollection: preferences.show_ma_collection,
      setShowMaCollection,
      enrichAutoFrequency: preferences.enrich_auto_frequency,
      enrichAutoHour: preferences.enrich_auto_hour,
      enrichAutoDay: preferences.enrich_auto_day,
      setEnrichSchedule,
      loading,
      refresh: load,
    }),
    [
      preferences,
      setShowMaCollection,
      setEnrichSchedule,
      loading,
      load,
    ]
  );

  return (
    <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>
  );
}

export function useUserPreferences(): UserPreferencesContextValue {
  const ctx = useContext(UserPreferencesContext);
  if (!ctx) {
    throw new Error('useUserPreferences doit être utilisé dans UserPreferencesProvider');
  }
  return ctx;
}
