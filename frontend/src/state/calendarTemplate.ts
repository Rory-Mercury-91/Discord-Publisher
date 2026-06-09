import { resolveStoredDateValue } from './logic/formatVar';
import { resolveLegacyWebtoonStatusFromTags } from './workTracking/resolveFromTags';
import type { PublishedPost, Template, VarConfig } from './types';

export const CALENDAR_TEMPLATE_ID = 'calendar';

/** Post historique créé avec le template Webtoon / calendrier. */
export function isCalendarPublishedPost(post: PublishedPost | null | undefined): boolean {
  if (!post) return false;
  if (post.publicationCategory === 'work_tracking') return true;
  if (post.templateId === CALENDAR_TEMPLATE_ID) return true;
  const inputs = post.savedInputs ?? {};
  const hasCalendarFields = !!(
    (inputs.Nom_Oeuvre || '').trim() ||
    (inputs.Chapitre_Actuel || '').trim() ||
    hasCalendarLinks(inputs)
  );
  const hasGameFields = !!(
    (inputs.Game_name || '').trim() ||
    (inputs.Game_link || '').trim()
  );
  return hasCalendarFields && !hasGameFields;
}
export const WEBTOON_PUBLISH_LABEL = 'Webtoon';

/** @deprecated Utiliser WorkStatus depuis workTracking — conservé pour rétrocompat. */
export type WebtoonWorkStatus = 'ongoing' | 'terminated' | 'abandoned';

export { normalizeWorkTagName as normalizeWebtoonTagName } from './workTracking/normalizeTagName';

/** Rétrocompat éditeur / validation (terminated = terminé). */
export function getWebtoonWorkStatusFromTags(
  selectedTagIds: string[],
  savedTags: Parameters<typeof resolveLegacyWebtoonStatusFromTags>[1]
): WebtoonWorkStatus {
  return resolveLegacyWebtoonStatusFromTags(selectedTagIds, savedTags);
}

/** Template intégré « mise à jour calendrier » (vue Webtoon). */
export const calendarTemplate: Template = {
  id: CALENDAR_TEMPLATE_ID,
  name: 'Suivi d\'œuvres',
  type: 'calendar',
  category: 'work_tracking',
  isDefault: true,
  isBuiltin: true,
  content: `## **Informations générales :**
:dart: **Statut :** *[Work_Status_Label] [Work_Status_Emoji]*
:label: **Type :** *[Work_Type_Label]*
:zap: **Genres / Thèmes :** [Genres_Themes]
:pencil: **Synopsis :**
> [Synopsis_Oeuvre]

## :chart_with_upwards_trend: **Suivi de publication :**
[WORK_PROGRESS_BLOCK]
[WORK_RELEASE_BLOCK]

## :link: **Liens officiels & Plateformes :**
[CALENDAR_LINKS_LINE]

[WORK_WARNING_NOTE]`,
};

export const calendarVarsConfig: VarConfig[] = [
  { name: 'Nom_Oeuvre', label: "Nom de l'œuvre", placeholder: 'Titre de la série' },
  { name: 'Genres_Themes', label: 'Genres / Thèmes', placeholder: 'Action - Fantastique - Romance' },
  { name: 'Progress_Unit', label: 'Unité de progression', placeholder: 'chapter' },
  { name: 'Progress_Current', label: 'Progression actuelle', placeholder: 'ex: 45' },
  { name: 'Progress_Total', label: 'Plafond / total connu', placeholder: 'ex: 120' },
  { name: 'Progress_Scan_Current', label: 'Scan actuel', placeholder: 'ex: 45' },
  { name: 'Progress_Physical_Current', label: 'Tome physique actuel', placeholder: 'ex: 3' },
  { name: 'Release_Weekdays', label: 'Jours de sortie', placeholder: '0,2,4' },
  { name: 'Release_Monthly', label: 'Fréquence mensuelle', placeholder: 'false' },
  { name: 'Date_Pause_Fin', label: 'Date fin de saison', type: 'date' },
  { name: 'Chapter_Control_Enabled', label: 'Contrôle de chapitre', placeholder: 'true' },
  { name: 'Season_Number', label: 'Numéro de saison', placeholder: 'ex: 2' },
  { name: 'Chapitre_Actuel', label: 'Chapitre actuel', placeholder: 'ex: 45' },
  { name: 'Chapitre_Suivant', label: 'Prochain chapitre', placeholder: 'ex: 46' },
  { name: 'Date_Suivant', label: 'Date prochaine sortie gratuite', type: 'date' },
  { name: 'Chapitre_Fin', label: 'Dernier chapitre', placeholder: 'ex: 120' },
  { name: 'Date_Fin', label: 'Date fin de série', type: 'date' },
  { name: 'Official_Site_Label', label: 'Site', placeholder: 'Webtoon, Tapas…' },
  { name: 'Official_Site_Link', label: 'Lien', placeholder: 'https://...' },
  { name: 'Scan_Site_Label', label: 'Site', placeholder: 'Scan VF, Flame…' },
  { name: 'Scan_Site_Link', label: 'Lien', placeholder: 'https://...' },
  { name: 'Synopsis_Oeuvre', label: 'Synopsis', type: 'textarea', placeholder: 'Résumé de la série…' },
];

