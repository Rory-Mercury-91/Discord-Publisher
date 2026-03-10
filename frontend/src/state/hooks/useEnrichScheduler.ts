/**
 * Planificateur d'enrichissement automatique de la collection.
 * Vérifie toutes les minutes si une exécution est due (quotidienne/hebdomadaire).
 * Heures 00h–03h réservées à l'application — l'utilisateur choisit entre 03h et 23h.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useUserPreferences } from './useUserPreferences';
import type { EnrichScheduleFrequency } from './useUserPreferences';

const STORAGE_KEY = 'enrich_last_run';

function getLastRunFromStorage(ownerId: string): string | null {
  try {
    return localStorage.getItem(`${STORAGE_KEY}_${ownerId}`);
  } catch {
    return null;
  }
}

function setLastRunInStorage(ownerId: string, iso: string): void {
  try {
    localStorage.setItem(`${STORAGE_KEY}_${ownerId}`, iso);
  } catch {
    /* ignore */
  }
}

/** Vérifie si une exécution est due selon la config */
function shouldRunEnrich(
  frequency: EnrichScheduleFrequency,
  hour: number,
  day: number,
  lastRunIso: string | null
): boolean {
  if (frequency === 'manual') return false;
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay(); // 0=dim, 1=lun, ..., 6=sam

  // On doit être à l'heure configurée ou après (fenêtre d'une heure pour éviter doublons)
  if (currentHour < hour) return false;

  const lastRun = lastRunIso ? new Date(lastRunIso) : null;

  if (frequency === 'daily') {
    if (!lastRun) return true;
    const lastDate = lastRun.toDateString();
    const today = now.toDateString();
    return lastDate !== today;
  }

  if (frequency === 'weekly') {
    if (currentDay !== day) return false;
    if (!lastRun) return true;
    const lastDate = lastRun.toDateString();
    const today = now.toDateString();
    return lastDate !== today;
  }

  return false;
}

export function useEnrichScheduler(
  ownerId: string | undefined,
  startEnrich: () => void,
  isRunning: boolean
) {
  const { enrichAutoFrequency, enrichAutoHour, enrichAutoDay } = useUserPreferences();
  const lastCheckMinuteRef = useRef<string>('');

  const runIfDue = useCallback(() => {
    if (!ownerId || isRunning) return;
    if (enrichAutoFrequency === 'manual') return;

    const lastRun = getLastRunFromStorage(ownerId);
    if (!shouldRunEnrich(enrichAutoFrequency, enrichAutoHour, enrichAutoDay, lastRun)) return;

    // Éviter de lancer 2 fois dans la même minute
    const now = new Date();
    const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    if (lastCheckMinuteRef.current === minuteKey) return;
    lastCheckMinuteRef.current = minuteKey;

    startEnrich();
    setLastRunInStorage(ownerId, now.toISOString());
  }, [ownerId, isRunning, enrichAutoFrequency, enrichAutoHour, enrichAutoDay, startEnrich]);

  useEffect(() => {
    if (!ownerId || enrichAutoFrequency === 'manual') return;
    runIfDue();
    const interval = setInterval(runIfDue, 60_000);
    return () => clearInterval(interval);
  }, [ownerId, enrichAutoFrequency, runIfDue]);
}
