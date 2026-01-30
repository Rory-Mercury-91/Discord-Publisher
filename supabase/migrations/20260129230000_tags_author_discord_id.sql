-- Ajouter l'ID Discord de l'auteur du tag et l'ID du tag côté Discord (optionnels)
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS author_discord_id text NULL,
  ADD COLUMN IF NOT EXISTS discord_tag_id text NULL;

COMMENT ON COLUMN public.tags.author_discord_id IS 'ID Discord de l''utilisateur qui a créé le tag (optionnel)';
COMMENT ON COLUMN public.tags.discord_tag_id IS 'ID du tag côté Discord (forum/channel) pour synchronisation';
