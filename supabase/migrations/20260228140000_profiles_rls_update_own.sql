-- Permettre à l'utilisateur connecté de mettre à jour sa propre ligne profiles (list_manager, etc.).
-- Nécessaire pour l'Edge Function validate-list-manager-code qui utilise le JWT utilisateur.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_update_own_row" ON public.profiles;
CREATE POLICY "profiles_update_own_row"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
