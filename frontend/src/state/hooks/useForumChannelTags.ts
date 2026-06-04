/**
 * Tags secondaires liés au salon forum configuré (mappings + traducteurs externes).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { useApp } from '../appContext';
import type { Tag } from '../types';

export type ForumTranslatorRef = {
  id: string;
  kind: 'profile' | 'external';
  name?: string;
};

async function fetchTranslatorsForForum(forumChannelId: string): Promise<ForumTranslatorRef[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const fid = forumChannelId.trim();
  if (!fid) return [];

  const refs: ForumTranslatorRef[] = [];
  const seenProfile = new Set<string>();
  const seenExternal = new Set<string>();

  const { data: mappings } = await sb
    .from('translator_forum_mappings')
    .select('profile_id, forum_channel_id')
    .eq('forum_channel_id', fid);

  const profileIds = [
    ...new Set(
      ((mappings ?? []) as Array<{ profile_id?: string }>)
        .map(m => m.profile_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ];

  if (profileIds.length > 0) {
    const { data: profiles } = await sb.from('profiles').select('id, pseudo').in('id', profileIds);
    for (const p of (profiles ?? []) as Array<{ id: string; pseudo?: string }>) {
      if (!seenProfile.has(p.id)) {
        seenProfile.add(p.id);
        refs.push({ id: p.id, kind: 'profile', name: p.pseudo ?? undefined });
      }
    }
  }

  const { data: externals } = await sb
    .from('external_translators')
    .select('id, name, forum_channel_id')
    .eq('forum_channel_id', fid);

  for (const e of (externals ?? []) as Array<{ id: string; name?: string }>) {
    if (!seenExternal.has(e.id)) {
      seenExternal.add(e.id);
      refs.push({ id: e.id, kind: 'external', name: e.name ?? undefined });
    }
  }

  return refs;
}

/**
 * Traducteur externe rattaché au salon forum (ex. Webtoon sur le salon calendrier).
 * Si plusieurs externes : priorité au nom contenant « webtoon », sinon le premier.
 */
export async function resolveExternalTranslatorIdForForum(
  forumChannelId: string | undefined
): Promise<string | undefined> {
  const refs = await fetchTranslatorsForForum((forumChannelId ?? '').trim());
  const externals = refs.filter((r) => r.kind === 'external');
  if (externals.length === 0) return undefined;
  if (externals.length === 1) return externals[0].id;
  const webtoonMatch = externals.find((e) =>
    (e.name ?? '').toLowerCase().includes('webtoon')
  );
  return webtoonMatch?.id ?? externals[0].id;
}

function tagBelongsToTranslators(tag: Tag, translators: ForumTranslatorRef[]): boolean {
  if (tag.tagType === 'translator') return false;
  return translators.some(ref =>
    ref.kind === 'profile'
      ? tag.profileId === ref.id
      : tag.externalTranslatorId === ref.id
  );
}

export function useForumChannelTags(forumChannelId: string | undefined) {
  const { savedTags } = useApp();
  const [translators, setTranslators] = useState<ForumTranslatorRef[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    const fid = (forumChannelId ?? '').trim();
    if (!fid) {
      setTranslators([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const refs = await fetchTranslatorsForForum(fid);
      setTranslators(refs);
    } catch {
      setTranslators([]);
    } finally {
      setLoading(false);
    }
  }, [forumChannelId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const forumTags = useMemo(
    () => (translators.length > 0 ? savedTags.filter(t => tagBelongsToTranslators(t, translators)) : []),
    [savedTags, translators]
  );

  return {
    translators,
    forumTags,
    loading,
    hasForumChannel: !!(forumChannelId ?? '').trim(),
    hasTranslatorForForum: translators.length > 0,
    reload,
  };
}

/** Tags affichables (salon + sélection déjà faite pour les libellés). */
export function useForumChannelTagsForEditor(
  forumChannelId: string | undefined,
  selectedTagIds: string[]
) {
  const { savedTags } = useApp();
  const { forumTags, translators, loading, hasForumChannel, hasTranslatorForForum, reload } =
    useForumChannelTags(forumChannelId);

  const displayTags = useMemo(() => {
    const byId = new Map<string, Tag>();
    for (const t of forumTags) {
      const key = t.id || t.name;
      if (key) byId.set(key, t);
      if (t.discordTagId) byId.set(String(t.discordTagId), t);
    }
    for (const id of selectedTagIds) {
      if (byId.has(id)) continue;
      const t = savedTags.find(
        tag => (tag.id || tag.name) === id || String(tag.discordTagId ?? '') === id
      );
      if (t) byId.set(id, t);
    }
    return Array.from(byId.values());
  }, [forumTags, selectedTagIds, savedTags]);

  return {
    forumTags,
    displayTags,
    translators,
    loading,
    hasForumChannel,
    hasTranslatorForForum,
    reload,
  };
}
