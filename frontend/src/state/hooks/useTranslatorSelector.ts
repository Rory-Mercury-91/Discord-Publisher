import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

const STORAGE_KEY_MASTER_ADMIN = 'discord-publisher:master-admin-code';

export type TranslatorOption = {
  id: string;
  name: string;
  kind: 'profile' | 'external';
};

/**
 * Charge la liste des traducteurs accessibles selon les droits de l'utilisateur,
 * et mappe chaque traducteur vers son tag UUID (translator_forum_mappings / external_translators).
 */
export function useTranslatorSelector(profileId: string | undefined) {
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

      if (isMasterAdmin) {
        const [{ data: profiles }, { data: externals }, { data: mappings }] = await Promise.all([
          sb.from('profiles').select('id, pseudo'),
          sb.from('external_translators').select('id, name, tag_id'),
          sb.from('translator_forum_mappings').select('profile_id, tag_id'),
        ]);
        for (const p of (profiles ?? []) as any[])
          opts.push({ id: p.id, name: p.pseudo || '(sans nom)', kind: 'profile' });
        for (const e of (externals ?? []) as any[]) {
          opts.push({ id: e.id, name: e.name || '(sans nom)', kind: 'external' });
          if (e.tag_id) map[e.id] = e.tag_id;
        }
        for (const m of (mappings ?? []) as any[])
          if (m.tag_id) map[m.profile_id] = m.tag_id;
      } else {
        // Propre profil
        const { data: me } = await sb.from('profiles').select('id, pseudo').eq('id', profileId).single();
        if (me) opts.push({ id: (me as any).id, name: (me as any).pseudo || 'Mon profil', kind: 'profile' });

        // Traducteurs dont on est éditeur autorisé
        const { data: editorRows } = await sb.from('allowed_editors').select('owner_id').eq('editor_id', profileId);
        if ((editorRows as any[])?.length) {
          const ownerIds = (editorRows as any[]).map(r => r.owner_id);
          const { data: owners } = await sb.from('profiles').select('id, pseudo').in('id', ownerIds);
          for (const o of (owners ?? []) as any[])
            opts.push({ id: o.id, name: o.pseudo || '(sans nom)', kind: 'profile' });
        }

        // Récupérer les tag IDs pour tous les profils trouvés
        const profileIds = opts.filter(o => o.kind === 'profile').map(o => o.id);
        if (profileIds.length) {
          const { data: mappings } = await sb
            .from('translator_forum_mappings')
            .select('profile_id, tag_id')
            .in('profile_id', profileIds);
          for (const m of (mappings ?? []) as any[])
            if (m.tag_id) map[m.profile_id] = m.tag_id;
        }
      }

      setOptions(opts);
      setTagMap(map);

      // Sélection par défaut : propre profil en priorité
      const self = opts.find(o => o.id === profileId && o.kind === 'profile');
      const def  = self ?? opts[0];
      if (def) { setSelectedId(def.id); setSelectedKind(def.kind); }
      setLoaded(true);
    })();
  }, [profileId]);

  const select = (id: string) => {
    const opt = options.find(o => o.id === id);
    if (opt) { setSelectedId(id); setSelectedKind(opt.kind); }
  };

  return {
    options,
    selectedId,
    selectedKind,
    tagMap,
    translatorTagId: tagMap[selectedId] ?? '',
    loaded,
    select,
  };
}
