/**
 * Hook RSS F95Zone — récupère le flux des dernières MAJ de jeux.
 * Utilise un proxy backend (/api/rss/f95-updates) pour éviter les problèmes CORS.
 * Fallback sur fetch direct (fonctionne dans Tauri sans CORS).
 * Cache localStorage 5 min pour limiter les requêtes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type RssEntry = {
  threadId: number;
  url:      string;
  title:    string;
  pubDate:  string; // ISO 8601
};

const CACHE_KEY = 'f95_rss_cache_v1';
const CACHE_TTL = 5 * 60 * 1000; // 5 min
const RSS_DIRECT_URL =
  'https://f95zone.to/sam/latest_alpha/latest_data.php?cmd=rss&cat=games&rows=90';

// ── Helpers ───────────────────────────────────────────────────────────────────

function idFromUrl(url: string): number | null {
  const m = url.match(/\/threads\/(?:[^/]*\.)?(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** Parse un flux RSS 2.0 en entrées. <link> est un nœud texte en RSS 2.0, pas un élément enfant. */
function parseRss(xml: string): RssEntry[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const out: RssEntry[] = [];
  for (const item of Array.from(doc.querySelectorAll('item'))) {
    let link = '';
    for (const n of Array.from(item.childNodes)) {
      if (n.nodeName === 'link') { link = n.textContent?.trim() ?? ''; break; }
    }
    if (!link) link = item.querySelector('link')?.textContent?.trim() ?? '';
    const tid = idFromUrl(link);
    if (!tid) continue;
    const pubRaw = item.querySelector('pubDate')?.textContent?.trim() ?? '';
    let pubIso = '';
    try { pubIso = pubRaw ? new Date(pubRaw).toISOString() : ''; } catch { /* ignore */ }
    out.push({
      threadId: tid,
      url:      link,
      title:    item.querySelector('title')?.textContent?.trim() ?? '',
      pubDate:  pubIso,
    });
  }
  return out;
}

function readCache(): { entries: RssEntry[]; ts: number } | null {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null'); }
  catch { return null; }
}

function writeCache(entries: RssEntry[]): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ entries, ts: Date.now() })); }
  catch { /* ignore */ }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useF95Rss(intervalMs: number | null) {
  const cached = readCache();

  const [entries,   setEntries]   = useState<RssEntry[]>(cached?.entries ?? []);
  const [loading,   setLoading]   = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(cached ? new Date(cached.ts) : null);
  const [error,     setError]     = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doFetch = useCallback(async (force = false) => {
    if (!force) {
      const c = readCache();
      if (c && Date.now() - c.ts < CACHE_TTL) {
        setEntries(c.entries);
        setLastFetch(new Date(c.ts));
        return;
      }
    }
    setLoading(true); setError(null);
    try {
      const base   = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
      const apiKey = localStorage.getItem('apiKey') || '';
      let result: RssEntry[] = [];

      if (base && apiKey) {
        // Proxy backend (évite CORS en mode web)
        const r = await fetch(`${base}/api/rss/f95-updates`, { headers: { 'X-API-KEY': apiKey } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        result = (data.entries ?? []).map((e: RssEntry) => ({
          ...e,
          pubDate: e.pubDate ? new Date(e.pubDate).toISOString() : '',
        }));
      } else {
        // Fetch direct (Tauri desktop — pas de CORS)
        const r = await fetch(RSS_DIRECT_URL);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        result = parseRss(await r.text());
      }

      setEntries(result);
      setLastFetch(new Date());
      writeCache(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Chargement initial (utilise le cache si frais)
  useEffect(() => { doFetch(false); }, [doFetch]);

  // Auto-refresh selon l'intervalle configuré
  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (intervalMs && intervalMs > 0) {
      timerRef.current = setInterval(() => doFetch(true), intervalMs);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [intervalMs, doFetch]);

  /** Map threadId → pubDate ISO pour accès O(1) dans le tri */
  const dateMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of entries) if (e.pubDate) m.set(e.threadId, e.pubDate);
    return m;
  }, [entries]);

  return {
    entries,
    loading,
    lastFetch,
    error,
    dateMap,
    refresh: () => doFetch(true),
  };
}