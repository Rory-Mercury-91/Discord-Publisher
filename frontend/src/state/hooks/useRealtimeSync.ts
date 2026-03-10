import { useEffect } from 'react';
import { getSupabase } from '../../lib/supabase';
import { mergeInstructionsFromSupabase, type SavedInstructionRow } from './useInstructionsState';
import { rowToPost } from '../logic/history';
import type { PublishedPost, Tag, TagType } from '../types';

type RealtimeSyncDeps = {
  setSavedTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  setApiBaseFromSupabase: (url: string | null) => void;
  setListFormUrl: (url: string) => void;
  setPublishedPosts: React.Dispatch<React.SetStateAction<PublishedPost[]>>;
  setSavedInstructions: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setInstructionOwners: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  /** Applique le payload templates (templates + customVars) reçu par realtime. */
  applySavedTemplatesPayload: (value: unknown) => void;
};

function mapTagRow(r: { id: string; name: string; tag_type: string; author_discord_id?: string | null; discord_tag_id?: string | null }) {
  return {
    id: r.id,
    name: r.name,
    tagType: (r.tag_type as TagType) || 'other',
    authorDiscordId: r.author_discord_id ?? undefined,
    discordTagId: r.discord_tag_id ?? undefined,
  };
}

/** Souscrit au canal Realtime Supabase et met à jour les états (tags, app_config, published_posts, owner_data). */
export function useRealtimeSync(deps: RealtimeSyncDeps) {
  const {
    setSavedTags,
    setApiBaseFromSupabase,
    setListFormUrl,
    setPublishedPosts,
    setSavedInstructions,
    setInstructionOwners,
    applySavedTemplatesPayload,
  } = deps;

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;

    const channel = sb.channel('discord-publisher-realtime');

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tags' },
      (payload: { eventType: string; new?: unknown; old?: unknown }) => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new as Parameters<typeof mapTagRow>[0];
          const row = mapTagRow(r);
          setSavedTags(prev => (prev.some(t => t.id === row.id) ? prev : [...prev, row]));
        } else if (payload.eventType === 'UPDATE') {
          const r = payload.new as Parameters<typeof mapTagRow>[0];
          setSavedTags(prev => prev.map(t => t.id === r.id ? mapTagRow(r) : t));
        } else if (payload.eventType === 'DELETE') {
          const r = payload.old as { id: string };
          setSavedTags(prev => prev.filter(t => t.id !== r.id));
        }
      }
    );

    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'owner_data' }, (payload: { new?: { data_key?: string } }) => {
      const dataKey = payload.new?.data_key;
      if (dataKey === 'instructions') {
        getSupabase()
          ?.from('owner_data')
          .select('owner_type, owner_id, value')
          .eq('data_key', 'instructions')
          .then((res) => {
            if (res.error || !res.data?.length) return;
            let localInstructions: Record<string, string> = {};
            let localOwners: Record<string, string> = {};
            try {
              const rawInstr = localStorage.getItem('savedInstructions');
              const rawOwners = localStorage.getItem('instructionOwners');
              if (rawInstr) localInstructions = JSON.parse(rawInstr);
              if (rawOwners) localOwners = JSON.parse(rawOwners);
            } catch {
              /* ignorer */
            }
            const { merged, owners } = mergeInstructionsFromSupabase(
              res.data as SavedInstructionRow[],
              localInstructions,
              localOwners
            );
            const instrEq = (a: Record<string, string>, b: Record<string, string>) =>
              Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => b[k] === a[k]);
            setSavedInstructions(prev => (instrEq(prev, merged) ? prev : merged));
            setInstructionOwners(prev => (instrEq(prev, owners) ? prev : owners));
          });
      } else if (dataKey === 'templates') {
        getSupabase()
          ?.auth.getSession()
          .then(({ data: { session } }) => {
            if (!session?.user?.id) return null;
            return getSupabase()?.from('owner_data').select('value').eq('owner_type', 'profile').eq('owner_id', session.user.id).eq('data_key', 'templates').maybeSingle();
          })
          .then((res) => {
            if (!res?.data?.value || res.error) return;
            applySavedTemplatesPayload(res.data.value);
          });
      }
    });

    (channel as { on: (ev: string, config: unknown, cb: (p: unknown) => void) => unknown }).on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_config' },
      (payload: unknown) => {
        const p = payload as { eventType: string; new?: { key: string; value: string }; old?: { key: string; value: string } };
        const r = (p.eventType === 'DELETE' ? p.old : p.new) as { key: string; value: string };
        if (r?.key === 'api_base_url' && r?.value?.trim()) {
          setApiBaseFromSupabase(r.value.trim().replace(/\/+$/, ''));
        } else if (r?.key === 'list_form_url') {
          setListFormUrl((r?.value ?? '').trim());
        }
      }
    );

    (channel as { on: (ev: string, config: unknown, cb: (p: unknown) => void) => unknown }).on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'published_posts' },
      (payload: unknown) => {
        const p = payload as { eventType: string; new?: Record<string, unknown>; old?: { id: string } };
        if (p.eventType === 'INSERT') {
          setPublishedPosts(prev => [rowToPost(p.new as Record<string, unknown>), ...prev]);
        } else if (p.eventType === 'UPDATE') {
          setPublishedPosts(prev =>
            prev.map(post => (post.id === (p.new as { id: string }).id ? rowToPost(p.new as Record<string, unknown>) : post))
          );
        } else if (p.eventType === 'DELETE') {
          const id = (p.old as { id: string }).id;
          setPublishedPosts(prev => prev.filter(p => p.id !== id));
        }
      }
    );

    channel.subscribe((status: string) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[Realtime] Connexion en direct indisponible, les mises à jour se feront au rechargement.');
      }
    });

    return () => {
      sb.removeChannel(channel);
    };
  }, [
    setSavedTags,
    setApiBaseFromSupabase,
    setListFormUrl,
    setPublishedPosts,
    setSavedInstructions,
    setInstructionOwners,
    applySavedTemplatesPayload,
  ]);
}
