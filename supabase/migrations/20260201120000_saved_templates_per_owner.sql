-- Templates sauvegardés par utilisateur (propre à l'utilisateur connecté).
-- Même logique que saved_instructions : un row par owner, sync et realtime par utilisateur.

CREATE TABLE IF NOT EXISTS public.saved_templates (
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  value jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id)
);

ALTER TABLE public.saved_templates ENABLE ROW LEVEL SECURITY;

-- Lecture / écriture : uniquement le propriétaire (pas de partage via allowed_editors pour les templates)
CREATE POLICY "saved_templates_select_own" ON public.saved_templates
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);

CREATE POLICY "saved_templates_insert_own" ON public.saved_templates
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "saved_templates_update_own" ON public.saved_templates
  FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "saved_templates_delete_own" ON public.saved_templates
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- Realtime : synchronisation en direct
ALTER PUBLICATION supabase_realtime ADD TABLE public.saved_templates;
