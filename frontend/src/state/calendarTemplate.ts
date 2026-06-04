import type { PublishedPost, Template, VarConfig } from './types';

export const CALENDAR_TEMPLATE_ID = 'calendar';

/** Post historique créé avec le template Webtoon / calendrier. */
export function isCalendarPublishedPost(post: PublishedPost | null | undefined): boolean {
  if (!post) return false;
  if (post.templateId === CALENDAR_TEMPLATE_ID) return true;
  const inputs = post.savedInputs ?? {};
  const hasCalendarFields = !!(
    (inputs.Nom_Oeuvre || '').trim() ||
    (inputs.Chapitre_Actuel || '').trim() ||
    (inputs.Book_Link || '').trim()
  );
  const hasGameFields = !!(
    (inputs.Game_name || '').trim() ||
    (inputs.Game_link || '').trim()
  );
  return hasCalendarFields && !hasGameFields;
}
export const WEBTOON_PUBLISH_LABEL = 'Webtoon';

/** Template intégré « mise à jour calendrier » (vue Webtoon). */
export const calendarTemplate: Template = {
  id: CALENDAR_TEMPLATE_ID,
  name: 'Webtoon',
  type: 'calendar',
  isDefault: true,
  isBuiltin: true,
  content: `:book: **[Nom_Oeuvre]** : Calendrier de mise à jour (gratuite) ! :tada:

Statut actuel : Chapitre [Chapitre_Actuel] (Dernier disponible gratuitement)

:calendar: **Prochaines disponibilités**
* **Prochain chapitre :** [Chapitre_Suivant] — [Date_Suivant]
* **Fin de série :** chapitre [Chapitre_Fin] — [Date_Fin]

:link: **Lien officiel**
* [[Book_Platform]](<[Book_Link]>)

**Synopsis :**
> [Synopsis_Oeuvre]`,
};

export const calendarVarsConfig: VarConfig[] = [
  { name: 'Nom_Oeuvre', label: "Nom de l'œuvre", placeholder: 'Titre de la série' },
  { name: 'Chapitre_Actuel', label: 'Chapitre actuel', placeholder: 'ex: 45' },
  { name: 'Chapitre_Suivant', label: 'Prochain chapitre', placeholder: 'ex: 46' },
  { name: 'Date_Suivant', label: 'Date prochaine dispo.', type: 'date' },
  { name: 'Chapitre_Fin', label: 'Dernier chapitre', placeholder: 'ex: 120' },
  { name: 'Date_Fin', label: 'Date fin de série', type: 'date' },
  { name: 'Book_Platform', label: 'Site / plateforme', placeholder: 'Webtoon, Tapas…' },
  { name: 'Book_Link', label: "Lien de l'œuvre", placeholder: 'https://...' },
  { name: 'Synopsis_Oeuvre', label: 'Synopsis', type: 'textarea', placeholder: 'Résumé de la série…' },
];

/** Anciens noms de variables → nouveaux (rétrocompatibilité savedInputs). */
const LEGACY_VAR_ALIASES: Record<string, string> = {
  Dernier_Chapitre_Actuel: 'Chapitre_Actuel',
  Lien_Oeuvre: 'Book_Link',
};

export function migrateCalendarInputs(inputs: Record<string, string>): Record<string, string> {
  const next = { ...inputs };
  for (const [oldKey, newKey] of Object.entries(LEGACY_VAR_ALIASES)) {
    if (next[oldKey] && !next[newKey]) next[newKey] = next[oldKey];
  }
  if (!next.Book_Platform?.trim()) next.Book_Platform = 'Webtoon';
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
  for (const v of calendarVarsConfig) {
    if (next[v.name] === undefined) next[v.name] = '';
  }
  if (!next.Book_Platform?.trim()) next.Book_Platform = 'Webtoon';
  return next;
}

/** Prochain chapitre = chapitre actuel + 1 (si numérique entier). */
export function computeNextChapter(current: string): string {
  const trimmed = (current || '').trim();
  if (!trimmed) return '';
  if (/^\d+$/.test(trimmed)) return String(parseInt(trimmed, 10) + 1);
  return trimmed;
}
