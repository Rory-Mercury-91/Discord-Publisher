-- Suppression des colonnes « dernière sortie » (modèle remplacé par ancre + récurrence)

ALTER TABLE public.work_publications
  DROP COLUMN IF EXISTS date_last_release,
  DROP COLUMN IF EXISTS chapter_last_release;
