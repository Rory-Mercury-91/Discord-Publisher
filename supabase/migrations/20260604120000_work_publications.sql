-- Suivi d'œuvres (Webtoon / Manga / LN…) — table dédiée + lien published_posts

DO $$ BEGIN
  CREATE TYPE public.work_status_enum AS ENUM (
    'ongoing',
    'ongoing_paid',
    'season_pause',
    'completed',
    'abandoned'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.progress_unit_enum AS ENUM ('chapter', 'volume', 'hybrid');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.publication_category_enum AS ENUM ('translator', 'work_tracking');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.work_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  published_post_id text UNIQUE REFERENCES public.published_posts(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  template_id text NOT NULL DEFAULT 'calendar',
  title text NOT NULL DEFAULT '',
  genres_themes text,
  synopsis text,
  progress_unit public.progress_unit_enum NOT NULL DEFAULT 'chapter',
  progress_current text,
  progress_total text,
  progress_scan_current text,
  progress_physical_current text,
  release_weekdays smallint[] NOT NULL DEFAULT '{}',
  date_next_release text,
  chapter_next_release text,
  date_last_release text,
  chapter_last_release text,
  season_number text,
  official_site_label text,
  official_site_link text,
  scan_site_label text,
  scan_site_link text,
  work_status public.work_status_enum NOT NULL DEFAULT 'ongoing',
  work_type text,
  is_paid boolean NOT NULL DEFAULT false,
  chapter_control_enabled boolean NOT NULL DEFAULT true,
  last_paid_alert_at timestamptz,
  last_auto_refresh_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_publications_profile_id_idx
  ON public.work_publications(profile_id);

CREATE INDEX IF NOT EXISTS work_publications_work_status_idx
  ON public.work_publications(work_status);

CREATE INDEX IF NOT EXISTS work_publications_chapter_control_idx
  ON public.work_publications(chapter_control_enabled)
  WHERE chapter_control_enabled = true;

ALTER TABLE public.published_posts
  ADD COLUMN IF NOT EXISTS publication_category public.publication_category_enum,
  ADD COLUMN IF NOT EXISTS work_publication_id uuid REFERENCES public.work_publications(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.work_publication_refresh_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_publication_id uuid NOT NULL REFERENCES public.work_publications(id) ON DELETE CASCADE,
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_publication_refresh_log_wp_id_idx
  ON public.work_publication_refresh_log(work_publication_id);

ALTER TABLE public.work_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_publication_refresh_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_publications_select_own ON public.work_publications;
CREATE POLICY work_publications_select_own
  ON public.work_publications
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS work_publications_insert_own ON public.work_publications;
CREATE POLICY work_publications_insert_own
  ON public.work_publications
  FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS work_publications_update_own ON public.work_publications;
CREATE POLICY work_publications_update_own
  ON public.work_publications
  FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS work_publications_delete_own ON public.work_publications;
CREATE POLICY work_publications_delete_own
  ON public.work_publications
  FOR DELETE
  TO authenticated
  USING (profile_id = auth.uid());

COMMENT ON TABLE public.work_publications IS
  'Métadonnées structurées des publications suivi d''œuvres (Webtoon, Manga, LN…).';
