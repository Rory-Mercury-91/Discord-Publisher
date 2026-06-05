import { getCalendarLinkParts } from '../calendarTemplate';

import {
  formatDateDiscordTimestampShort,
  formatVarValue,
  resolveStoredDateValue,
} from '../logic/formatVar';

import type { Tag } from '../types';

import { PROGRESS_UNIT_OPTIONS, WORK_WARNING_NOTE } from './registry';

import { hasScanSiteFilled } from './scanSite';

import {

  formatReleaseWeekdaysText,

  parseReleaseWeekdays,

  projectReleaseDateAtChapter,

} from './releaseWeekdays';

import { resolveWorkTrackingFromTags } from './resolveFromTags';

import type { ProgressUnit, WorkStatus } from './types';



function unitLabels(unit: ProgressUnit) {

  return PROGRESS_UNIT_OPTIONS.find(o => o.value === unit) ?? PROGRESS_UNIT_OPTIONS[0];

}



function formatProgressPair(

  labels: { singular: string },

  current: string,

  total: string

): string {

  if (!current) return '';

  if (total) return `${labels.singular} ${current} / ${total}`;

  return `${labels.singular} ${current}`;

}



function parseChapterNumber(raw: string): number | null {

  const trimmed = (raw || '').trim();

  if (!/^\d+$/.test(trimmed)) return null;

  const n = parseInt(trimmed, 10);

  return Number.isFinite(n) ? n : null;

}



function buildProgressLine(

  status: WorkStatus,

  unit: ProgressUnit,

  inputs: Record<string, string>

): string {

  const normalizedUnit = unit === 'hybrid' ? 'chapter' : unit;

  const labels = unitLabels(normalizedUnit);

  const current = (inputs.Progress_Current || inputs.Chapitre_Actuel || '').trim();

  const total = (inputs.Progress_Total || '').trim();

  const season = (inputs.Season_Number || '').trim();



  if (status === 'ongoing_paid') {

    if (!current) return 'Statut actuel : —';

    return `Statut actuel : ${labels.singular} ${current} (Dernier disponible gratuitement)`;

  }



  if (status === 'completed') {

    const end = (inputs.Chapitre_Fin || current || '').trim();

    if (!end) return ':books: **Progression :** Complété';

    const pair = formatProgressPair(labels, end, total && total !== end ? total : '');

    return `:books: **Progression :** Complété (${pair || `${labels.singular} ${end}`})`;

  }



  if (status === 'abandoned') {

    const end = (inputs.Chapitre_Fin || current || '').trim();

    return end

      ? `:books: **Progression :** Arrêtée au ${labels.singular.toLowerCase()} ${end}`

      : ':books: **Progression :** Arrêtée';

  }



  if (status === 'season_pause') {

    const suffix = season ? ` (Fin de Saison ${season})` : ' (Fin de saison)';

    const pair = formatProgressPair(labels, current, total);

    return pair

      ? `:books: **Progression :** ${pair}${suffix}`

      : `:books: **Progression :** En pause${suffix}`;

  }



  if (status === 'ongoing') {

    const pair = formatProgressPair(labels, current, total);

    if (pair) return `:books: **Progression :** ${pair}`;

  }



  return ':books: **Progression :** —';

}



function formatDiscordDate(raw: string): string {

  const resolved = resolveStoredDateValue(raw);

  return formatVarValue(resolved, 'date', { discordTimestamp: true }) || '';

}



function resolvePaidEndDate(inputs: Record<string, string>): string {

  const stored = resolveStoredDateValue(inputs.Date_Fin || '').trim();

  if (stored) return stored;



  const nextChapter = parseChapterNumber(inputs.Chapitre_Suivant || '');

  const plafond = parseChapterNumber(inputs.Progress_Total || '');

  const anchorDate = resolveStoredDateValue(inputs.Date_Suivant || '').trim();

  if (!nextChapter || !plafond || !anchorDate || plafond <= nextChapter) return '';



  const weekdays = parseReleaseWeekdays(inputs.Release_Weekdays);

  const monthly = inputs.Release_Monthly === 'true';

  return (

    projectReleaseDateAtChapter(anchorDate, nextChapter, plafond, weekdays, monthly) || ''

  );

}



