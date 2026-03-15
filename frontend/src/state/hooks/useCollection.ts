/**
 * Hook pour la collection personnelle (user_collection).
 * Liste, ajout, suppression via Supabase (RLS). Résolution F95 via API backend.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { createApiHeaders } from '../../lib/api-helpers';
import { useAuth } from '../authContext';

/** Label personnalisé (comme Nexus) */
export type CollectionLabel = { label: string; color: string };

/** Entrée d’un chemin exécutable avec date de dernière session */
export type ExecutablePathEntry = { path: string; last_launch?: string | null };

/** Normalise executable_paths (string[] ou ancien format → ExecutablePathEntry[]) */
export function normalizeExecutablePaths(
  raw: string[] | ExecutablePathEntry[] | null | undefined
): ExecutablePathEntry[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.map((item) =>
    typeof item === 'string' ? { path: item, last_launch: null } : { path: item.path, last_launch: item.last_launch ?? null }
  );
}

/** Cache renvoyé par le scraper (POST /api/collection/resolve) */
export type ScrapedData = {
  name?: string | null;
  version?: string | null;
  image?: string | null;
  status?: string | null;
  lien_trad?: string | null;
  /** Peut être une string CSV ou un tableau (import Nexus) — toujours normaliser avec tagsToString() */
  tags?: string | string[] | null;
  type?: string | null;
  /** Synopsis EN (scrapé depuis F95) */
  synopsis?: string | null;
  /** Synopsis FR (traduit via API Google si demandé à l'import) */
  synopsis_fr?: string | null;
};

/** Normalise tags en string CSV quelle que soit sa forme (string, array, null). */
export function tagsToString(raw: string | string[] | null | undefined): string {
  if (!raw) return '';
  if (Array.isArray(raw)) return raw.filter(Boolean).join(', ');
  return raw;
}

export type UserCollectionEntry = {
  id: string;
  owner_id: string;
  f95_thread_id: number;
  f95_url: string | null;
  title: string | null;
  scraped_data?: ScrapedData | null;
  labels?: CollectionLabel[] | null;
  /** Chemins d'exécutables avec dernière session (ex. .exe), style Nexus */
  executable_paths?: ExecutablePathEntry[] | string[] | null;
  created_at: string;
  updated_at: string | null;
};

/** Variante (saison / autre traduction) pour affichage dans Liens utiles */
export type UserCollectionGameVariant = {
  id?: number;
  trad_ver?: string;
  lien_trad?: string;
  type_de_traduction?: string;
  nom_url?: string;
  traducteur?: string;
  traducteur_url?: string;
  version?: string;
  statut?: string;
};

/** Données f95_jeux ou scraped_data pour afficher la même chose que dans la bibliothèque */
export type UserCollectionGameEnrichment = {
  f95_jeux_id?: number;
  nom_du_jeu: string;
  version: string;
  nom_url: string;
  image?: string;
  statut?: string;
  type?: string;
  traducteur?: string;
  traducteur_url?: string;
  type_de_traduction?: string;
  date_maj?: string;
  f95_date_maj?: string;
  type_maj?: string;
  trad_ver?: string;
  lien_trad?: string;
  tags?: string;
  synopsis?: string;
  synopsis_fr?: string;
  synopsis_en?: string;
  variants?: UserCollectionGameVariant[];
};

/** Entrée enrichie avec infos f95_jeux si le jeu est dans le catalogue */
export type UserCollectionEntryEnriched = UserCollectionEntry & {
  game?: UserCollectionGameEnrichment;
};

/** Données d'un jeu ajouté manuellement (sans scraping). */
export type ManualGameData = {
  title:          string;
  source:         'F95Zone' | 'LewdCorner' | 'Autre';
  externalUrl?:   string | null;
  manualThreadId?: number | null;
  version?:       string | null;
  status?:        string | null;
  gameType?:      string | null;
  tags?:          string | null;
  image?:         string | null;
  synopsis?:      string | null;
};

/** Extrait un ID de thread depuis une URL F95Zone ou LewdCorner. */
export function extractThreadIdFromUrl(url: string): number | null {
  const m = url.match(/\/threads\/[^./]*\.(\d+)/);
  if (m) return parseInt(m[1], 10);
  const n = url.match(/\b(\d{4,9})\b/);
  if (n) return parseInt(n[1], 10);
  return null;
}

