/** Statuts fermés pour le suivi d'œuvres. */
export type WorkStatus =
  | 'ongoing'
  | 'ongoing_paid'
  | 'season_pause'
  | 'completed'
  | 'abandoned';

/** Unité de progression affichée dans le message. */
export type ProgressUnit = 'chapter' | 'volume' | 'hybrid';

/** Types d'œuvre (un seul tag actif). Manhua / Manhwa = variantes régionales du webtoon. */
export type WorkTypeKey =
  | 'webtoon'
  | 'manhua'
  | 'manhwa'
  | 'manga'
  | 'light_novel'
  | 'novel';

export type TemplateCategory = 'translator' | 'work_tracking';

/** Résultat de l'analyse des tags sélectionnés. */
export type ResolvedWorkTracking = {
  status: WorkStatus;
  workType: WorkTypeKey | null;
  workTypeLabel: string;
  statusLabel: string;
  statusEmoji: string;
  isPaid: boolean;
  chapterControlDefault: boolean;
};

/** Ligne Supabase work_publications (sous-ensemble utilisé côté client). */
export type WorkPublicationRow = {
  id?: string;
  published_post_id: string;
  profile_id?: string | null;
  template_id: string;
  title: string;
  genres_themes?: string | null;
  synopsis?: string | null;
  progress_unit: ProgressUnit;
  progress_current?: string | null;
  progress_total?: string | null;
  progress_scan_current?: string | null;
  progress_physical_current?: string | null;
  release_weekdays: number[];
  release_monthly?: boolean;
  date_next_release?: string | null;
  chapter_next_release?: string | null;
  date_series_end?: string | null;
  date_season_end?: string | null;
  season_number?: string | null;
  official_site_label?: string | null;
  official_site_link?: string | null;
  scan_site_label?: string | null;
  scan_site_link?: string | null;
  work_status: WorkStatus;
  work_type?: string | null;
  is_paid: boolean;
  chapter_control_enabled: boolean;
  updated_at?: string;
};
