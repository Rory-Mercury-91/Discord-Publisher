-- Liens additionnels mod : stockés comme saved_additional_translation_links (array {label, link}).
-- Les labels principaux (Traduction, Mod) restent dans saved_inputs.

ALTER TABLE public.published_posts
  ADD COLUMN IF NOT EXISTS saved_additional_mod_links jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.published_posts.saved_additional_mod_links IS 'Liens additionnels mod (label + link), affichés si mod compatible.';
