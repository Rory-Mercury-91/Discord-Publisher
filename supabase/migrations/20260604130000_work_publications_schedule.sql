-- Plafond Incomplet : date de fin partie gratuite + mode mensuel

ALTER TABLE public.work_publications
  ADD COLUMN IF NOT EXISTS date_series_end text,
  ADD COLUMN IF NOT EXISTS release_monthly boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.work_publications.date_series_end IS
  'Date de fin de la partie gratuite (tag Incomplet) — ancre + récurrence jusqu''au plafond.';

COMMENT ON COLUMN public.work_publications.release_monthly IS
  'Fréquence mensuelle (true) ou hebdomadaire (false) pour les jours de sortie.';
