-- RLS : autoriser le rôle authenticated sur app_config, tags, published_posts
-- (quand l'utilisateur est connecté, les requêtes passent en authenticated, pas anon)

CREATE POLICY "app_config_select_authenticated" ON public.app_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "app_config_insert_authenticated" ON public.app_config
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "app_config_update_authenticated" ON public.app_config
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "app_config_delete_authenticated" ON public.app_config
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "tags_select_authenticated" ON public.tags
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tags_insert_authenticated" ON public.tags
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "tags_update_authenticated" ON public.tags
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "tags_delete_authenticated" ON public.tags
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "published_posts_select_authenticated" ON public.published_posts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "published_posts_insert_authenticated" ON public.published_posts
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "published_posts_update_authenticated" ON public.published_posts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "published_posts_delete_authenticated" ON public.published_posts
  FOR DELETE TO authenticated USING (true);

-- Realtime : ajouter les tables à la publication pour synchronisation en direct.
-- Si une table est déjà dans la publication, la commande échouera : activer alors via
-- Dashboard > Database > Replication > supabase_realtime (toggle sur les tables).
ALTER PUBLICATION supabase_realtime ADD TABLE public.tags;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_config;
ALTER PUBLICATION supabase_realtime ADD TABLE public.published_posts;
