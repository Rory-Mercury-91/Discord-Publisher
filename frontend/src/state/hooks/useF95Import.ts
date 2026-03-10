/**
 * Hook pour l'import en masse de jeux depuis f95_jeux vers user_collection (par traducteur).
 * fetchTraducteurs() — liste des traducteurs pour le select
 * fetchPreview(traducteur) — prévisualise la liste complète
 * startImport(traducteur, options, selectedSiteIds?) — import en streaming NDJSON
 */

import { useCallback, useRef, useState } from 'react';
import { createApiHeaders } from '../../lib/api-helpers';
import { useAuth } from '../authContext';

export type F95ImportPreviewItem = {
  site_id: number;
  nom_du_jeu: string;
  traducteur?: string;
  version?: string;
  statut?: string;
  type?: string;
  nom_url?: string;
};

export type F95ImportPreview = {
  count: number;
  already_in_collection: number;
  new_count: number;
  sample?: F95ImportPreviewItem[];
  items?: F95ImportPreviewItem[];
};

export type F95ImportOptions = {
  skipExisting: boolean;
  overwriteAll: boolean;
};

export type F95ImportSummary = { imported: number; skipped: number; errors: number };
export type F95ImportProgress = { current: number; total: number };

export function useF95Import() {
  const { profile } = useAuth();

  const [traducteurs, setTraducteurs]   = useState<string[]>([]);
  const [traducteursLoading, setTraducteursLoading] = useState(false);
  const [preview, setPreview]          = useState<F95ImportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress]       = useState<F95ImportProgress>({ current: 0, total: 0 });
  const [logs, setLogs]               = useState<string[]>([]);
  const [summary, setSummary]         = useState<F95ImportSummary | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const _getApiConfig = () => {
    const base = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
    const key  = localStorage.getItem('apiKey') || '';
    return { base, key };
  };

  const fetchTraducteurs = useCallback(async () => {
    setTraducteursLoading(true);
    const { base, key } = _getApiConfig();
    if (!base || !key) {
      setTraducteurs([]);
      setTraducteursLoading(false);
      return;
    }
    try {
      const headers = await createApiHeaders(key);
      const res = await fetch(`${base}/api/collection/f95-traducteurs`, { headers });
      const data = await res.json().catch(() => ({}));
      if (data.ok && Array.isArray(data.traducteurs)) {
        setTraducteurs(data.traducteurs);
      }
    } catch {
      setTraducteurs([]);
    } finally {
      setTraducteursLoading(false);
    }
  }, []);

  const fetchPreview = useCallback(async (traducteur: string) => {
    if (!traducteur.trim()) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);

    const { base, key } = _getApiConfig();
    if (!base || !key) {
      setPreviewError('API non configurée (URL et clé requises dans Paramètres → Préférences).');
      setPreviewLoading(false);
      return;
    }
    if (!profile?.id) {
      setPreviewError('Vous devez être connecté.');
      setPreviewLoading(false);
      return;
    }

    try {
      const headers = await createApiHeaders(key);
      const res = await fetch(`${base}/api/collection/f95-preview`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body:    JSON.stringify({
          owner_id: profile.id,
          traducteur: traducteur.trim(),
          full_list: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setPreviewError(data?.error || `Erreur HTTP ${res.status}`);
      } else {
        setPreview(data);
      }
    } catch (e: unknown) {
      setPreviewError((e as Error)?.message || 'Erreur réseau');
    } finally {
      setPreviewLoading(false);
    }
  }, [profile?.id]);

  const startImport = useCallback(async (
    traducteur: string,
    options: F95ImportOptions,
    selectedSiteIds?: number[]
  ) => {
    if (isImporting) return;
    if (!profile?.id) {
      setLogs(['❌ Vous devez être connecté.']);
      return;
    }

    const { base, key } = _getApiConfig();
    if (!base || !key) {
      setLogs(['❌ API non configurée.']);
      return;
    }

    const body: Record<string, unknown> = {
      owner_id:       profile.id,
      skip_existing:  options.skipExisting,
      overwrite_all:  options.overwriteAll,
    };
    if (selectedSiteIds?.length) {
      body.selected_site_ids = selectedSiteIds;
    } else if (traducteur.trim()) {
      body.traducteur = traducteur.trim();
    } else {
      setLogs(['❌ Traducteur ou sélection requis.']);
      return;
    }

    setIsImporting(true);
    setSummary(null);
    setProgress({ current: 0, total: 0 });
    setLogs(['🚀 Démarrage de l\'import…']);
    abortRef.current = new AbortController();

    try {
      const headers = await createApiHeaders(key);
      const res = await fetch(`${base}/api/collection/f95-import`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body:    JSON.stringify(body),
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
              setSummary({ imported: data.imported ?? 0, skipped: data.skipped ?? 0, errors: data.errors ?? 0 });
            }
            if (data.error) setLogs(p => [...p, `❌ ${data.error}`]);
          } catch { /* ligne NDJSON invalide */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') setLogs(p => [...p, '⏸️ Import annulé']);
      else setLogs(p => [...p, `❌ Erreur : ${(err as Error)?.message}`]);
    } finally {
      setIsImporting(false);
    }
  }, [isImporting, profile?.id]);

  const stopImport = useCallback(() => {
    abortRef.current?.abort();
    setIsImporting(false);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setIsImporting(false);
    setPreview(null);
    setPreviewError(null);
    setSummary(null);
    setLogs([]);
    setProgress({ current: 0, total: 0 });
  }, []);

  return {
    traducteurs,
    traducteursLoading,
    fetchTraducteurs,
    preview,
    previewLoading,
    previewError,
    fetchPreview,
    isImporting,
    progress,
    logs,
    summary,
    startImport,
    stopImport,
    reset,
  };
}
