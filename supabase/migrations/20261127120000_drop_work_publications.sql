-- Retrait du suivi d'œuvres (Webtoon / Manhwa / calendrier)

DELETE FROM public.app_config
WHERE key IN ('calendar_forum_channel_id', 'work_tracking_last_digest_date');

UPDATE public.owner_data
SET value = (value - 'show_calendar_template' - 'calendar_forum_channel_id')
WHERE data_key = 'preferences'
  AND jsonb_typeof(value) = 'object'
  AND value ?| ARRAY['show_calendar_template', 'calendar_forum_channel_id'];

ALTER TABLE IF EXISTS public.published_posts
  DROP CONSTRAINT IF EXISTS published_posts_work_publication_id_fkey;

ALTER TABLE IF EXISTS public.published_posts
  DROP COLUMN IF EXISTS work_publication_id,
  DROP COLUMN IF EXISTS publication_category;

DROP TABLE IF EXISTS public.work_publication_refresh_log CASCADE;
DROP TABLE IF EXISTS public.work_publications CASCADE;

DROP TYPE IF EXISTS public.work_status_enum CASCADE;
DROP TYPE IF EXISTS public.progress_unit_enum CASCADE;
DROP TYPE IF EXISTS public.publication_category_enum CASCADE;
