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

/** Liens officiels + scan (principal + additionnels). */
export function getWorkTrackingLinkParts(
  inputs: Record<string, string>,
  additionalScanLinks: ScanLink[] = []
): CalendarLinkPart[] {
  const parts: CalendarLinkPart[] = [];
  const officialLabel = (inputs.Official_Site_Label || inputs.Book_Platform || '').trim();
  const officialUrl = (inputs.Official_Site_Link || inputs.Book_Link || '').trim();
  if (officialLabel && officialUrl) parts.push({ label: officialLabel, url: officialUrl });

  const scanLabel = (inputs.Scan_Site_Label || '').trim();
  const scanUrl = (inputs.Scan_Site_Link || '').trim();
  if (scanLabel && scanUrl) parts.push({ label: scanLabel, url: scanUrl });

  const extras =
    additionalScanLinks.length > 0
      ? additionalScanLinks
      : parseAdditionalScanLinks(inputs[ADDITIONAL_SCAN_LINKS_INPUT_KEY]);

  for (const entry of extras) {
    const label = (entry.label || '').trim();
    const url = (entry.link || '').trim();
    if (label && url) parts.push({ label, url });
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
