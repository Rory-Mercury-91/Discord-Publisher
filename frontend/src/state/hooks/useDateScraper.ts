/**
 * Hook qui pilote l'appel manuel à /api/scrape/missing-dates en streaming NDJSON.
 * Modèle identique à useEnrichCollection.ts.
 *
 * IMPORTANT : écrit dans f95_date_maj (date MAJ jeu F95Zone),
 *             PAS dans date_maj (date MAJ traduction).
 */

import { useCallback, useRef, useState } from 'react';

export type DateScraperProgress = { current: number; total: number };
export type DateScraperSummary  = { updated: number; skipped: number };

export type DateScraperOptions = {
  f95Cookies?:  string;
  scrapeDelay?: number;
  limit?:       number;
};

export function useDateScraper() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress,  setProgress]  = useState<DateScraperProgress>({ current: 0, total: 0 });
  const [logs,      setLogs]      = useState<string[]>([]);
  const [summary,   setSummary]   = useState<DateScraperSummary | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startScrape = useCallback(async (options?: DateScraperOptions) => {
    if (isRunning) return;

    const base = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
    const key  = localStorage.getItem('apiKey') || '';
    if (!base || !key) {
      setLogs(['❌ API non configurée (URL et clé requises dans Paramètres → Préférences).']);
      return;
    }

    setIsRunning(true);
    setSummary(null);
    setProgress({ current: 0, total: 0 });
    setLogs(['🚀 Démarrage du scraping des dates F95…']);
    abortRef.current = new AbortController();

    try {
      const body: Record<string, unknown> = {};
      if (options?.f95Cookies)       body.f95_cookies   = options.f95Cookies;
      if (options?.scrapeDelay != null) body.scrape_delay = options.scrapeDelay;
      if (options?.limit != null)    body.limit         = options.limit;

      const res = await fetch(`${base}/api/scrape/missing-dates`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
        body:    JSON.stringify(body),
        signal:  abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buf      = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const raw of lines) {
          const t = raw.trim();
          if (!t) continue;
          try {
            const msg = JSON.parse(t);
            if (msg.log)      setLogs(p => [...p, msg.log]);
            if (msg.progress) setProgress(msg.progress);
            if (msg.status === 'completed') {
              const total   = msg.total   ?? msg.progress?.total ?? 0;
              const updated = msg.updated ?? 0;
              setSummary({ updated, skipped: total - updated });
            }
            if (msg.error) setLogs(p => [...p, `❌ ${msg.error}`]);
          } catch { /* ligne NDJSON partielle */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') setLogs(p => [...p, '⏸️ Scraping annulé']);
      else setLogs(p => [...p, `❌ Erreur : ${(err as Error)?.message}`]);
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [isRunning]);

  const stopScrape = useCallback(() => {
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

  return { isRunning, progress, logs, summary, startScrape, stopScrape, reset };
}