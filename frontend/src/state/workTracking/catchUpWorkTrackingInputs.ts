import { computeNextChapter } from '../calendarTemplate';
import { resolveStoredDateValue } from '../logic/formatVar';
import type { Tag } from '../types';
import {
  computeNextReleaseDateByMode,
  isReleaseDatePassed,
  parseReleaseWeekdays,
} from './releaseWeekdays';
import { resolveWorkTrackingFromTags } from './resolveFromTags';

const MAX_CATCH_UP_STEPS = 500;

/** Champs mis à jour par le rattrapage de progression. */
const CATCH_UP_KEYS = [
  'Progress_Current',
  'Chapitre_Actuel',
  'Chapitre_Suivant',
  'Date_Suivant',
] as const;

function isChapterControlEnabled(inputs: Record<string, string>): boolean {
  return inputs.Chapter_Control_Enabled !== 'false';
}

/**
 * Avance chapitres et dates tant que la prochaine sortie est passée (statut En cours).
 * Miroir de work_tracking_refresh.py, avec rattrapage multi-sorties en une passe.
 */
export function catchUpWorkTrackingInputs(
  inputs: Record<string, string>,
  selectedTagIds: string[],
  savedTags: Pick<Tag, 'id' | 'name' | 'tagType' | 'labelKey' | 'discordTagId'>[]
): Record<string, string> {
  const resolved = resolveWorkTrackingFromTags(selectedTagIds, savedTags);
  if (resolved.status !== 'ongoing' || !isChapterControlEnabled(inputs)) {
    return inputs;
  }

  const weekdays = parseReleaseWeekdays(inputs.Release_Weekdays);
  if (weekdays.length === 0) return inputs;

  const monthly = inputs.Release_Monthly === 'true';
  const next = { ...inputs };
  let steps = 0;

  while (steps < MAX_CATCH_UP_STEPS) {
    const dateRaw = resolveStoredDateValue(next.Date_Suivant || '');
    if (!dateRaw || !isReleaseDatePassed(dateRaw)) break;

    const releasedCh = (
      next.Chapitre_Suivant ||
      next.Progress_Current ||
      next.Chapitre_Actuel ||
      ''
    ).trim();
    const newNextDate = computeNextReleaseDateByMode(dateRaw, weekdays, monthly);
    if (!newNextDate) break;

    if (releasedCh) {
      next.Progress_Current = releasedCh;
      next.Chapitre_Actuel = releasedCh;
    }
    next.Chapitre_Suivant = computeNextChapter(releasedCh);
    next.Date_Suivant = newNextDate;
    steps += 1;
  }

  return next;
}

export function workTrackingInputsProgressChanged(
  before: Record<string, string>,
  after: Record<string, string>
): boolean {
  return CATCH_UP_KEYS.some(key => (before[key] || '') !== (after[key] || ''));
}

export function applyWorkTrackingInputs(
  inputs: Record<string, string>,
  setInput: (name: string, value: string) => void
): void {
  for (const key of CATCH_UP_KEYS) {
    if (inputs[key] !== undefined) setInput(key, inputs[key] || '');
  }
}
