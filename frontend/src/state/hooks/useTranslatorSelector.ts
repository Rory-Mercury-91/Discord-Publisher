import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

const STORAGE_KEY_MASTER_ADMIN = 'discord-publisher:master-admin-code';

export type TranslatorOption = {
  id: string;
  name: string;
  kind: 'profile' | 'external';
  /** Discord ID du profil (pour faire correspondre l'auteur d'un post chargé depuis l'historique) */
  discordId?: string;
};

/**
 * Charge la liste des traducteurs accessibles selon les droits de l'utilisateur,
 * et mappe chaque traducteur vers son tag UUID (translator_forum_mappings / external_translators).
 */
export type UseTranslatorSelectorOptions = {
  /** En édition : inclure tous les traducteurs routés vers ce salon (ex. Jupiterwing + Le Chauve). */
  editForumChannelId?: number | string | null;
};

async function mergeTranslatorsForForum(
  sb: ReturnType<typeof getSupabase>,
  forumId: string,
  opts: TranslatorOption[],
  map: Record<string, string>,
  validTranslatorTagIds: Set<string>
) {
  if (!sb || !forumId) return;
  const existingProfileIds = new Set(opts.filter((o) => o.kind === 'profile').map((o) => o.id));
  const existingExtIds = new Set(opts.filter((o) => o.kind === 'external').map((o) => o.id));

  const { data: grantMappings } = await sb
    .from('translator_forum_mappings')
    .select('profile_id, tag_id')
    .eq('forum_channel_id', forumId);
  const grantProfileIds = [
    ...new Set(
      ((grantMappings ?? []) as Array<{ profile_id?: string }>)
        .map((m) => m.profile_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ];
  if (grantProfileIds.length) {
    const missingIds = grantProfileIds.filter((id) => !existingProfileIds.has(id));
    if (missingIds.length) {
      const { data: grantProfiles } = await sb
        .from('profiles')
        .select('id, pseudo, discord_id')
        .in('id', missingIds);
      for (const p of (grantProfiles ?? []) as Array<{ id: string; pseudo?: string; discord_id?: string }>) {
        opts.push({
          id: p.id,
          name: p.pseudo || '(sans nom)',
          kind: 'profile',
          discordId: p.discord_id ?? undefined,
        });
        existingProfileIds.add(p.id);
      }
    }
    for (const m of (grantMappings ?? []) as Array<{ profile_id?: string; tag_id?: string }>) {
      if (m.profile_id && m.tag_id && validTranslatorTagIds.has(m.tag_id)) {
        map[m.profile_id] = m.tag_id;
      }
    }
  }

  const { data: grantExternals } = await sb
    .from('external_translators')
    .select('id, name, tag_id, forum_channel_id')
    .eq('forum_channel_id', forumId);
  for (const e of (grantExternals ?? []) as Array<{ id: string; name?: string; tag_id?: string }>) {
    if (!existingExtIds.has(e.id)) {
      opts.push({
        id: e.id,
        name: e.name || '(sans nom)',
        kind: 'external',
      });
      existingExtIds.add(e.id);
    }
    if (e.tag_id && validTranslatorTagIds.has(e.tag_id)) map[e.id] = e.tag_id;
  }
}

export function useTranslatorSelector(
  profileId: string | undefined,
  selectorOptions?: UseTranslatorSelectorOptions
) {
  const editForumChannelId = selectorOptions?.editForumChannelId;
  const [options, setOptions]       = useState<TranslatorOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedKind, setSelectedKind] = useState<'profile' | 'external'>('profile');
  const [tagMap, setTagMap]         = useState<Record<string, string>>({}); // translatorId → tag UUID
  const [loaded, setLoaded]         = useState(false);

  useEffect(() => {
    if (!profileId) return;
    const sb = getSupabase();
    if (!sb) return;
    const isMasterAdmin = !!localStorage.getItem(STORAGE_KEY_MASTER_ADMIN);

    (async () => {
      const opts: TranslatorOption[] = [];
      const map: Record<string, string> = {};
      const { data: translatorTagRows } = await sb
        .from('tags')
        .select('id')
        .eq('tag_type', 'translator');
      const validTranslatorTagIds = new Set(
        ((translatorTagRows ?? []) as Array<{ id?: string | null }>)
          .map((r) => r.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      );

      if (isMasterAdmin) {
        const [{ data: profiles }, { data: externals }, { data: mappings }] = await Promise.all([
          sb.from('profiles').select('id, pseudo, discord_id'),
          sb.from('external_translators').select('id, name, tag_id'),
          sb.from('translator_forum_mappings').select('profile_id, tag_id'),
        ]);
        for (const p of (profiles ?? []) as any[])
          opts.push({ id: p.id, name: p.pseudo || '(sans nom)', kind: 'profile', discordId: p.discord_id ?? undefined });
        for (const e of (externals ?? []) as any[]) {
          opts.push({ id: e.id, name: e.name || '(sans nom)', kind: 'external' });
          if (e.tag_id && validTranslatorTagIds.has(e.tag_id)) map[e.id] = e.tag_id;
        }
        for (const m of (mappings ?? []) as any[])
          if (m.tag_id && validTranslatorTagIds.has(m.tag_id)) map[m.profile_id] = m.tag_id;
      } else {
        // Propre profil
        const { data: me } = await sb.from('profiles').select('id, pseudo, discord_id').eq('id', profileId).single();
        if (me) opts.push({ id: (me as any).id, name: (me as any).pseudo || 'Mon profil', kind: 'profile', discordId: (me as any).discord_id ?? undefined });

        // Traducteurs dont on est éditeur autorisé
        const { data: editorRows } = await sb.from('allowed_editors').select('owner_id').eq('editor_id', profileId);
        if ((editorRows as any[])?.length) {
          const ownerIds = (editorRows as any[]).map(r => r.owner_id);
          const { data: owners } = await sb.from('profiles').select('id, pseudo, discord_id').in('id', ownerIds);
          for (const o of (owners ?? []) as any[])
            opts.push({ id: o.id, name: o.pseudo || '(sans nom)', kind: 'profile', discordId: (o as any).discord_id ?? undefined });
        }

        // Récupérer les tag IDs pour tous les profils trouvés
        const profileIds = opts.filter(o => o.kind === 'profile').map(o => o.id);
        if (profileIds.length) {
          const { data: mappings } = await sb
            .from('translator_forum_mappings')
            .select('profile_id, tag_id')
            .in('profile_id', profileIds);
          for (const m of (mappings ?? []) as any[])
            if (m.tag_id && validTranslatorTagIds.has(m.tag_id)) map[m.profile_id] = m.tag_id;
        }

        // Autorisations explicites de publication sur un salon forum
        const { data: grants } = await sb
          .from('forum_post_grants')
          .select('forum_channel_id')
          .eq('profile_id', profileId);
        const grantForumIds = ((grants ?? []) as Array<{ forum_channel_id?: string | null }>)
          .map((g) => (g.forum_channel_id ?? '').trim())
          .filter(Boolean);
        if (grantForumIds.length > 0) {
          for (const fid of grantForumIds) {
            await mergeTranslatorsForForum(sb, fid, opts, map, validTranslatorTagIds);
          }
        }
      }

      const editForum = String(editForumChannelId ?? '').trim();
      if (editForum) {
        await mergeTranslatorsForForum(sb, editForum, opts, map, validTranslatorTagIds);
      }

      setOptions(opts);
      setTagMap(map);

      // Conserver le choix manuel ; sinon profil connecté par défaut
      setSelectedId((prevId) => {
        const kept = prevId ? opts.find((o) => o.id === prevId) : undefined;
        if (kept) {
          setSelectedKind(kept.kind);
          return prevId;
        }
        const self = opts.find((o) => o.id === profileId && o.kind === 'profile');
        const def = self ?? opts[0];
        if (def) {
          setSelectedKind(def.kind);
          return def.id;
        }
        return prevId;
      });
      setLoaded(true);
    })();
  }, [profileId, editForumChannelId]);

  const select = useCallback((id: string) => {
    const opt = options.find((o) => o.id === id);
    if (opt) {
      setSelectedId(id);
      setSelectedKind(opt.kind);
    }
  }, [options]);

  /** Sélectionne le traducteur correspondant à l'auteur du post (pour chargement depuis l'historique). */
  const selectByAuthor = useCallback((
    authorDiscordId: string | undefined,
    authorExternalTranslatorId: string | undefined
  ) => {
    if (authorExternalTranslatorId) {
      const opt = options.find((o) => o.kind === 'external' && o.id === authorExternalTranslatorId);
      if (opt) {
        setSelectedId(opt.id);
        setSelectedKind('external');
      }
      return;
    }
    if (authorDiscordId) {
      const opt = options.find((o) => o.kind === 'profile' && o.discordId === authorDiscordId);
      if (opt) {
        setSelectedId(opt.id);
        setSelectedKind('profile');
      }
    }
  }, [options]);

  return {
    options,
    selectedId,
    selectedKind,
    tagMap,
    translatorTagId: tagMap[selectedId] ?? '',
    loaded,
    select,
    selectByAuthor,
  };
}
