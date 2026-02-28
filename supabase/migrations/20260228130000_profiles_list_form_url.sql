-- Droit List_manager + URL du formulaire liste (onglet Formulaire liste, déblocage via code dans Mon compte).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS list_manager boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS list_form_url text;

COMMENT ON COLUMN public.profiles.list_manager IS 'Si true, l''utilisateur voit l''onglet Formulaire liste et peut utiliser Exporter. Débloqué via code dans Configuration → Mon compte.';
COMMENT ON COLUMN public.profiles.list_form_url IS 'URL du formulaire (ex. Google) affichée dans l''onglet Formulaire liste. Renseignée dans Configuration → Mon compte.';
