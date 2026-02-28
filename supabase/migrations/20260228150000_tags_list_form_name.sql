-- Nom pour le formulaire liste / tableur : correspondance traducteur app → nom attendu à l'export.
-- Si renseigné, utilisé dans l'export liste à la place du nom du tag.

ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS list_form_name text;

COMMENT ON COLUMN public.tags.list_form_name IS 'Nom utilisé à l''export formulaire liste (tableur) pour ce tag traducteur ; si vide, le nom du tag est utilisé.';
