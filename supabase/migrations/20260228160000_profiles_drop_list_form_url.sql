-- L'URL du formulaire liste est désormais dans app_config (list_form_url), gérée par l'admin.
-- Suppression de la colonne inutilisée sur profiles.

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS list_form_url;
