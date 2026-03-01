import { useCallback } from 'react';
import { getSupabase } from '../../lib/supabase';

/** Callbacks appelés après vidage Supabase pour réinitialiser l’état local. */
export type ClearAllAppDataCallbacks = {
  onClearPublishedPosts: () => void;
  onClearInstructions: () => void;
  onClearInstructionOwners: () => void;
};

/** Retourne une fonction qui vide les données Supabase (published_posts, tags, app_config, etc.) et appelle les callbacks fournis. */
export function useClearAllAppData(callbacks: ClearAllAppDataCallbacks) {
  const { onClearPublishedPosts, onClearInstructions, onClearInstructionOwners } = callbacks;

  return useCallback(
    async (ownerId?: string): Promise<{ ok: boolean; error?: string }> => {
      const sb = getSupabase();
      try {
        if (sb) {
          const { data: postRows } = await sb.from('published_posts').select('id');
          const postIds = (postRows ?? []).map((r: { id: string }) => r.id);
          if (postIds.length > 0) {
            await sb.from('published_posts').delete().in('id', postIds);
          }
          const { data: tagRows } = await sb.from('tags').select('id');
          const tagIds = (tagRows ?? []).map((r: { id: string }) => r.id);
          if (tagIds.length > 0) {
            await sb.from('tags').delete().in('id', tagIds);
          }
          const { data: configRows } = await sb.from('app_config').select('key');
          const configKeys = (configRows ?? []).map((r: { key: string }) => r.key);
          if (configKeys.length > 0) {
            await sb.from('app_config').delete().in('key', configKeys);
          }
          if (ownerId) {
            await sb.from('allowed_editors').delete().eq('owner_id', ownerId);
            await sb.from('saved_instructions').delete().eq('owner_type', 'profile').eq('owner_id', ownerId);
            await sb.from('saved_templates').delete().eq('owner_id', ownerId);
          }
        }
        onClearPublishedPosts();
        onClearInstructions();
        onClearInstructionOwners();
        return { ok: true };
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return { ok: false, error: message };
      }
    },
    [onClearPublishedPosts, onClearInstructions, onClearInstructionOwners]
  );
}