export type CalendarLinkPart = { label: string; url: string };

/** Liens affichables (label + URL requis pour chaque entrée). */
export function getCalendarLinkParts(inputs: Record<string, string>): CalendarLinkPart[] {
  const parts: CalendarLinkPart[] = [];
  const officialLabel = (inputs['Official_Site_Label'] || inputs['Book_Platform'] || '').trim();
  const officialUrl = (inputs['Official_Site_Link'] || inputs['Book_Link'] || '').trim();
  if (officialLabel && officialUrl) parts.push({ label: officialLabel, url: officialUrl });

  const scanLabel = (inputs['Scan_Site_Label'] || '').trim();
  const scanUrl = (inputs['Scan_Site_Link'] || '').trim();
  if (scanLabel && scanUrl) parts.push({ label: scanLabel, url: scanUrl });

  return parts;
}

export function hasCalendarLinks(inputs: Record<string, string>): boolean {
  return getCalendarLinkParts(inputs).length > 0;
}

/** Anciens noms de variables → nouveaux (rétrocompatibilité savedInputs). */
const LEGACY_VAR_ALIASES: Record<string, string> = {
  Dernier_Chapitre_Actuel: 'Chapitre_Actuel',
  Lien_Oeuvre: 'Book_Link',
};

/** Migration explicite des anciens champs livre → site officiel (posts historiques uniquement). */
export function migrateLegacyBookFields(inputs: Record<string, string>): Record<string, string> {
  const next = { ...inputs };
  if (!next.Official_Site_Label?.trim() && next.Book_Platform?.trim()) {
    next.Official_Site_Label = next.Book_Platform;
  }
  if (!next.Official_Site_Link?.trim() && next.Book_Link?.trim()) {
    next.Official_Site_Link = next.Book_Link;
  }
  return next;
}

export function migrateCalendarInputs(inputs: Record<string, string>): Record<string, string> {
  const next = { ...inputs };
  for (const [oldKey, newKey] of Object.entries(LEGACY_VAR_ALIASES)) {
    if (next[oldKey] && !next[newKey]) next[newKey] = next[oldKey];
  }
  return next;
}

/** Calendrier en premier = template par défaut dans la vue Webtoon. */
export function buildEffectiveTemplates(userTemplates: Template[], showCalendar: boolean): Template[] {
  const base = userTemplates.filter(t => t.id !== CALENDAR_TEMPLATE_ID);
  if (!showCalendar) return base;
  return [calendarTemplate, ...base];
}

export function getCalendarTemplateIndex(templates: Template[]): number {
  const idx = templates.findIndex(t => t.id === CALENDAR_TEMPLATE_ID);
  return idx >= 0 ? idx : 0;
}

/** Template par défaut de la vue traduction (« Mes traductions »). */
export function getDefaultTranslationTemplateIndex(templates: Template[]): number {
  const myIdx = templates.findIndex(t => t.id === 'my' || (t.type === 'my' && t.isDefault));
  if (myIdx >= 0) return myIdx;
  const fallback = templates.findIndex(
    t => t.id !== CALENDAR_TEMPLATE_ID && t.type !== 'calendar' && !t.isBuiltin
  );
  return fallback >= 0 ? fallback : 0;
}

export function mergeCalendarVarsConfig(vars: VarConfig[], showCalendar: boolean): VarConfig[] {
  if (!showCalendar) return vars;
  const names = new Set(vars.map(v => v.name));
  const extra = calendarVarsConfig.filter(v => !names.has(v.name));
  return extra.length > 0 ? [...vars, ...extra] : vars;
}

export function ensureCalendarInputs(inputs: Record<string, string>): Record<string, string> {
  const next = migrateCalendarInputs({ ...inputs });
  delete next.Book_Platform;
  delete next.Book_Link;
  delete next.Chapitre_Derniere_Sortie;
  delete next.Date_Derniere_Sortie;
  for (const v of calendarVarsConfig) {
    if (next[v.name] === undefined) next[v.name] = '';
    if (v.type === 'date' && next[v.name]) {
      next[v.name] = resolveStoredDateValue(next[v.name]);
    }
  }
  return next;
}

/** Prochain chapitre = chapitre actuel + 1 (si numérique entier). */
export function computeNextChapter(current: string): string {
  const trimmed = (current || '').trim();
  if (!trimmed) return '';
  if (/^\d+$/.test(trimmed)) return String(parseInt(trimmed, 10) + 1);
  return trimmed;
}
