-- Date de dernière publication en fin de saison (statut En pause)

ALTER TABLE public.work_publications
  ADD COLUMN IF NOT EXISTS date_season_end text;

COMMENT ON COLUMN public.work_publications.date_season_end IS
  'Dernière publication avant pause de saison — affichée en timestamp Discord.';
