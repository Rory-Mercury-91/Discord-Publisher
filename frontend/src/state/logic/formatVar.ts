import type { VarConfig } from '../types';

/** Affichage FR pour les champs date (input type=date → AAAA-MM-JJ). */
export function formatDateForDisplay(isoDate: string): string {
  const trimmed = (isoDate || '').trim();
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return trimmed;
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
  const unix = isoDateToUnixSeconds(isoDate);
  if (unix === null) return formatDateForDisplay(isoDate);
  return `<t:${unix}:D> (<t:${unix}:R>)`;
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
    if (options?.discordTimestamp) return formatDateDiscordTimestamp(trimmed);
    return formatDateForDisplay(trimmed);
  }
  return trimmed;
}
