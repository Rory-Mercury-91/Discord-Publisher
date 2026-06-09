import type { ProgressUnit, WorkStatus, WorkTypeKey } from './types';

export const WORK_STATUS_ORDER: WorkStatus[] = [
  'completed',
  'abandoned',
  'season_pause',
  'ongoing_paid',
  'ongoing',
];

export const WORK_STATUS_META: Record<
  WorkStatus,
  { label: string; emoji: string; chapterControlDefault: boolean }
> = {
  ongoing: { label: 'En cours', emoji: ':tada:', chapterControlDefault: true },
  ongoing_paid: { label: 'En cours (incomplet)', emoji: ':money_with_wings:', chapterControlDefault: false },
  season_pause: { label: 'En pause', emoji: ':hourglass:', chapterControlDefault: false },
  completed: { label: 'Terminé', emoji: ':white_check_mark:', chapterControlDefault: false },
  abandoned: { label: 'Abandonnée', emoji: ':x:', chapterControlDefault: false },
};

/** Libellés alignés sur les tags Discord (workType). */
export const WORK_TYPE_META: Record<WorkTypeKey, { label: string; hashtag: string }> = {
  webtoon: { label: 'Webtoon', hashtag: '#Webtoon' },
  manga: { label: 'Manga', hashtag: '#Manga' },
  light_novel: { label: 'Light Novel', hashtag: '#Light Novel' },
  novel: { label: 'Roman', hashtag: '#Roman' },
};

/** Jours de la semaine : 0 = Lundi … 6 = Dimanche (aligné datetime.weekday Python). */
export const WEEKDAY_OPTIONS: { value: number; label: string; short: string }[] = [
  { value: 0, label: 'Lundi', short: 'Lun' },
  { value: 1, label: 'Mardi', short: 'Mar' },
  { value: 2, label: 'Mercredi', short: 'Mer' },
  { value: 3, label: 'Jeudi', short: 'Jeu' },
  { value: 4, label: 'Vendredi', short: 'Ven' },
  { value: 5, label: 'Samedi', short: 'Sam' },
  { value: 6, label: 'Dimanche', short: 'Dim' },
];

export const PROGRESS_UNIT_OPTIONS: { value: ProgressUnit; label: string; singular: string; plural: string }[] = [
  { value: 'chapter', label: 'Chapitres', singular: 'Chapitre', plural: 'Chapitres' },
  { value: 'volume', label: 'Tomes', singular: 'Tome', plural: 'Tomes' },
];

export const WORK_WARNING_NOTE =
  ':warning: **Note :** L\'œuvre n\'étant pas complètement gratuite ou disponible sur la plateforme officielle, vous pouvez retrouver la suite sur le site alternatif mentionné ci-dessus. *(Attention, la qualité de traduction ou d\'image peut varier)*.';

/** Note de bas de bloc « Fin des publications connues » (œuvre incomplète). */
export const WORK_PAID_KNOWN_END_NOTE =
  '* : Cela ne veut pas dire que l\'œuvre est terminée, elle peut être en pause ou abandonnée.';

/** Clés label_key reconnues pour les tags structurés. */
export const WORK_STATUS_LABEL_KEYS: Record<string, WorkStatus> = {
  ongoing: 'ongoing',
  ongoing_paid: 'ongoing_paid',
  season_pause: 'season_pause',
  completed: 'completed',
  abandoned: 'abandoned',
  terminated: 'completed',
  termine: 'completed',
};

export const WORK_TYPE_LABEL_KEYS: Record<string, WorkTypeKey> = {
  webtoon: 'webtoon',
  webcomic: 'webtoon',
  web_comic: 'webtoon',
  manhua: 'webtoon',
  manhwa: 'webtoon',
  manga: 'manga',
  light_novel: 'light_novel',
  lightnovel: 'light_novel',
  novel: 'novel',
  roman: 'novel',
};

/** Tag « Incomplet » = diffusion payante / incomplète sur la plateforme officielle. */
export const PAID_MODIFIER_LABEL_KEYS = new Set(['incomplet', 'incomplete', 'paid', 'payant']);
