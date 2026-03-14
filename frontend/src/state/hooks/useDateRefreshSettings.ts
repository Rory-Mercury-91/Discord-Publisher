/**
 * Lit et écrit dans app_config (Supabase) les clés de pilotage
 * du rafraîchissement automatique de f95_date_maj.
 *
 * Clés gérées :
 *   f95_date_refresh_interval_hours  — number  (0 = manuel, défaut 168)
 *   f95_date_last_refresh            — string ISO (lecture seule depuis ce hook)
 */

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

const KEY_INTERVAL   = 'f95_date_refresh_interval_hours';
const KEY_LAST       = 'f95_date_last_refresh';
const DEFAULT_HOURS  = 168;

export function useDateRefreshSettings() {
  const [intervalHours, setIntervalHoursState] = useState<number>(DEFAULT_HOURS);
  const [lastRefresh,   setLastRefresh]         = useState<string | null>(null);
  const [loading,       setLoading]             = useState(true);

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) { setLoading(false); return; }
    try {
      const { data } = await sb
        .from('app_config')
        .select('key, value')
        .in('key', [KEY_INTERVAL, KEY_LAST]);

      for (const row of (data ?? [])) {
        if (row.key === KEY_INTERVAL) {
          const n = Number(row.value);
          setIntervalHoursState(Number.isFinite(n) ? n : DEFAULT_HOURS);
        } else if (row.key === KEY_LAST) {
          setLastRefresh(row.value ?? null);
        }
      }
    } catch (e) {
      console.warn('[useDateRefreshSettings] load:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setIntervalHours = useCallback(async (n: number) => {
    setIntervalHoursState(n);
    const sb = getSupabase();
    if (!sb) return;
    try {
      await sb
        .from('app_config')
        .upsert({ key: KEY_INTERVAL, value: String(n) }, { onConflict: 'key' });
    } catch (e) {
      console.warn('[useDateRefreshSettings] setIntervalHours:', e);
    }
  }, []);

  return {
    intervalHours,
    setIntervalHours,
    lastRefresh,
    loading,
  };
}