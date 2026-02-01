-- Colonne is_archived pour l'onglet Archive de l'historique (synchronisé Supabase)
ALTER TABLE public.published_posts
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.published_posts.is_archived IS 'Post déplacé dans l''onglet Archive de l''historique (frontend).';
