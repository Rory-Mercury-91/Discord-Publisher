import { useCallback, useEffect, useState } from 'react';
import { createApiHeaders } from '../../lib/api-helpers';

export type ForumChannelOption = {
  forum_channel_id: string;
  label: string;
};

function getApiBase(): string {
  return (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
}

/** Liste des salons forum Discord (API admin). */
export function useForumChannels() {
  const [forums, setForums] = useState<ForumChannelOption[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const baseUrl = getApiBase();
    const apiKey = (localStorage.getItem('apiKey') || '').trim();
    if (!baseUrl || !apiKey) {
      setForums([]);
      return;
    }
    setLoading(true);
    try {
      const headers = await createApiHeaders(apiKey);
      const res = await fetch(`${baseUrl}/api/admin/forum-channels`, { headers });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setForums(data.forums ?? []);
      }
    } catch {
      setForums([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { forums, loading, refresh: load };
}
