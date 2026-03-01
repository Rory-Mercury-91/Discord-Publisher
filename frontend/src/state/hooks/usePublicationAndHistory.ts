import { useCallback, useEffect, useState } from 'react';
import { createApiHeaders } from '../../lib/api-helpers';
import { getSupabase } from '../../lib/supabase';
import { postToRow, rowToPost } from '../logic/history';
import type { PublishedPost } from '../types';

export type UsePublicationAndHistoryOptions = {
  apiUrl?: string;
  isMasterAdmin?: boolean;
};

/** État et actions pour la publication et l'historique des posts (liste, édition, sync Supabase). */
export function usePublicationAndHistory(options?: UsePublicationAndHistoryOptions) {
  const { apiUrl, isMasterAdmin } = options ?? {};
  const [publishInProgress, setPublishInProgress] = useState(false);
  const [lastPublishResult, setLastPublishResult] = useState<string | null>(null);
  const [rateLimitCooldown, setRateLimitCooldown] = useState<number | null>(null);
  const [publishedPosts, setPublishedPosts] = useState<PublishedPost[]>(() => {
    try {
      const raw = localStorage.getItem('publishedPosts');
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return [];
  });
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostData, setEditingPostData] = useState<PublishedPost | null>(null);

  useEffect(() => {
    localStorage.setItem('publishedPosts', JSON.stringify(publishedPosts));
  }, [publishedPosts]);

  const addPublishedPost = useCallback(async (p: PublishedPost, skipSupabase = false) => {
    setPublishedPosts(prev => [p, ...prev]);
    if (skipSupabase) return;
    const sb = getSupabase();
    if (sb) {
      const row = postToRow(p);
      await sb.from('published_posts').upsert(row, { onConflict: 'id' });
    }
  }, []);

  const updatePublishedPost = useCallback(async (id: string, updates: Partial<PublishedPost>) => {
    const withUpdatedAt = { ...updates, updatedAt: updates.updatedAt ?? Date.now() };
    const sb = getSupabase();
    if (!sb) {
      setPublishedPosts(prev =>
        prev.map(post => (post.id === id ? { ...post, ...withUpdatedAt } : post))
      );
      return;
    }
    try {
      const { data: existingRow, error: fetchError } = await sb
        .from('published_posts')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) {
        // Fallback : merge avec l'état local puis upsert
        setPublishedPosts(prev => {
          const existing = prev.find(p => p.id === id);
          if (!existing) return prev;
          const merged = { ...existing, ...withUpdatedAt, id } as PublishedPost;
          const row = postToRow(merged);
          sb.from('published_posts').upsert(row, { onConflict: 'id' });
          return prev.map(p => (p.id === id ? merged : p));
        });
        return;
      }

      const existingPost = rowToPost(existingRow);
      const merged = { ...existingPost, ...withUpdatedAt, id } as PublishedPost;
      const row = postToRow(merged);
      await sb.from('published_posts').upsert(row, { onConflict: 'id' });
      setPublishedPosts(prev => prev.map(p => (p.id === id ? merged : p)));
    } catch {
      setPublishedPosts(prev =>
        prev.map(post => (post.id === id ? { ...post, ...withUpdatedAt } : post))
      );
    }
  }, []);

  const deletePublishedPost = useCallback((id: string) => {
    setPublishedPosts(prev => prev.filter(post => post.id !== id));
    const sb = getSupabase();
    if (sb) sb.from('published_posts').delete().eq('id', id);
  }, []);

  const fetchHistoryFromAPI = useCallback(async () => {
    if (isMasterAdmin && apiUrl?.trim()) {
      try {
        const baseUrl = apiUrl.replace(/\/+$/, '');
        const apiKey = localStorage.getItem('apiKey') || '';
        const headers = await createApiHeaders(apiKey);
        const res = await fetch(`${baseUrl}/api/history`, { headers });
        const data = await res.json().catch(() => ({}));
        if (data?.ok && Array.isArray(data.posts)) {
          setPublishedPosts(data.posts.map((row: Record<string, unknown>) => rowToPost(row)));
          return;
        }
      } catch (e) {
        console.warn('[Historique] Erreur API (admin):', e);
      }
    }
    const sb = getSupabase();
    if (!sb) return;
    try {
      const { data: rows, error } = await sb
        .from('published_posts')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1000);
      if (!error && Array.isArray(rows)) {
        setPublishedPosts(rows.map(rowToPost));
      }
    } catch (e) {
      console.warn('[Historique] Erreur:', e);
    }
  }, [apiUrl, isMasterAdmin]);

  return {
    publishInProgress,
    setPublishInProgress,
    lastPublishResult,
    setLastPublishResult,
    rateLimitCooldown,
    setRateLimitCooldown,
    publishedPosts,
    setPublishedPosts,
    addPublishedPost,
    updatePublishedPost,
    deletePublishedPost,
    fetchHistoryFromAPI,
    editingPostId,
    editingPostData,
    setEditingPostId,
    setEditingPostData
  };
}