/**
 * Génère un pseudo-ID négatif unique pour les jeux sans identifiant externe.
 * Les IDs réels F95/LewdCorner sont toujours positifs — pas de collision possible.
 */
export function generateManualPseudoId(): number {
  const raw = Date.now() % 2000000000;
  return -(raw === 0 ? 1 : raw);
}

export function useCollection() {
  const { profile } = useAuth();
  const [items, setItems] = useState<UserCollectionEntryEnriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !profile?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await sb
        .from('user_collection')
        .select('*')
        .eq('owner_id', profile.id)
        .order('created_at', { ascending: false });
      if (err) {
        setError(err.message);
        setItems([]);
        return;
      }
      const rows = (data ?? []) as UserCollectionEntry[];
      // Enrichir avec f95_jeux (site_id = f95_thread_id)
      const siteIds = [...new Set(rows.map((r) => r.f95_thread_id))];
      let jeuxMap: Record<number, UserCollectionEntryEnriched['game']> = {};
      if (siteIds.length > 0) {
        const { data: jeux } = await sb
        .from('f95_jeux')
        .select(
          'site_id, ac, updated_at, nom_du_jeu, version, nom_url, image, statut, type, traducteur, traducteur_url, type_de_traduction, date_maj, f95_date_maj, type_maj, trad_ver, lien_trad, tags, synopsis_fr, synopsis_en'
        )
        .in('site_id', siteIds);
      if (jeux?.length) {
          // Groupement par site_id (clé F95/LewdCorner fiable et unique par jeu).
          // L'ancien groupement par nom_url pouvait fusionner deux jeux distincts
          // si nom_url était incorrect en base, provoquant des synopsis croisés.
          // Les variantes d'un même jeu partagent toujours le même site_id.
          const byKey = new Map<number | string, any[]>();
          for (const j of jeux as any[]) {
            const sid = j.site_id as number | null | undefined;
            // Clé numérique si site_id disponible, sinon clé interne unique
            const key: number | string = sid != null ? sid : `_id_${j.id}`;
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key)!.push(j);
          }
          for (const [key, group] of byKey) {
            const acMain = group.filter((r: any) => String(r.ac ?? '').trim() === '1');
            const acOther = group.filter((r: any) => String(r.ac ?? '').trim() !== '1');
            const byUpdated = (a: any, b: any) => (b.updated_at || '').localeCompare(a.updated_at || '');
            acMain.sort(byUpdated);
            acOther.sort(byUpdated);
            const sorted = [...acMain, ...acOther];
            const primary = sorted[0];
            const variants = sorted.slice(1).map((v: any) => ({
              id: v.id,
              trad_ver: v.trad_ver,
              lien_trad: v.lien_trad,
              type_de_traduction: v.type_de_traduction,
              nom_url: v.nom_url,
              traducteur: v.traducteur,
              traducteur_url: v.traducteur_url,
              version: v.version,
              statut: v.statut,
            }));
            const synopsisFr = (primary.synopsis_fr ?? '').trim();
            const synopsisEn = (primary.synopsis_en ?? '').trim();
            const gamePayload = {
              f95_jeux_id:          primary.id,
              nom_du_jeu:           primary.nom_du_jeu,
              version:              primary.version,
              nom_url:              primary.nom_url,
              image:                primary.image,
              statut:               primary.statut,
              type:                 primary.type,
              traducteur:           primary.traducteur,
              traducteur_url:       primary.traducteur_url,
              type_de_traduction:   primary.type_de_traduction,
              date_maj:             primary.date_maj,
              f95_date_maj:         primary.f95_date_maj ?? undefined,   // ← AJOUT
              type_maj:             primary.type_maj,
              trad_ver:             primary.trad_ver,
              lien_trad:            primary.lien_trad,
              tags:                 primary.tags ?? '',
              synopsis:             synopsisFr || synopsisEn || undefined,
              synopsis_fr:          synopsisFr || undefined,
              synopsis_en:          synopsisEn || undefined,
              variants:             variants.length > 0 ? variants : undefined,
            };
            // Assignation uniquement pour les clés numériques (site_id réels)
            // Les entrées sans site_id (jeux "Autre") ne peuvent pas être jointes
            if (typeof key === 'number') {
              jeuxMap[key] = gamePayload;
            }
          }
        }
      }
      setItems(
        rows.map((r) => {
          const fromCatalogue = jeuxMap[r.f95_thread_id];
          if (fromCatalogue) return { ...r, game: fromCatalogue };
          if (r.scraped_data) {
            const s = r.scraped_data;
            const synopsisFr = (s.synopsis_fr ?? '').trim();
            const synopsisEn = (s.synopsis ?? '').trim();
            const game: UserCollectionGameEnrichment = {
              nom_du_jeu: s.name ?? r.title ?? `Jeu #${r.f95_thread_id}`,
              version: s.version ?? '',
              nom_url: r.f95_url ?? `https://f95zone.to/threads/thread.${r.f95_thread_id}/`,
              image: s.image ?? undefined,
              statut: s.status ?? undefined,
              type: s.type ?? undefined,
              lien_trad: (s as Record<string, unknown>).lien_trad as string | undefined,
              traducteur_url: (s as Record<string, unknown>).traducteur_url as string | undefined,
              tags: tagsToString(s.tags) || undefined,
              synopsis: synopsisFr || synopsisEn || undefined,
              synopsis_fr: synopsisFr || undefined,
              synopsis_en: synopsisEn || undefined,
              // ← AJOUT : date de MAJ jeu depuis scraped_data (pour jeux hors catalogue f95_jeux)
              f95_date_maj: (s as Record<string, unknown>).f95_date_maj as string | undefined,
            };
            return { ...r, game };
          }
          return { ...r };
        })
      );
    } catch (e: any) {
      setError(e?.message || 'Erreur chargement collection');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const addByGame = useCallback(
    async (
      f95ThreadId: number,
      title?: string | null,
      f95Url?: string | null,
      scrapedData?: ScrapedData | null
    ) => {
      const sb = getSupabase();
      if (!sb || !profile?.id) return { ok: false, error: 'Non connecté' };
      try {
        const row: Record<string, unknown> = {
          owner_id: profile.id,
          f95_thread_id: f95ThreadId,
          title: title ?? null,
          f95_url: f95Url ?? null,
          updated_at: new Date().toISOString(),
        };
        if (scrapedData != null) row.scraped_data = scrapedData;
        const { error: err } = await sb.from('user_collection').upsert(row, {
          onConflict: 'owner_id,f95_thread_id',
        });
        if (err) return { ok: false, error: err.message };
        await fetchItems();
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message || 'Erreur ajout' };
      }
    },
    [profile?.id, fetchItems]
  );

  const resolveF95 = useCallback(
    async (
      urlOrId: string
    ): Promise<{
      ok: boolean;
      f95_thread_id?: number;
      title?: string;
      f95_url?: string;
      scraped_data?: ScrapedData | null;
      error?: string;
    }> => {
      const base = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
      const key = localStorage.getItem('apiKey') || '';
      if (!base || !key) return { ok: false, error: 'API non configurée' };
      const trimmed = urlOrId.trim();
      const isNumeric = /^\d+$/.test(trimmed);
      const body: Record<string, unknown> = isNumeric ? { f95_thread_id: parseInt(trimmed, 10) } : { url: trimmed };
      const f95Cookies = typeof localStorage !== 'undefined' ? localStorage.getItem('f95_cookies') : null;
      if (f95Cookies && f95Cookies.trim()) body.cookies = f95Cookies.trim();
      body.translate_synopsis = true;
      try {
        const headers = await createApiHeaders(key);
        const res = await fetch(`${base}/api/collection/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
        return {
          ok: true,
          f95_thread_id: data.f95_thread_id,
          title: data.title,
          f95_url: data.f95_url,
          scraped_data: data.scraped_data ?? null,
        };
      } catch (e: any) {
        return { ok: false, error: e?.message || 'Erreur réseau' };
      }
    },
    []
  );

  const addByUrlOrId = useCallback(
    async (urlOrId: string) => {
      const resolved = await resolveF95(urlOrId);
      if (!resolved.ok || resolved.f95_thread_id == null) return { ok: false, error: resolved.error };
      const result = await addByGame(
        resolved.f95_thread_id,
        resolved.title ?? null,
        resolved.f95_url ?? null,
        resolved.scraped_data ?? null
      );
      return { ...result, f95_thread_id: resolved.f95_thread_id };
    },
    [resolveF95, addByGame]
  );

  const addManual = useCallback(
    async (data: ManualGameData) => {
      const sb = getSupabase();
      if (!sb || !profile?.id) return { ok: false, error: 'Non connecté' };

      // Résolution du thread_id
      let threadId: number | null = data.manualThreadId ?? null;
      if (!threadId && data.externalUrl?.trim()) {
        threadId = extractThreadIdFromUrl(data.externalUrl.trim());
      }
      if (!threadId) {
        threadId = generateManualPseudoId();
      }

      // Construction de scraped_data (source de vérité pour l'affichage des jeux manuels)
      const scrapedData: ScrapedData & Record<string, unknown> = {
        name:        data.title,
        version:     data.version  ?? null,
        image:       data.image    ?? null,
        status:      data.status   ?? null,
        tags:        data.tags     ?? null,
        type:        data.gameType ?? null,
        synopsis:    data.synopsis ?? null,
        synopsis_fr: null,
        is_manual:   true,
        source:      data.source,
      };

      const f95Url =
        data.source === 'F95Zone' && threadId > 0
          ? `https://f95zone.to/threads/thread.${threadId}/`
          : data.externalUrl?.trim() || null;

      return addByGame(threadId, data.title, f95Url, scrapedData as ScrapedData);
    },
    [profile?.id, addByGame]
  );

  const updateCollectionEntry = useCallback(
    async (
      entryId: string,
      updates: {
        title?:        string | null;
        scraped_data?: Record<string, unknown> | null;
      }
    ) => {
      const sb = getSupabase();
      if (!sb || !profile?.id) return { ok: false, error: 'Non connecté' };
      try {
        const { error: err } = await sb
          .from('user_collection')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', entryId)
          .eq('owner_id', profile.id);
        if (err) return { ok: false, error: err.message };
        await fetchItems();
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message || 'Erreur mise à jour' };
      }
    },
    [profile?.id, fetchItems]
  );

  const remove = useCallback(
    async (id: string) => {
      const sb = getSupabase();
      if (!sb || !profile?.id) return { ok: false, error: 'Non connecté' };
      try {
        const { error: err } = await sb.from('user_collection').delete().eq('id', id).eq('owner_id', profile.id);
        if (err) return { ok: false, error: err.message };
        await fetchItems();
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message || 'Erreur suppression' };
      }
    },
    [profile?.id, fetchItems]
  );

  const updateLabels = useCallback(
    async (entryId: string, labels: CollectionLabel[]) => {
      const sb = getSupabase();
      if (!sb || !profile?.id) return { ok: false, error: 'Non connecté' };
      try {
        const { error: err } = await sb
          .from('user_collection')
          .update({ labels, updated_at: new Date().toISOString() })
          .eq('id', entryId)
          .eq('owner_id', profile.id);
        if (err) return { ok: false, error: err.message };
        setItems((prev) =>
          prev.map((r) => (r.id === entryId ? { ...r, labels } : r))
        );
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message || 'Erreur mise à jour labels' };
      }
    },
    [profile?.id]
  );

  const updateExecutablePaths = useCallback(
    async (entryId: string, executablePaths: ExecutablePathEntry[]) => {
      const sb = getSupabase();
      if (!sb || !profile?.id) return { ok: false, error: 'Non connecté' };
      try {
        const { error: err } = await sb
          .from('user_collection')
          .update({
            executable_paths: executablePaths,
            updated_at: new Date().toISOString(),
          })
          .eq('id', entryId)
          .eq('owner_id', profile.id);
        if (err) return { ok: false, error: err.message };
        setItems((prev) =>
          prev.map((r) =>
            r.id === entryId ? { ...r, executable_paths: executablePaths } : r
          )
        );
        return { ok: true };
      } catch (e: any) {
        return {
          ok: false,
          error: (e as Error)?.message || 'Erreur mise à jour chemins exécutables',
        };
      }
    },
    [profile?.id]
  );

  const allLabels = useMemo(() => {
    const seen = new Map<string, CollectionLabel>();
    items.forEach((entry) => {
      (entry.labels ?? []).forEach(({ label, color }) => {
        const key = label.trim().toLowerCase();
        if (key && !seen.has(key)) seen.set(key, { label: label.trim(), color });
      });
    });
    return Array.from(seen.values());
  }, [items]);

  return {
    items,
    loading,
    error,
    refresh: fetchItems,
    addByGame,
    addByUrlOrId,
    addManual,
    resolveF95,
    remove,
    updateCollectionEntry,
    updateLabels,
    updateExecutablePaths,
    allLabels,
  };
}
