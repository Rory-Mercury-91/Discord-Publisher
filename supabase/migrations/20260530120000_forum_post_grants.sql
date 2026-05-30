-- Autorisations de publication par salon forum (en plus du master admin)
CREATE TABLE IF NOT EXISTS public.forum_post_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  forum_channel_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  granted_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT forum_post_grants_profile_forum_unique UNIQUE (profile_id, forum_channel_id)
);

CREATE INDEX IF NOT EXISTS forum_post_grants_profile_id_idx
  ON public.forum_post_grants(profile_id);

CREATE INDEX IF NOT EXISTS forum_post_grants_forum_channel_id_idx
  ON public.forum_post_grants(forum_channel_id);

ALTER TABLE public.forum_post_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS forum_post_grants_select_own ON public.forum_post_grants;
CREATE POLICY forum_post_grants_select_own
  ON public.forum_post_grants
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

COMMENT ON TABLE public.forum_post_grants IS
  'Autorise un profil à publier sur un salon forum Discord donné (hors master admin).';
