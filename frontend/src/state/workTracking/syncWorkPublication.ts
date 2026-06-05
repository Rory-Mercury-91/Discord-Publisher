import { getSupabase } from '../../lib/supabase';
import type { Tag } from '../types';
import { buildWorkPublicationRow } from './buildPublicationRow';

/** Upsert work_publications + lien published_posts après publication suivi d'œuvres. */
export async function syncWorkPublicationToSupabase(params: {
  publishedPostId: string;
  profileId?: string | null;
  templateId: string;
  inputs: Record<string, string>;
  selectedTagIds: string[];
  savedTags: Tag[];
}): Promise<{ ok: boolean; workPublicationId?: string; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase indisponible' };

  const row = buildWorkPublicationRow(params);
  const now = new Date().toISOString();

  try {
    const { data: existing } = await sb
      .from('work_publications')
      .select('id')
      .eq('published_post_id', params.publishedPostId)
      .maybeSingle();

    const payload = {
      ...row,
      release_weekdays: row.release_weekdays,
      updated_at: now,
    };

    let workPublicationId: string;

    if (existing?.id) {
      const { error } = await sb
        .from('work_publications')
        .update(payload)
        .eq('id', existing.id);
      if (error) return { ok: false, error: error.message };
      workPublicationId = existing.id;
    } else {
      const { data, error } = await sb
        .from('work_publications')
        .insert({ ...payload, created_at: now })
        .select('id')
        .single();
      if (error) return { ok: false, error: error.message };
      workPublicationId = data.id;
    }

    await sb
      .from('published_posts')
      .update({
        publication_category: 'work_tracking',
        work_publication_id: workPublicationId,
      })
      .eq('id', params.publishedPostId);

    return { ok: true, workPublicationId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
