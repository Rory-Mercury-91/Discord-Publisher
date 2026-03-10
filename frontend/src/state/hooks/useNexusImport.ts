/**
 * Hook pour l'import en masse de jeux depuis Nexus.
 * Étape 1 : parseDbFile(file) — envoie le .db au backend → reçoit les entrées parsées
 * Étape 2 : startImport(options) — POST /api/collection/import-batch (streaming NDJSON)
 */

import { useCallback, useRef, useState } from 'react';
import { createApiHeaders } from '../../lib/api-helpers';
import { useAuth } from '../authContext';

/** Entrée normalisée retournée par le backend (parse_nexus_db) */
export type NexusExportEntry = {
  f95_thread_id:        number | null;
  f95_url:              string | null;
  lewdcorner_thread_id: number | null;
  lewdcorner_url:       string | null;
  game_site:            string | null;
  title:                string | null;
  executable_paths:     { path: string }[];
  labels:               { label: string; color: string }[];
};

export type NexusParseStats = {
  total:       number;
  with_f95:    number;
  with_lc:     number;
  with_paths:  number;
  with_labels: number;
};

export type ImportOptions = {
  skipExisting:    boolean;
  overwriteLabels: boolean;
  overwritePaths:  boolean;
  /** Force la réimportation complète (titre, scraped_data, labels, chemins) même si déjà en collection */
  overwriteAll:    boolean;
};

export type ImportProgress = { current: number; total: number };
export type ImportSummary  = { imported: number; skipped: number; errors: number };

/** État de parsing du fichier .db */
export type ParseStatus = 'idle' | 'parsing' | 'ready' | 'error';

export function useNexusImport() {
  const { profile } = useAuth();

  const [parseStatus,  setParseStatus]  = useState<ParseStatus>('idle');
  const [parseError,   setParseError]   = useState<string | null>(null);
  const [parseWarnings,setParseWarnings]= useState<string[]>([]);
  const [fileEntries,  setFileEntries]  = useState<NexusExportEntry[] | null>(null);
  const [parseStats,   setParseStats]   = useState<NexusParseStats | null>(null);

  const [isImporting,  setIsImporting]  = useState(false);
  const [progress,     setProgress]     = useState<ImportProgress>({ current: 0, total: 0 });
  const [logs,         setLogs]         = useState<string[]>([]);
  const [summary,      setSummary]      = useState<ImportSummary | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // ─── Helpers internes ─────────────────────────────────────────────

  const _getApiConfig = () => {
    const base = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
    const key  = localStorage.getItem('apiKey') || '';
    return { base, key };
  };

  // ─── Étape 1A : envoi du fichier .db au backend pour parsing ──────

  /**
   * Envoie le fichier .db Nexus à l'API backend.
   * Le backend lit le SQLite, extrait les jeux et retourne les entrées normalisées.
   */
  const parseDbFile = useCallback(async (file: File) => {
    setParseStatus('parsing');
    setParseError(null);
    setParseWarnings([]);
    setFileEntries(null);
    setParseStats(null);
    setSummary(null);
    setLogs([]);
    setProgress({ current: 0, total: 0 });

    const { base, key } = _getApiConfig();
    if (!base || !key) {
      setParseError('API non configurée (clé ou URL manquante dans Paramètres → Préférences).');
      setParseStatus('error');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file, file.name);

      const headers = await createApiHeaders(key);
      const res = await fetch(`${base}/api/collection/nexus-parse-db`, {
        method:  'POST',
        headers, // pas de Content-Type : laissé au navigateur pour le multipart boundary
        body:    formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setParseError(data?.error || `Erreur HTTP ${res.status}`);
        setParseStatus('error');
        return;
      }

      const entries: NexusExportEntry[] = data.entries ?? [];
      if (entries.length === 0) {
        setParseError('Aucun jeu adulte trouvé dans ce fichier .db.');
        setParseStatus('error');
        return;
      }

      setFileEntries(entries);
      setParseStats(data.stats ?? null);
      setParseWarnings(data.warnings ?? []);
      setParseStatus('ready');
    } catch (e: any) {
      setParseError(e?.message || 'Erreur réseau lors de l\'analyse du fichier.');
      setParseStatus('error');
    }
  }, []);

  // ─── Étape 2 : import en masse ─────────────────────────────────────

  const startImport = useCallback(
    async (options: ImportOptions) => {
      if (!fileEntries?.length) return;
      if (!profile?.id) {
        setLogs(['❌ Vous devez être connecté pour importer.']);
        return;
      }
      const { base, key } = _getApiConfig();
      if (!base || !key) {
        setLogs(['❌ API non configurée.']);
        return;
      }

      setIsImporting(true);
      setSummary(null);
      setProgress({ current: 0, total: fileEntries.length });
      setLogs(['🚀 Démarrage de l\'import…']);
      abortRef.current = new AbortController();

      try {
        const headers = await createApiHeaders(key);
        const res = await fetch(`${base}/api/collection/import-batch`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body:    JSON.stringify({
            owner_id:         profile.id,
            entries:          fileEntries,
            skip_existing:    options.skipExisting,
            overwrite_labels: options.overwriteLabels,
            overwrite_paths:  options.overwritePaths,
            overwrite_all:    options.overwriteAll,
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || `HTTP ${res.status}`);
        }

        const streamReader = res.body?.getReader();
        const decoder      = new TextDecoder();
        if (!streamReader) throw new Error('Stream indisponible');

        while (true) {
          const { done, value } = await streamReader.read();
          if (done) break;
          for (const line of decoder.decode(value, { stream: true }).split('\n').filter(Boolean)) {
            try {
              const data = JSON.parse(line);
              if (data.progress) setProgress(data.progress);
              if (data.log)      setLogs((p) => [...p, data.log]);
              if (data.status === 'completed') {
                setSummary({ imported: data.imported ?? 0, skipped: data.skipped ?? 0, errors: data.errors ?? 0 });
              }
              if (data.error)    setLogs((p) => [...p, `❌ ${data.error}`]);
            } catch { /* ligne NDJSON invalide */ }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') setLogs((p) => [...p, '⏸️ Import annulé']);
        else                           setLogs((p) => [...p, `❌ Erreur réseau : ${err.message}`]);
      } finally {
        setIsImporting(false);
      }
    },
    [fileEntries, profile?.id]
  );

  const stopImport = useCallback(() => {
    abortRef.current?.abort();
    setIsImporting(false);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setIsImporting(false);
    setParseStatus('idle');
    setParseError(null);
    setParseWarnings([]);
    setFileEntries(null);
    setParseStats(null);
    setSummary(null);
    setLogs([]);
    setProgress({ current: 0, total: 0 });
  }, []);

  return {
    // Parsing
    parseStatus,
    parseError,
    parseWarnings,
    parseStats,
    fileEntries,
    parseDbFile,
    // Import
    isImporting,
    progress,
    logs,
    summary,
    startImport,
    stopImport,
    reset,
  };
}
