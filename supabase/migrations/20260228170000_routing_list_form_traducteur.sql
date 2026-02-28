-- Concordance formulaire : pour chaque ligne du routing (profil ou externe),
-- on stocke la valeur à envoyer pour le champ "traducteur" à l'export liste.
-- Les options proviennent de la colonne traducteur de la table f95_jeux (tableur).

ALTER TABLE public.translator_forum_mappings
  ADD COLUMN IF NOT EXISTS list_form_traducteur text;

ALTER TABLE public.external_translators
  ADD COLUMN IF NOT EXISTS list_form_traducteur text;

COMMENT ON COLUMN public.translator_forum_mappings.list_form_traducteur IS 'Valeur envoyée à l''export liste pour le champ traducteur (doit correspondre à une valeur de f95_jeux.traducteur).';
COMMENT ON COLUMN public.external_translators.list_form_traducteur IS 'Valeur envoyée à l''export liste pour le champ traducteur (doit correspondre à une valeur de f95_jeux.traducteur).';
