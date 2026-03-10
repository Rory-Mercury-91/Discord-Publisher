/**
 * Hook pour enrichir les entrées user_collection depuis les données f95_jeux.
 * Appelle POST /api/collection/enrich-entries (streaming NDJSON).
 */

import { useCallback, useRef, useState } from 'react';
import { createApiHeaders } from '../../lib/api-helpers';
import { useAuth } from '../authContext';

export type EnrichProgress = { current: number; total: number };
export type EnrichSummary  = { updated: number; skipped: number; scraped: number };

export type EnrichOptions = {
  scrapeMissing: boolean;
  f95Cookies?:   string;
  scrapeDelay?:  number;
};

export function useEnrichCollection() {
  const { profile } = useAuth();

  const [isRunning, setIsRunning] = useState(false);
  const [progress,  setProgress]  = useState<EnrichProgress>({ current: 0, total: 0 });
  const [logs,      setLogs]      = useState<string[]>([]);
  const [summary,   setSummary]   = useState<EnrichSummary | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const startEnrich = useCallback(async (options?: EnrichOptions) => {
    if (isRunning) return;
    if (!profile?.id) {
      setLogs(['❌ Vous devez être connecté.']);
      return;
    }

    const base = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
    const key  = localStorage.getItem('apiKey') || '';
    if (!base || !key) {
      setLogs(['❌ API non configurée (URL et clé requises dans Paramètres → Préférences).']);
      return;
    }

    setIsRunning(true);
    setSummary(null);
    setProgress({ current: 0, total: 0 });
    setLogs(['🚀 Démarrage de l\'enrichissement…']);
    abortRef.current = new AbortController();

    try {
      const headers = await createApiHeaders(key);
      const res = await fetch(`${base}/api/collection/enrich-entries`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body:    JSON.stringify({
          owner_id:       profile.id,
          scrape_missing: options?.scrapeMissing ?? false,
          f95_cookies:    options?.f95Cookies   || undefined,
          scrape_delay:   options?.scrapeDelay  ?? 2.0,
        }),
        signal:  abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }

      const reader  = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('Stream indisponible');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split('\n').filter(Boolean)) {
          try {
            const data = JSON.parse(line);
            if (data.progress) setProgress(data.progress);
            if (data.log)      setLogs(p => [...p, data.log]);
            if (data.status === 'completed') {
              setSummary({ updated: data.updated ?? 0, skipped: data.skipped ?? 0, scraped: data.scraped ?? 0 });
            }
            if (data.error) setLogs(p => [...p, `❌ ${data.error}`]);
          } catch { /* ligne NDJSON invalide */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') setLogs(p => [...p, '⏸️ Enrichissement annulé']);
      else setLogs(p => [...p, `❌ Erreur : ${(err as Error)?.message}`]);
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, profile?.id]);

  const stopEnrich = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
    setSummary(null);
    setLogs([]);
    setProgress({ current: 0, total: 0 });
  }, []);

  return { isRunning, progress, logs, summary, startEnrich, stopEnrich, reset };
}
