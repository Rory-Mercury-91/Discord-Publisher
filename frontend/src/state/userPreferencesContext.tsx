/**
 * Préférences utilisateur partagées (une seule instance React pour toute l'app).
 * Salon Webtoon : profil admin + repli localStorage + app_config global.
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

const LS_SHOW_CALENDAR = 'show_calendar_template';
const LS_CALENDAR_FORUM = 'calendar_forum_channel_id';
export const APP_CONFIG_CALENDAR_FORUM = 'calendar_forum_channel_id';

export type UserPreferences = {
  show_ma_collection: boolean;
  show_calendar_template: boolean;
  calendar_forum_channel_id: string;
  enrich_auto_frequency: EnrichScheduleFrequency;
  enrich_auto_hour: number;
  enrich_auto_day: number;
};

const DEFAULT_PREFERENCES: UserPreferences = {
  show_ma_collection: false,
  show_calendar_template: false,
  calendar_forum_channel_id: '',
  enrich_auto_frequency: 'manual',
  enrich_auto_hour: 8,
  enrich_auto_day: 1,
};

function readLocalCalendarForum(): string {
  try {
    return (localStorage.getItem(LS_CALENDAR_FORUM) || '').trim();
  } catch {
    return '';
  }
}

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

function syncCalendarLocalStorage(patch: Partial<UserPreferences>) {
  try {
    if (patch.show_calendar_template !== undefined) {
      localStorage.setItem(LS_SHOW_CALENDAR, patch.show_calendar_template ? 'true' : 'false');
    }
    if (patch.calendar_forum_channel_id !== undefined) {
      localStorage.setItem(LS_CALENDAR_FORUM, patch.calendar_forum_channel_id.trim());
    }
  } catch {
    /* ignore */
  }
}

async function fetchGlobalCalendarForum(): Promise<string> {
  const sb = getSupabase();
  if (!sb) return '';
  try {
    const { data, error } = await sb
      .from('app_config')
      .select('value')
      .eq('key', APP_CONFIG_CALENDAR_FORUM)
      .maybeSingle();
    if (error || !data?.value) return '';
    return String(data.value).trim();
  } catch {
    return '';
  }
}

async function persistGlobalCalendarForum(forumId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const trimmed = forumId.trim();
  if (!trimmed) {
    await sb.from('app_config').delete().eq('key', APP_CONFIG_CALENDAR_FORUM);
    return;
  }
  await sb
    .from('app_config')
    .upsert({ key: APP_CONFIG_CALENDAR_FORUM, value: trimmed }, { onConflict: 'key' });
}

async function resolveCalendarForumChannelId(
  profilePrefs: UserPreferences
): Promise<string> {
  const fromProfile = (profilePrefs.calendar_forum_channel_id || '').trim();
  if (fromProfile) return fromProfile;
  const fromLocal = readLocalCalendarForum();
  if (fromLocal) return fromLocal;
  return fetchGlobalCalendarForum();
}

type UserPreferencesContextValue = {
  preferences: UserPreferences;
  showMaCollection: boolean;
  setShowMaCollection: (value: boolean) => Promise<void>;
  showCalendarTemplate: boolean;
  setShowCalendarTemplate: (value: boolean) => Promise<void>;
  calendarForumChannelId: string;
  setCalendarForumChannelId: (forumChannelId: string) => Promise<void>;
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
      let localCalendar = false;
      try {
        localCalendar = localStorage.getItem(LS_SHOW_CALENDAR) === 'true';
      } catch {
        /* ignore */
      }
      const forum = (await fetchGlobalCalendarForum()) || readLocalCalendarForum();
      if (token !== loadTokenRef.current) return;
      setPreferences(
        normalizePreferences({
          show_calendar_template: localCalendar,
          calendar_forum_channel_id: forum,
        })
      );
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

      const forumId = await resolveCalendarForumChannelId(profilePrefs);
      if (token !== loadTokenRef.current) return;

      setPreferences({ ...profilePrefs, calendar_forum_channel_id: forumId });
    } catch {
      if (token === loadTokenRef.current) {
        const forumId = readLocalCalendarForum() || (await fetchGlobalCalendarForum());
        if (token === loadTokenRef.current) {
          setPreferences({ ...DEFAULT_PREFERENCES, calendar_forum_channel_id: forumId });
        }
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
      syncCalendarLocalStorage(patch);

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

        if (patch.calendar_forum_channel_id !== undefined && profile.is_master_admin) {
          await persistGlobalCalendarForum(patch.calendar_forum_channel_id);
        }

        const forumId = await resolveCalendarForumChannelId(merged);
        setPreferences({ ...merged, calendar_forum_channel_id: forumId });
      } catch (e) {
        console.error('Erreur sauvegarde préférences:', e);
        await load();
      }
    },
    [profile?.id, profile?.is_master_admin, load]
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

  const setShowCalendarTemplate = useCallback(
    (value: boolean) => persistPreferences({ show_calendar_template: value }),
    [persistPreferences]
  );

  const setCalendarForumChannelId = useCallback(
    (forumChannelId: string) =>
      persistPreferences({ calendar_forum_channel_id: forumChannelId.trim() }),
    [persistPreferences]
  );

  const calendarForumChannelId = useMemo(() => {
    const fromState = (preferences.calendar_forum_channel_id || '').trim();
    if (fromState) return fromState;
    return readLocalCalendarForum();
  }, [preferences.calendar_forum_channel_id]);

  const value = useMemo<UserPreferencesContextValue>(
    () => ({
      preferences,
      showMaCollection: preferences.show_ma_collection,
      setShowMaCollection,
      showCalendarTemplate: preferences.show_calendar_template,
      setShowCalendarTemplate,
      calendarForumChannelId,
      setCalendarForumChannelId,
      enrichAutoFrequency: preferences.enrich_auto_frequency,
      enrichAutoHour: preferences.enrich_auto_hour,
      enrichAutoDay: preferences.enrich_auto_day,
      setEnrichSchedule,
      loading,
      refresh: load,
    }),
    [
      preferences,
      calendarForumChannelId,
      setShowMaCollection,
      setShowCalendarTemplate,
      setCalendarForumChannelId,
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
