import { getSupabase } from '../../lib/supabase';
import { rowToPost } from '../logic/history';
import type { PublishedPost } from '../types';

/** Charge la dernière version d'un post depuis Supabase (saved_inputs à jour après refresh bot). */
export async function fetchPublishedPostById(id: string): Promise<PublishedPost | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('published_posts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return rowToPost(data as Record<string, unknown>);
}
