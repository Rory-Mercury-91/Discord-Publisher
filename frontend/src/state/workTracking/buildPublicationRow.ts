import type { Tag } from '../types';
import { resolveStoredDateValue } from '../logic/formatVar';
import { parseReleaseWeekdays } from './releaseWeekdays';
import { resolveWorkTrackingFromTags } from './resolveFromTags';
import type { ProgressUnit, WorkPublicationRow } from './types';

function parseProgressUnit(raw: string | undefined): ProgressUnit {
  if (raw === 'volume' || raw === 'hybrid') return raw;
  return 'chapter';
}

function parseBool(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw === '') return defaultValue;
  return raw === 'true' || raw === '1' || raw === 'oui';
}

/** Construit une ligne work_publications depuis les inputs formulaire. */
export function buildWorkPublicationRow(params: {
  publishedPostId: string;
  profileId?: string | null;
  templateId: string;
  inputs: Record<string, string>;
  selectedTagIds: string[];
  savedTags: Tag[];
}): WorkPublicationRow {
  const { publishedPostId, profileId, templateId, inputs, selectedTagIds, savedTags } = params;
  const resolved = resolveWorkTrackingFromTags(selectedTagIds, savedTags);
  const progressUnit = parseProgressUnit(inputs.Progress_Unit);
  const chapterControlEnabled = parseBool(
    inputs.Chapter_Control_Enabled,
    resolved.chapterControlDefault
  );

  const progressCurrent =
    (inputs.Progress_Current || inputs.Chapitre_Actuel || '').trim() || null;
  const progressTotal = (inputs.Progress_Total || '').trim() || null;

  return {
    published_post_id: publishedPostId,
    profile_id: profileId ?? null,
    template_id: templateId,
    title: (inputs.Nom_Oeuvre || '').trim(),
    genres_themes: (inputs.Genres_Themes || '').trim() || null,
    synopsis: (inputs.Synopsis_Oeuvre || '').trim() || null,
    progress_unit: progressUnit,
    progress_current: progressCurrent,
    progress_total: progressTotal,
    progress_scan_current: (inputs.Progress_Scan_Current || inputs.Chapitre_Actuel || '').trim() || null,
    progress_physical_current: (inputs.Progress_Physical_Current || '').trim() || null,
    release_weekdays: parseReleaseWeekdays(inputs.Release_Weekdays),
    release_monthly: inputs.Release_Monthly === 'true',
    date_next_release: resolveStoredDateValue(inputs.Date_Suivant || '') || null,
    chapter_next_release: (inputs.Chapitre_Suivant || '').trim() || null,
    date_series_end: resolveStoredDateValue(inputs.Date_Fin || '') || null,
    date_season_end: resolveStoredDateValue(inputs.Date_Pause_Fin || '') || null,
    season_number: (inputs.Season_Number || '').trim() || null,
    official_site_label: (inputs.Official_Site_Label || '').trim() || null,
    official_site_link: (inputs.Official_Site_Link || '').trim() || null,
    scan_site_label: (inputs.Scan_Site_Label || '').trim() || null,
    scan_site_link: (inputs.Scan_Site_Link || '').trim() || null,
    work_status: resolved.status,
    work_type: resolved.workType,
    is_paid: resolved.isPaid,
    chapter_control_enabled: chapterControlEnabled,
  };
}
