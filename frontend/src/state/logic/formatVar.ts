import type { VarConfig } from '../types';

/** Parse une saisie relative : « 468 J », « 468j », « 468 jours » → nombre de jours. */
export function parseDaysOffsetInput(raw: string): number | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^\+?(\d+)\s*(?:j|jours?)?$/i);
  if (!m) return null;
  const days = parseInt(m[1], 10);
  return Number.isFinite(days) && days >= 0 ? days : null;
}

/** Nombre de jours entre aujourd'hui (minuit local) et une date ISO. */
export function isoDateToDaysFromToday(isoDate: string): number | null {
  const resolved = resolveStoredDateValue(isoDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resolved)) return null;
  const m = resolved.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
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
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Aujourd'hui (minuit local) + N jours → AAAA-MM-JJ. */
export function addDaysFromTodayIso(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/**
 * Valeur stockée : ISO AAAA-MM-JJ ou offset « X J » converti au moment de l'usage.
 */
export function resolveStoredDateValue(value: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  const days = parseDaysOffsetInput(trimmed);
  if (days !== null) return addDaysFromTodayIso(days);
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return trimmed;
}

/** Affichage FR pour les champs date (input type=date → AAAA-MM-JJ). */
export function formatDateForDisplay(isoDate: string): string {
  const resolved = resolveStoredDateValue(isoDate);
  const m = resolved.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return (isoDate || '').trim();
}

/** Convertit AAAA-MM-JJ en timestamp Unix (secondes, minuit heure locale). */
export function isoDateToUnixSeconds(isoDate: string): number | null {
  const trimmed = (isoDate || '').trim();
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  const d = new Date(year, month, day, 0, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000);
}

/**
 * Timestamp Discord : date longue sans heure (:D) + relatif (:R).
 */
export function formatDateDiscordTimestamp(isoDate: string): string {
  const resolved = resolveStoredDateValue(isoDate);
  const unix = isoDateToUnixSeconds(resolved);
  if (unix === null) return formatDateForDisplay(isoDate);
  return `<t:${unix}:D> (<t:${unix}:R>)`;
}

/** Timestamp Discord date seule (:D), sans relatif. */
export function formatDateDiscordTimestampShort(isoDate: string): string {
  const resolved = resolveStoredDateValue(isoDate);
  const unix = isoDateToUnixSeconds(resolved);
  if (unix === null) return '';
  return `<t:${unix}:D>`;
}

/** Formate une valeur selon le type de variable pour l’aperçu / publication. */
export function formatVarValue(
  value: string,
  type?: VarConfig['type'],
  options?: { discordTimestamp?: boolean }
): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  if (type === 'date') {
    const resolved = resolveStoredDateValue(trimmed);
    if (options?.discordTimestamp) return formatDateDiscordTimestamp(resolved);
    return formatDateForDisplay(resolved);
  }
  return trimmed;
}