function buildReleaseLines(status: WorkStatus, inputs: Record<string, string>): string[] {

  const weekdays = parseReleaseWeekdays(inputs.Release_Weekdays);

  const daysText = formatReleaseWeekdaysText(weekdays);

  const nextDate = formatDiscordDate(inputs.Date_Suivant || '');

  const nextChapter = (inputs.Chapitre_Suivant || '').trim();



  if (status === 'completed' || status === 'abandoned') {

    return [];

  }



  if (status === 'season_pause') {

    const pauseEndDate = formatDateDiscordTimestampShort(inputs.Date_Pause_Fin || '');

    const line = pauseEndDate

      ? `:calendar: **Rythme de sortie :** En pause de fin de saison (Dernière publication le ${pauseEndDate})`

      : ':calendar: **Rythme de sortie :** En pause de fin de saison';

    return [line];

  }



  const monthly = inputs.Release_Monthly === 'true';



  if (status === 'ongoing_paid') {

    const plafondChapter = (inputs.Progress_Total || '').trim();

    const endDateRaw = resolvePaidEndDate(inputs);

    const endDate = endDateRaw ? formatDiscordDate(endDateRaw) : '';



    const lines: string[] = [];

    const hasNext = !!(nextChapter && nextDate);

    const hasEnd = !!(plafondChapter && endDate);



    if (!hasNext && !hasEnd) return [];



    lines.push(':calendar: **Prochaines disponibilités (gratuite)**');

    if (hasNext) {

      lines.push(`* **Prochain chapitre :** ${nextChapter} — ${nextDate}`);

    }

    if (hasEnd) {

      lines.push(`* **Fin des publications connues :** chapitre ${plafondChapter} — ${endDate}`);

    }

    return lines;

  }



  if (daysText && nextDate) {

    return [

      `:calendar: **Rythme de sortie :** Chaque ${daysText}${monthly ? ' du mois' : ''}, prochaine sortie le ${nextDate}`,

    ];

  }

  if (nextChapter && nextDate) {

    return [

      `:calendar: **Prochaine disponibilité :** Chapitre ${nextChapter} le ${nextDate}`,

    ];

  }

  return [];

}



function buildLinksBlock(inputs: Record<string, string>, cleanUrl: (u: string) => string): string {

  const parts = getCalendarLinkParts(inputs)

    .map(p => ({ label: p.label, url: cleanUrl(p.url) }))

    .filter(p => p.url);

  if (parts.length === 0) return '';

  return parts.map(p => `* [${p.label}](<${p.url}>)`).join('\n');

}



export function applyWorkTrackingPreview(params: {

  content: string;

  inputs: Record<string, string>;

  postTags: string;

  savedTags: Tag[];

  cleanUrl: (url: string) => string;

}): string {

  let content = params.content;

  const { inputs, postTags, savedTags, cleanUrl } = params;

  const tagIds = postTags ? postTags.split(',').map(s => s.trim()).filter(Boolean) : [];

  const resolved = resolveWorkTrackingFromTags(tagIds, savedTags);

  const progressUnit = (inputs.Progress_Unit as ProgressUnit) || 'chapter';



  const progressBlock = buildProgressLine(resolved.status, progressUnit, inputs);

  const releaseLines = buildReleaseLines(resolved.status, inputs);

  const releaseBlock = releaseLines.join('\n');

  const linksBlock = buildLinksBlock(inputs, cleanUrl);

  const warningNote = hasScanSiteFilled(inputs) ? WORK_WARNING_NOTE : '';



  content = content

    .split('[Work_Status_Label]').join(resolved.statusLabel)

    .split('[Work_Status_Emoji]').join(resolved.statusEmoji)

    .split('[Work_Type_Label]').join(resolved.workTypeLabel)

    .split('[Genres_Themes]').join((inputs.Genres_Themes || '').trim())

    .split('[WORK_PROGRESS_BLOCK]').join(progressBlock)

    .split('[WORK_RELEASE_BLOCK]').join(releaseBlock)

    .split('[WORK_WARNING_NOTE]').join(warningNote);



  // Discord ne rend pas les séparateurs markdown « --- »
  content = content.replace(/\n---\n/g, '\n\n');
  content = content.replace(/\n?---\s*$/g, '');



  if (!linksBlock) {

    content = content.replace(

      /## :link: \*\*Liens officiels & Plateformes :\*\*\n\[CALENDAR_LINKS_LINE\]\n?/g,

      ''

    );

  } else {

    content = content.replace(

      /## :link: \*\*Liens officiels & Plateformes :\*\*\n\[CALENDAR_LINKS_LINE\]/g,

      `## :link: **Liens officiels & Plateformes :**\n${linksBlock}`

    );

  }



  if (!releaseBlock) {

    content = content.replace(/\n\[WORK_RELEASE_BLOCK\]\n?/g, '\n');

  }



  const genres = (inputs.Genres_Themes || '').trim();

  if (!genres) {

    content = content.replace(

      /:zap: \*\*Genres \/ Thèmes :\*\* \[Genres_Themes\]\n?/g,

      ''

    );

    content = content.replace(/:zap: \*\*Genres \/ Thèmes :\*\*\n?/g, '');

  }



  if (!resolved.workType) {

    content = content.replace(/:label: \*\*Type :\*\* \*\[Work_Type_Label\]\*\n?/g, '');

    content = content.replace(/:label: \*\*Type :\*\* \*\*\n?/g, '');

  }



  const synopsis = (inputs.Synopsis_Oeuvre || '').trim();

  if (!synopsis) {

    content = content.replace(/:pencil: \*\*Synopsis :\*\*\n> \[Synopsis_Oeuvre\]\n?/g, '');

  }



  return content;

}



/** Indique si le template utilise le format suivi d'œuvres (nouveau ou legacy calendar). */

export function isWorkTrackingTemplateType(type: string | null | undefined): boolean {

  return type === 'calendar' || type === 'work_tracking';

}


