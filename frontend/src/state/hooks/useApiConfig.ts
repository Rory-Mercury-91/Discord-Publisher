import { useCallback, useMemo, useState } from 'react';

const DEFAULT_API_BASE_FALLBACK = 'http://138.2.182.125:8080';

function getStoredApiBase(): string {
  return (
    localStorage.getItem('apiBase') ??
    localStorage.getItem('apiUrl') ??
    (typeof import.meta?.env?.VITE_PUBLISHER_API_URL === 'string' ? import.meta.env.VITE_PUBLISHER_API_URL : '') ??
    DEFAULT_API_BASE_FALLBACK
  );
}

/** État et dérivés pour la configuration API (base URL, URL forum-post, list form). */
export function useApiConfig() {
  const [apiBaseFromSupabase, setApiBaseFromSupabaseState] = useState<string | null>(null);
  const [listFormUrl, setListFormUrl] = useState<string>('');

  const defaultApiBaseRaw = useMemo(
    () => apiBaseFromSupabase ?? getStoredApiBase(),
    [apiBaseFromSupabase]
  );
  const defaultApiBase = (defaultApiBaseRaw || '').replace(/\/+$/, '');
  const apiUrl = `${defaultApiBase}/api/forum-post`;

  const setApiBaseFromSupabase = useCallback((url: string | null) => {
    setApiBaseFromSupabaseState(url);
    if (url !== null && url.trim() !== '') {
      const trimmed = url.trim().replace(/\/+$/, '');
      localStorage.setItem('apiBase', trimmed);
      localStorage.setItem('apiUrl', trimmed);
    }
  }, []);

  return {
    defaultApiBase,
    apiUrl,
    apiBaseFromSupabase,
    setApiBaseFromSupabase,
    listFormUrl,
    setListFormUrl
  };
}
