import { resolveStoredDateValue } from '../logic/formatVar';
import { WEEKDAY_OPTIONS } from './registry';

/** Sérialise les jours cochés (input formulaire). */
export function serializeReleaseWeekdays(days: number[]): string {
  return [...new Set(days.filter(d => d >= 0 && d <= 6))].sort((a, b) => a - b).join(',');
}

/** Parse la valeur stockée (ex. "0,2,4"). */
export function parseReleaseWeekdays(raw: string | undefined | null): number[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n) && n >= 0 && n <= 6)
    .sort((a, b) => a - b);
}

/** Texte FR pour le message Discord : « Lundi, Mercredi et Vendredi ». */
export function formatReleaseWeekdaysText(days: number[]): string {
  const labels = days
    .map(d => WEEKDAY_OPTIONS.find(o => o.value === d)?.label)
    .filter((l): l is string => !!l);
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} et ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} et ${labels[labels.length - 1]}`;
}

/** Convertit un Date en ISO AAAA-MM-JJ (minuit local). */
export function dateToIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Prochain jour de sortie strictement après fromIso selon la liste de weekdays. */
export function computeNextReleaseDate(fromIso: string, weekdays: number[]): string | null {
  if (!fromIso || weekdays.length === 0) return null;
  const m = fromIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const sorted = [...new Set(weekdays)].sort((a, b) => a - b);
  const start = new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
    0,
    0,
    0,
    0
  );
  const candidate = new Date(start);
  candidate.setDate(candidate.getDate() + 1);
  for (let i = 0; i < 14; i += 1) {
    const jsDay = candidate.getDay();
    const weekday = jsDay === 0 ? 6 : jsDay - 1;
    if (sorted.includes(weekday)) return dateToIsoLocal(candidate);
    candidate.setDate(candidate.getDate() + 1);
  }
  return null;
}

/** Prochain jour de sortie dans le mois suivant (mode mensuel). */
export function computeNextMonthlyReleaseDate(fromIso: string, weekdays: number[]): string | null {
  if (!fromIso || weekdays.length === 0) return null;
  const m = fromIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const sorted = [...new Set(weekdays)].sort((a, b) => a - b);
  const anchor = new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
    0,
    0,
    0,
    0
  );
  const nextMonthStart = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  const month = nextMonthStart.getMonth();
  for (let day = 1; day <= 31; day += 1) {
    const candidate = new Date(nextMonthStart.getFullYear(), month, day, 0, 0, 0, 0);
    if (candidate.getMonth() !== month) break;
    const jsDay = candidate.getDay();
    const weekday = jsDay === 0 ? 6 : jsDay - 1;
    if (sorted.includes(weekday)) return dateToIsoLocal(candidate);
  }
  return null;
}

/** Prochaine date de sortie après fromIso selon le mode hebdo ou mensuel. */
export function computeNextReleaseDateByMode(
  fromIso: string,
  weekdays: number[],
  monthly: boolean
): string | null {
  return monthly
    ? computeNextMonthlyReleaseDate(fromIso, weekdays)
    : computeNextReleaseDate(fromIso, weekdays);
}

/**
 * Projette la date du chapitre cible à partir de l'ancre (prochain chapitre + date).
 * Ex. ancre ch. 79 + plafond 95 → 16 pas de récurrence après la date du ch. 79.
 */
export function projectReleaseDateAtChapter(
  anchorDateIso: string,
  anchorChapter: number,
  targetChapter: number,
  weekdays: number[],
  monthly: boolean
): string | null {
  if (!anchorDateIso || !Number.isFinite(anchorChapter) || !Number.isFinite(targetChapter)) {
    return null;
  }
  if (targetChapter <= anchorChapter) return anchorDateIso;
  if (weekdays.length === 0) return null;

  let current = anchorDateIso;
  const steps = targetChapter - anchorChapter;
  for (let i = 0; i < steps; i += 1) {
    const next = computeNextReleaseDateByMode(current, weekdays, monthly);
    if (!next) return null;
    current = next;
  }
  return current;
}

/** Date du jour (minuit local) > dateIso ? (ISO ou offset « X J »). */
export function isReleaseDatePassed(dateIso: string): boolean {
  const resolved = resolveStoredDateValue(dateIso);
  const m = resolved.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const target = new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
    0,
    0,
    0,
    0
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime() > target.getTime();
}
