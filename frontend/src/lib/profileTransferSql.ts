export function generateProfileTransferSql(oldProfileId: string, newProfileId: string): string {
  return `-- =============================================================================
-- Transfert des données applicatives d’un profil Supabase vers un autre UUID
-- =============================================================================
BEGIN;

DO $$
DECLARE
  old_id uuid := '${oldProfileId}';  -- ancien compte (source)
  new_id uuid := '${newProfileId}';  -- nouveau compte (cible)
BEGIN
  IF old_id = new_id THEN
    RAISE EXCEPTION 'old_id et new_id doivent être différents';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = old_id) THEN
    RAISE EXCEPTION 'Profil source introuvable: %', old_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = new_id) THEN
    RAISE EXCEPTION 'Profil cible introuvable: %', new_id;
  END IF;

  DELETE FROM user_collection uc_new
  WHERE uc_new.owner_id = new_id
    AND EXISTS (
      SELECT 1 FROM user_collection uc_old
      WHERE uc_old.owner_id = old_id
        AND uc_old.f95_thread_id IS NOT DISTINCT FROM uc_new.f95_thread_id
    );
  UPDATE user_collection SET owner_id = new_id WHERE owner_id = old_id;

  DELETE FROM owner_data od_new
  WHERE od_new.owner_type = 'profile'
    AND od_new.owner_id = new_id
    AND EXISTS (
      SELECT 1 FROM owner_data od_old
      WHERE od_old.owner_type = 'profile'
        AND od_old.owner_id = old_id
        AND od_old.data_key = od_new.data_key
    );
  UPDATE owner_data
  SET owner_id = new_id
  WHERE owner_type = 'profile'
    AND owner_id = old_id;

  DELETE FROM allowed_editors ae_new
  WHERE ae_new.owner_id = new_id
    AND EXISTS (
      SELECT 1 FROM allowed_editors ae_old
      WHERE ae_old.owner_id = old_id
        AND ae_old.editor_id IS NOT DISTINCT FROM ae_new.editor_id
    );
  UPDATE allowed_editors SET owner_id = new_id WHERE owner_id = old_id;

  DELETE FROM allowed_editors ae_new
  WHERE ae_new.editor_id = new_id
    AND EXISTS (
      SELECT 1 FROM allowed_editors ae_old
      WHERE ae_old.editor_id = old_id
        AND ae_old.owner_id IS NOT DISTINCT FROM ae_new.owner_id
    );
  UPDATE allowed_editors SET editor_id = new_id WHERE editor_id = old_id;

  DELETE FROM translator_forum_mappings WHERE profile_id = new_id;
  UPDATE translator_forum_mappings SET profile_id = new_id WHERE profile_id = old_id;

  UPDATE tags SET profile_id = new_id WHERE profile_id = old_id;

  UPDATE profiles AS p
  SET
    pseudo       = COALESCE(NULLIF(trim(p.pseudo), ''), o.pseudo),
    discord_id   = COALESCE(NULLIF(trim(p.discord_id), ''), o.discord_id),
    is_master_admin = COALESCE(p.is_master_admin, false) OR COALESCE(o.is_master_admin, false),
    list_manager    = COALESCE(p.list_manager, false) OR COALESCE(o.list_manager, false),
    updated_at   = now()
  FROM profiles o
  WHERE p.id = new_id
    AND o.id = old_id;

  DELETE FROM profiles WHERE id = old_id;

  RAISE NOTICE 'Transfert terminé : données déplacées de % vers %', old_id, new_id;
END $$;

COMMIT;`;
}
