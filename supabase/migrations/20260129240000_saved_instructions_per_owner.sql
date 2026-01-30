-- Instructions sauvegardées par auteur : visibles uniquement par l'auteur et les éditeurs autorisés (allowed_editors).

CREATE TABLE IF NOT EXISTS public.saved_instructions (
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id)
);

ALTER TABLE public.saved_instructions ENABLE ROW LEVEL SECURITY;

-- Lecture : l'auteur ou un éditeur autorisé par l'auteur
CREATE POLICY "saved_instructions_select_own_or_allowed" ON public.saved_instructions
  FOR SELECT TO authenticated
  USING (
    auth.uid() = owner_id
    OR owner_id IN (SELECT ae.owner_id FROM public.allowed_editors ae WHERE ae.editor_id = auth.uid())
  );

-- Écriture : uniquement l'auteur (propriétaire)
CREATE POLICY "saved_instructions_insert_own" ON public.saved_instructions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "saved_instructions_update_own" ON public.saved_instructions
  FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "saved_instructions_delete_own" ON public.saved_instructions
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- Realtime : synchronisation en direct
ALTER PUBLICATION supabase_realtime ADD TABLE public.saved_instructions;
