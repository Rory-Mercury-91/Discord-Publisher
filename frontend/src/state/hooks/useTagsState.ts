import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import type { Tag, TagType } from '../types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TagRow = {
  id: string;
  name: string;
  tag_type: string;
  author_discord_id: string | null;
  discord_tag_id: string | null;
  profile_id: string | null;
  external_translator_id: string | null;
  label_key: string | null;
  list_form_name: string | null;
};

function mapRowToTag(r: TagRow): Tag {
  return {
    id: r.id,
    name: r.name,
    tagType: (r.tag_type as TagType) || 'other',
    authorDiscordId: r.author_discord_id ?? undefined,
    discordTagId: r.discord_tag_id ?? undefined,
    profileId: r.profile_id ?? undefined,
    externalTranslatorId: r.external_translator_id ?? undefined,
    labelKey: r.label_key ?? undefined,
    listFormName: r.list_form_name ?? undefined,
  };
}

export function useTagsState() {
  const [savedTags, setSavedTags] = useState<Tag[]>(() => {
    try {
      const raw = localStorage.getItem('savedTags');
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('savedTags', JSON.stringify(savedTags));
  }, [savedTags]);

  const addSavedTag = useCallback((t: Tag) => {
    const sb = getSupabase();
    if (sb) {
      sb.from('tags')
        .insert({
          name: t.name || '',
          tag_type: t.tagType || 'other',
          author_discord_id: t.authorDiscordId ?? null,
          discord_tag_id: t.discordTagId ?? null,
        })
        .select('id')
        .single()
        .then((res) => {
          if (!res.error && res.data) {
            setSavedTags(prev => [...prev, { ...t, id: (res.data as { id: string }).id }]);
          } else {
            setSavedTags(prev => [...prev, t]);
          }
        });
    } else {
      setSavedTags(prev => [...prev, t]);
    }
  }, []);

  const updateSavedTag = useCallback((id: string, updates: Partial<Tag>) => {
    setSavedTags(prev => prev.map(t => (t.id === id ? { ...t, ...updates } : t)));
    const sb = getSupabase();
    if (sb) {
      const row: Record<string, unknown> = {};
      if (updates.name !== undefined) row.name = updates.name;
      if (updates.tagType !== undefined) row.tag_type = updates.tagType;
      if (updates.authorDiscordId !== undefined) row.author_discord_id = updates.authorDiscordId ?? null;
      if (updates.discordTagId !== undefined) row.discord_tag_id = updates.discordTagId ?? null;
      if (Object.keys(row).length > 0) {
        sb.from('tags').update(row).eq('id', id);
      }
    }
  }, []);

  const deleteSavedTag = useCallback((idx: number) => {
    setSavedTags(prev => {
      const tag = prev[idx];
      const sb = getSupabase();
      if (sb && tag?.id) {
        sb.from('tags').delete().eq('id', tag.id).then(() => {});
      }
      const copy = [...prev];
      copy.splice(idx, 1);
      return copy;
    });
  }, []);

  const syncTagsToSupabase = useCallback(
    async (authorDiscordId?: string): Promise<{ ok: boolean; count?: number; error?: string }> => {
      const sb = getSupabase();
      if (!sb) return { ok: false, error: 'Supabase non configuré' };
      if (savedTags.length === 0) return { ok: true, count: 0 };
      try {
        const updated: Tag[] = [];
        const author = authorDiscordId ?? undefined;
        for (const t of savedTags) {
          const hasValidUuid = t.id && UUID_REGEX.test(t.id);
          const row = {
            name: t.name || '',
            tag_type: t.tagType || 'other',
            author_discord_id: t.authorDiscordId ?? author ?? null,
            discord_tag_id: t.discordTagId ?? null,
            profile_id: t.profileId ?? null,
            external_translator_id: t.externalTranslatorId ?? null,
            label_key: t.labelKey ?? null,
          };
          if (hasValidUuid) {
            const { error } = await sb.from('tags').upsert({ id: t.id, ...row }, { onConflict: 'id' });
            if (error) throw new Error((error as { message?: string })?.message ?? 'Upsert tag failed');
            updated.push(t);
          } else {
            const { data, error } = await sb.from('tags').insert(row).select('id').single();
            if (error) throw new Error((error as { message?: string })?.message ?? 'Insert tag failed');
            updated.push({
              ...t,
              id: (data as { id: string }).id,
              authorDiscordId: t.authorDiscordId ?? author,
              discordTagId: t.discordTagId,
            });
          }
        }
        setSavedTags(updated);
        return { ok: true, count: savedTags.length };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: msg };
      }
    },
    [savedTags]
  );

  const fetchTagsFromSupabase = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb
      .from('tags')
      .select('id, name, tag_type, author_discord_id, discord_tag_id, profile_id, external_translator_id, label_key, list_form_name')
      .order('created_at', { ascending: true });
    if (error || !data?.length) return;
    setSavedTags((data as TagRow[]).map(mapRowToTag));
  }, []);

  return {
    savedTags,
    setSavedTags,
    addSavedTag,
    updateSavedTag,
    deleteSavedTag,
    syncTagsToSupabase,
    fetchTagsFromSupabase,
  };
}
