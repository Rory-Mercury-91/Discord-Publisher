import type { CalendarLinkPart } from '../calendarTemplate';
import { buildSavedInputsForPublish } from '../logic/postPublishFlags';
import type { AdditionalTranslationLink } from '../types';

export type ScanLink = AdditionalTranslationLink;

/** Clé saved_inputs pour les liens scan additionnels (JSON). */
export const ADDITIONAL_SCAN_LINKS_INPUT_KEY = 'Additional_Scan_Links';

export function parseAdditionalScanLinks(raw: string | undefined): ScanLink[] {
  const trimmed = (raw || '').trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is ScanLink => !!item && typeof item === 'object')
      .map(item => ({
        label: String((item as ScanLink).label || '').trim(),
        link: String((item as ScanLink).link || '').trim(),
      }))
      .filter(item => item.label || item.link);
  } catch {
    return [];
  }
}

export function serializeAdditionalScanLinks(links: ScanLink[]): string {
  const cleaned = links
    .map(l => ({ label: (l.label || '').trim(), link: (l.link || '').trim() }))
    .filter(l => l.label || l.link);
  return cleaned.length > 0 ? JSON.stringify(cleaned) : '';
}

function normalizeLinkUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/$/, '');
}

/** Liens officiels + scan (principal + additionnels, sans doublon d'URL). */
export function getWorkTrackingLinkParts(
  inputs: Record<string, string>,
  additionalScanLinks: ScanLink[] = []
): CalendarLinkPart[] {
  const parts: CalendarLinkPart[] = [];
  const seenUrls = new Set<string>();

  const push = (label: string, url: string) => {
    const cleanLabel = label.trim();
    const cleanUrl = url.trim();
    if (!cleanLabel || !cleanUrl) return;
    const key = normalizeLinkUrl(cleanUrl);
    if (seenUrls.has(key)) return;
    seenUrls.add(key);
    parts.push({ label: cleanLabel, url: cleanUrl });
  };

  push(
    inputs.Official_Site_Label || inputs.Book_Platform || '',
    inputs.Official_Site_Link || inputs.Book_Link || ''
  );

  push(inputs.Scan_Site_Label || '', inputs.Scan_Site_Link || '');

  const extras =
    additionalScanLinks.length > 0
      ? additionalScanLinks
      : parseAdditionalScanLinks(inputs[ADDITIONAL_SCAN_LINKS_INPUT_KEY]);

  for (const entry of extras) {
    push(entry.label || '', entry.link || '');
  }

  return parts;
}

export function hasAnyScanLink(
  inputs: Record<string, string>,
  additionalScanLinks: ScanLink[] = []
): boolean {
  const main = (inputs.Scan_Site_Label || '').trim() && (inputs.Scan_Site_Link || '').trim();
  if (main) return true;
  const extra = [...additionalScanLinks, ...parseAdditionalScanLinks(inputs[ADDITIONAL_SCAN_LINKS_INPUT_KEY])];
  return extra.some(l => (l.label || '').trim() && (l.link || '').trim());
}

/** Inputs historique suivi d'œuvres : flag version + liens scan additionnels sérialisés. */
export function buildCalendarSavedInputs(
  inputs: Record<string, string>,
  additionalScanLinks: ScanLink[],
  skipVersionControl: boolean
): Record<string, string> {
  const base = buildSavedInputsForPublish(inputs, skipVersionControl);
  const serialized = serializeAdditionalScanLinks(additionalScanLinks);
  if (!serialized) {
    const { [ADDITIONAL_SCAN_LINKS_INPUT_KEY]: _removed, ...rest } = base;
    return rest;
  }
  return { ...base, [ADDITIONAL_SCAN_LINKS_INPUT_KEY]: serialized };
}
