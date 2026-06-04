/** Préférence locale + historique des noms de site (champ « Site ») en vue Webtoon. */

const LS_RECENT_LABELS = 'webtoon_recent_site_labels';
const LS_PICKER_ENABLED = 'webtoon_site_label_picker_enabled';
const MAX_RECENT = 12;

function readJsonArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(v => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function isWebtoonSiteLabelPickerEnabled(): boolean {
  try {
    return localStorage.getItem(LS_PICKER_ENABLED) === 'true';
  } catch {
    return false;
  }
}

export const WEBTOON_SITE_PICKER_CHANGED = 'webtoon-site-picker-changed';
export const WEBTOON_RECENT_SITES_CHANGED = 'webtoon-recent-sites-changed';

export function setWebtoonSiteLabelPickerEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(LS_PICKER_ENABLED, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent(WEBTOON_SITE_PICKER_CHANGED));
  } catch {
    /* ignore */
  }
}

export function getRecentWebtoonSiteLabels(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of readJsonArray(LS_RECENT_LABELS)) {
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= MAX_RECENT) break;
  }
  return out;
}

/** Ajoute un ou plusieurs libellés en tête de l'historique (sans doublon, casse ignorée). */
export function pushRecentWebtoonSiteLabels(labels: string[]): string[] {
  const incoming = labels.map(l => l.trim()).filter(Boolean);
  if (incoming.length === 0) return getRecentWebtoonSiteLabels();

  const merged: string[] = [];
  const seen = new Set<string>();
  for (const label of [...incoming, ...readJsonArray(LS_RECENT_LABELS)]) {
    const key = label.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(label.trim());
    if (merged.length >= MAX_RECENT) break;
  }

  try {
    localStorage.setItem(LS_RECENT_LABELS, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent(WEBTOON_RECENT_SITES_CHANGED));
  } catch {
    /* ignore */
  }
  return merged;
}
