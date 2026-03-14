import { useMemo, useState, useEffect, useCallback, useRef, useTransition } from 'react';
import { useCollection, type UserCollectionEntryEnriched } from '../../state/hooks/useCollection';
import { useTagAvoirs }   from '../../state/hooks/useTagAvoirs';
import { useToast }       from '../shared/ToastProvider';
import { tauriAPI }       from '../../lib/tauri-api';
import { getSupabase }    from '../../lib/supabase';
import { useF95Rss }      from '../../state/hooks/useF95Rss';
import type { GameF95, SyncStatus, CollectionSortMode, FilterCounts } from './library-types';
import { TABLE_HEADERS, getSyncStatus } from './library-constants';
import GameCard            from './components/GameCard';
import GameRow             from './components/GameRow';
import GameDetailModal     from './GameDetailModal';
import F95ImportAndCookiesBar from './components/F95ImportAndCookiesBar';
import ManualGameModal     from './components/ManualGameModal';
import EditGameModal       from './components/EditGameModal';
import TagAvoirsModal      from './components/TagAvoirsModal';
import CollectionToolbar   from './components/CollectionToolbar';
import { type FilterTagState   } from './components/FilterTagsPopover';
import { type FilterLabelState } from './components/FilterLabelsPopover';

// ── Intervalles de rafraîchissement RSS ──────────────────────────────────────

const RSS_INTERVALS: { label: string; value: number }[] = [
  { label: 'Manuel',   value: 0             },
  { label: '5 min',    value: 5  * 60_000   },
  { label: '15 min',   value: 15 * 60_000   },
  { label: '30 min',   value: 30 * 60_000   },
  { label: '1 heure',  value: 60 * 60_000   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeStatut(s: string): string {
  const t = (s ?? '').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function entryToGameF95(entry: UserCollectionEntryEnriched): GameF95 {
  const nomUrl =
    entry.f95_url ||
    entry.game?.nom_url ||
    `https://f95zone.to/threads/thread.${entry.f95_thread_id}/`;
  const g: GameF95 = {
    id:                entry.f95_thread_id,
    site_id:           entry.f95_thread_id,
    site:              '',
    nom_du_jeu:        entry.game?.nom_du_jeu ?? entry.title ?? `Jeu #${entry.f95_thread_id}`,
    nom_url:           nomUrl,
    version:           entry.game?.version ?? '',
    trad_ver:          entry.game?.trad_ver ?? '',
    lien_trad:         (typeof (entry.scraped_data as Record<string, unknown>)?.lien_trad === 'string'
      ? (entry.scraped_data as Record<string, unknown>).lien_trad as string
      : (entry.game?.lien_trad ?? '')),
    statut:            entry.game?.statut ?? '',
    tags:              entry.game?.tags ?? '',
    type:              entry.game?.type ?? '',
    traducteur:        entry.game?.traducteur ?? '',
    traducteur_url:    entry.game?.traducteur_url ?? '',
    relecture:         '',
    type_de_traduction: entry.game?.type_de_traduction ?? '',
    ac:                '',
    image:             entry.game?.image ?? '',
    type_maj:          entry.game?.type_maj ?? '',
    date_maj:          entry.game?.date_maj ?? '',
  };
  g._sync = getSyncStatus(g);

  if (entry.game?.synopsis_fr) g.synopsis_fr = entry.game.synopsis_fr;
  if (entry.game?.synopsis_en) g.synopsis_en = entry.game.synopsis_en;
  if (entry.game?.synopsis && !g.synopsis_en) g.synopsis_en = entry.game.synopsis;
  if (entry.game?.variants?.length)    g.variants    = entry.game.variants;
  if (entry.game?.f95_jeux_id != null) g.f95_jeux_id = entry.game.f95_jeux_id;
  if (entry.game?.f95_date_maj)        g.f95_date_maj = entry.game.f95_date_maj;

  const sd = entry.scraped_data as Record<string, unknown> | null;
  if (sd) {
    if (!g.synopsis_fr && sd.synopsis_fr) g.synopsis_fr = String(sd.synopsis_fr);
    if (!g.synopsis_en) {
      if (sd.synopsis_en) g.synopsis_en = String(sd.synopsis_en);
      else if (sd.synopsis) g.synopsis_en = String(sd.synopsis);
    }
    if (!g.image && sd.image) g.image = String(sd.image);
    if (!g.tags && sd.tags) {
      g.tags = Array.isArray(sd.tags)
        ? (sd.tags as string[]).join(', ')
        : String(sd.tags);
    }
  }
  return g;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = 'grid' | 'list';

interface CollectionViewProps {
  view: ViewMode;
  setView: (v: ViewMode) => void;
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function CollectionView({ view, setView }: CollectionViewProps) {
  const {
    items, loading, error, addByUrlOrId, addManual, remove, refresh,
    updateCollectionEntry, updateLabels, updateExecutablePaths, allLabels,
  } = useCollection();
  const { getAvoir, setAvoir }         = useTagAvoirs();
  const { showToast }                  = useToast();
  const filterTagsAnchorRef            = useRef<HTMLButtonElement>(null);
  const filterLabelsAnchorRef          = useRef<HTMLButtonElement>(null);

  // ── RSS — fréquence configurable ─────────────────────────────────────────
  const [rssIntervalMs, setRssIntervalMs] = useState<number>(() => {
    try { return Number(localStorage.getItem('collection_rss_interval') ?? '0') || 0; }
    catch { return 0; }
  });
  useEffect(() => {
    try { localStorage.setItem('collection_rss_interval', String(rssIntervalMs)); }
    catch { /* ignore */ }
  }, [rssIntervalMs]);

  const { dateMap: rssDateMap, loading: rssLoading, lastFetch: rssLastFetch, refresh: refreshRss }
    = useF95Rss(rssIntervalMs > 0 ? rssIntervalMs : null);

  // ── Autres états ──────────────────────────────────────────────────────────
  const [importInput,   setImportInput]   = useState('');
  const [importing,     setImporting]     = useState(false);
  const [selectedGameForDetail,  setSelectedGameForDetail]  = useState<GameF95 | null>(null);
  const [selectedEntryForDetail, setSelectedEntryForDetail] = useState<UserCollectionEntryEnriched | null>(null);
  const [pendingOpenThreadId,    setPendingOpenThreadId]    = useState<number | null>(null);
  const [showTagAvoirsModal, setShowTagAvoirsModal] = useState(false);
  const [showManualModal,    setShowManualModal]    = useState(false);
  const [editEntry, setEditEntry]   = useState<UserCollectionEntryEnriched | null>(null);
  const [filterTagsOpen,    setFilterTagsOpen]    = useState(false);
  const [filterTagsByTag,   setFilterTagsByTag]   = useState<Record<string, FilterTagState>>({});
  const [filterLabelsByLabel, setFilterLabelsByLabel] = useState<Record<string, FilterLabelState>>({});
  const [filterLabelsOpen,  setFilterLabelsOpen]  = useState(false);
  const [deleteMode,   setDeleteMode]   = useState(false);
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set());
  const [isDeleting,   setIsDeleting]   = useState(false);
  const [sortMode, setSortMode] = useState<CollectionSortMode>(() => {
    try {
      const v = localStorage.getItem('collection_sort_mode');
      const valid: CollectionSortMode[] = [
        'alpha_asc','alpha_desc','date_added_asc','date_added_desc',
        'game_update_desc','trad_update_desc',
      ];
      return valid.includes(v as CollectionSortMode) ? (v as CollectionSortMode) : 'alpha_asc';
    } catch { return 'alpha_asc'; }
  });
  useEffect(() => {
    try { localStorage.setItem('collection_sort_mode', sortMode); } catch { /* ignore */ }
  }, [sortMode]);

  const [, startTransition] = useTransition();
  const [f95CookieInput, setF95CookieInput] = useState(() => {
    try { return localStorage.getItem('f95_cookies') ?? ''; } catch { return ''; }
  });

  // ── Ouvre la modale détail quand l'item en attente est disponible ─────────
  useEffect(() => {
    if (pendingOpenThreadId == null) return;
    const entry = items.find(i => i.f95_thread_id === pendingOpenThreadId);
    if (entry) {
      setSelectedGameForDetail(entryToGameF95(entry));
      setSelectedEntryForDetail(entry);
      setPendingOpenThreadId(null);
    }
  }, [items, pendingOpenThreadId]);

  // ── Rafraîchit les données de la modale quand la collection change ────────
  useEffect(() => {
    if (!selectedEntryForDetail) return;
    const tid = selectedEntryForDetail.f95_thread_id;
    const updated = items.find(i => i.f95_thread_id === tid);
    if (updated) {
      setSelectedGameForDetail(entryToGameF95(updated));
      setSelectedEntryForDetail(updated);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // ── Enrichissement silencieux après import Tampermonkey ───────────────────
  const triggerSilentEnrichment = useCallback(async (threadId: number) => {
    const sb = getSupabase();
    if (!sb) return;
    const base = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
    const key  = localStorage.getItem('apiKey') || '';
    if (!base || !key) return;
    let collData: { id: string; scraped_data: Record<string, any> } | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 800 * attempt));
      const { data } = await sb
        .from('user_collection').select('id, scraped_data')
        .eq('f95_thread_id', threadId).maybeSingle();
      if (data?.scraped_data) { collData = data; break; }
    }
    if (!collData?.scraped_data) return;
    const sd = collData.scraped_data as Record<string, any>;
    if (sd.synopsis_fr) return;
    const synopsisEn = sd.synopsis_en || sd.synopsis;
    if (!synopsisEn) return;
    try {
      const res = await fetch(`${base}/api/translate`, {
        method: 'POST',
        headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: synopsisEn, source_lang: 'en', target_lang: 'fr' }),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok && json.translated) {
        await sb.from('user_collection')
          .update({ scraped_data: { ...sd, synopsis_fr: json.translated } })
          .eq('id', collData.id);
        showToast('✅ Synopsis traduit automatiquement', 'success');
        refresh();
      }
    } catch { /* silencieux */ }
  }, [showToast, refresh]);

  // ── Écoute des ajouts Tampermonkey ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { threadId } = (e as CustomEvent<{ threadId: number }>).detail;
      refresh();
      setPendingOpenThreadId(threadId);
      triggerSilentEnrichment(threadId);
    };
    window.addEventListener('collection:game-added', handler);
    return () => window.removeEventListener('collection:game-added', handler);
  }, [refresh, triggerSilentEnrichment]);

  // ── Filtres ───────────────────────────────────────────────────────────────
  const [search,        setSearch]        = useState('');
  const [filterStatut,  setFilterStatut]  = useState('');
  const [filterTrad,    setFilterTrad]    = useState('');
  const [filterType,    setFilterType]    = useState('');
  const [filterTradType,setFilterTradType]= useState('');
  const [filterSync,    setFilterSync]    = useState<'' | SyncStatus>('');
  const [pageSize,      setPageSize]      = useState<number>(() => {
    try {
      const v = localStorage.getItem('library_page_size');
      const n = v ? parseInt(v, 10) : 100;
      return [50, 100, 250, 500, 1000, -1].includes(n) ? n : 100;
    } catch { return 100; }
  });
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    try { localStorage.setItem('library_page_size', String(pageSize)); } catch { }
  }, [pageSize]);

  const saveF95Cookies = useCallback(() => {
    try {
      const v = f95CookieInput.trim();
      if (v) localStorage.setItem('f95_cookies', v);
      else localStorage.removeItem('f95_cookies');
      showToast(v ? 'Cookies F95 enregistrés.' : 'Cookies F95 supprimés.', 'success');
    } catch { showToast('Erreur enregistrement', 'error'); }
  }, [f95CookieInput, showToast]);

  // ── Données enrichies ─────────────────────────────────────────────────────
  const gamesEnriched = useMemo(() => items.map(entryToGameF95), [items]);

  // ── Compteurs de filtres (calculés sur l'ensemble complet) ────────────────
  const filterCounts = useMemo((): FilterCounts => {
    const st: Record<string, number> = {};
    const tr: Record<string, number> = {};
    const ty: Record<string, number> = {};
    const tt: Record<string, number> = {};
    for (const g of gamesEnriched) {
      if (g.statut)              st[g.statut]              = (st[g.statut]              ?? 0) + 1;
      if (g.traducteur)          tr[g.traducteur]          = (tr[g.traducteur]          ?? 0) + 1;
      if (g.type)                ty[g.type]                = (ty[g.type]                ?? 0) + 1;
      if (g.type_de_traduction)  tt[g.type_de_traduction]  = (tt[g.type_de_traduction]  ?? 0) + 1;
    }
    return { statuts: st, traducteurs: tr, types: ty, tradTypes: tt };
  }, [gamesEnriched]);

  const statuts    = useMemo(() =>
    [...new Map(
      gamesEnriched.map(g => g.statut).filter(Boolean)
        .map(s => [normalizeStatut(s!), s!] as [string, string])
    ).values()].sort()
  , [gamesEnriched]);

  const traducteurs = useMemo(() => [...new Set(gamesEnriched.map(g => g.traducteur).filter(Boolean))].sort(), [gamesEnriched]);
  const types       = useMemo(() => [...new Set(gamesEnriched.map(g => g.type).filter(Boolean))].sort(), [gamesEnriched]);
  const tradTypes   = useMemo(() => [...new Set(gamesEnriched.map(g => g.type_de_traduction).filter(Boolean))].sort(), [gamesEnriched]);

  const allUniqueTags = useMemo(() => {
    const set = new Set<string>();
    gamesEnriched.forEach(g => {
      (g.tags ?? '').split(',').map(t => t.trim()).filter(Boolean).forEach(t => set.add(t));
    });
    return [...set].sort();
  }, [gamesEnriched]);

  const syncCounts = useMemo(() => {
    const c = { ok: 0, outdated: 0, unknown: 0 };
    gamesEnriched.forEach(g => { const s = g._sync ?? 'unknown'; if (s in c) c[s as keyof typeof c]++; });
    return c;
  }, [gamesEnriched]);

  const entryById = useMemo(() => {
    const map = new Map<number, UserCollectionEntryEnriched>();
    items.forEach(e => map.set(e.f95_thread_id, e));
    return map;
  }, [items]);

  // ── Tri + filtrage ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = gamesEnriched.filter(g => {
      if (q && !g.nom_du_jeu.toLowerCase().includes(q) && !(g.traducteur || '').toLowerCase().includes(q)) return false;
      if (filterStatut  && normalizeStatut(g.statut || '') !== normalizeStatut(filterStatut)) return false;
      if (filterTrad    && g.traducteur          !== filterTrad)     return false;
      if (filterType    && g.type                !== filterType)     return false;
      if (filterTradType && g.type_de_traduction !== filterTradType) return false;
      if (filterSync    && g._sync               !== filterSync)     return false;

      const tagList       = (g.tags ?? '').split(',').map(t => t.trim()).filter(Boolean);
      const inclTags      = Object.entries(filterTagsByTag).filter(([, v]) => v === 'include').map(([k]) => k);
      const exclTags      = Object.entries(filterTagsByTag).filter(([, v]) => v === 'exclude').map(([k]) => k);
      if (exclTags.length > 0 && exclTags.some(t => tagList.includes(t))) return false;
      if (inclTags.length > 0 && !tagList.some(t => inclTags.includes(t))) return false;

      const entry         = entryById.get(g.site_id);
      const entryLabels   = (entry?.labels ?? []).map(l => l.label);
      const inclLabels    = Object.entries(filterLabelsByLabel).filter(([, v]) => v === 'include').map(([k]) => k);
      const exclLabels    = Object.entries(filterLabelsByLabel).filter(([, v]) => v === 'exclude').map(([k]) => k);
      if (exclLabels.length > 0 && exclLabels.some(l => entryLabels.includes(l))) return false;
      if (inclLabels.length > 0 && !entryLabels.some(l => inclLabels.includes(l))) return false;

      return true;
    });

    switch (sortMode) {
      case 'alpha_asc':
        return list.sort((a, b) => a.nom_du_jeu.localeCompare(b.nom_du_jeu, 'fr', { sensitivity: 'base' }));

      case 'alpha_desc':
        return list.sort((a, b) => b.nom_du_jeu.localeCompare(a.nom_du_jeu, 'fr', { sensitivity: 'base' }));

      case 'date_added_asc':
      case 'date_added_desc': {
        const dir = sortMode === 'date_added_asc' ? 1 : -1;
        return list.sort((a, b) => {
          const da = entryById.get(a.site_id)?.created_at ?? '';
          const db = entryById.get(b.site_id)?.created_at ?? '';
          return da < db ? -dir : da > db ? dir : 0;
        });
      }

      case 'game_update_desc':
        return list.sort((a, b) => {
          // Priorité 1 : date RSS (temps réel, ~48h)
          const da_rss = rssDateMap.get(a.site_id) ?? '';
          const db_rss = rssDateMap.get(b.site_id) ?? '';
      
          // Priorité 2 : f95_date_maj scrapé (historique)
          const da = da_rss || a.f95_date_maj || '';
          const db = db_rss || b.f95_date_maj || '';
      
          if (!da && !db) return a.nom_du_jeu.localeCompare(b.nom_du_jeu, 'fr', { sensitivity: 'base' });
          if (!da) return 1;
          if (!db) return -1;
          return db.localeCompare(da);
        });

      case 'trad_update_desc':
        // Tri par date de MAJ de la traduction (f95_jeux.date_maj)
        return list.sort((a, b) => {
          const da = entryById.get(a.site_id)?.game?.date_maj ?? '';
          const db = entryById.get(b.site_id)?.game?.date_maj ?? '';
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          return db.localeCompare(da);
        });

      default:
        return list;
    }
  }, [
    gamesEnriched, search, filterStatut, filterTrad, filterType, filterTradType,
    filterSync, filterTagsByTag, filterLabelsByLabel, entryById, sortMode, rssDateMap,
  ]);

  const totalPages    = pageSize === -1 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const effectivePage = Math.min(currentPage, totalPages - 1);
  const paginatedItems = useMemo(() => {
    if (pageSize === -1) return filtered;
    const start = effectivePage * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSize, effectivePage]);

  useEffect(() => {
    setCurrentPage(p => Math.min(p, Math.max(0, totalPages - 1)));
  }, [totalPages]);

  const resetFilters = () => {
    setSearch(''); setFilterStatut(''); setFilterTrad(''); setFilterType('');
    setFilterTradType(''); setFilterSync(''); setFilterTagsByTag({}); setFilterLabelsByLabel({});
  };

  const cycleFilterTag = useCallback((tag: string) => {
    setFilterTagsByTag(prev => {
      const cur  = prev[tag];
      const next = cur === undefined ? 'include' : cur === 'include' ? 'exclude' : undefined;
      const r = { ...prev };
      if (next === undefined) delete r[tag]; else r[tag] = next;
      return r;
    });
  }, []);

  const cycleFilterLabel = useCallback((label: string) => {
    setFilterLabelsByLabel(prev => {
      const cur  = prev[label];
      const next = cur === undefined ? 'include' : cur === 'include' ? 'exclude' : undefined;
      const r = { ...prev };
      if (next === undefined) delete r[label]; else r[label] = next;
      return r;
    });
  }, []);

  const resetFiltersAndRefresh = () => { resetFilters(); refresh(); };

  const toggleSort = useCallback((key: string) => {
    if (key === 'nom_du_jeu') {
      setSortMode(prev => prev === 'alpha_asc' ? 'alpha_desc' : 'alpha_asc');
    }
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleAddByUrlOrId = async () => {
    const raw = importInput.trim();
    if (!raw) { showToast('Saisissez une URL F95 ou un ID de thread', 'info'); return; }
    setImporting(true);
    try {
      const result = await addByUrlOrId(raw);
      if (result.ok) {
        showToast('Ajouté à ma collection', 'success');
        setImportInput('');
        if ('f95_thread_id' in result && result.f95_thread_id != null) {
          setPendingOpenThreadId(result.f95_thread_id);
          triggerSilentEnrichment(result.f95_thread_id as number);
        }
      } else { showToast(result.error || 'Erreur ajout', 'error'); }
    } finally { setImporting(false); }
  };

  const handleAddManual = async (data: Parameters<typeof addManual>[0]) => {
    const result = await addManual(data);
    if (result.ok) showToast('Jeu ajouté à la collection', 'success');
    else showToast(result.error || "Erreur lors de l'ajout", 'error');
    return result;
  };

  const handleEdit = async (entryId: string, updates: Parameters<typeof updateCollectionEntry>[1]) => {
    const result = await updateCollectionEntry(entryId, updates);
    if (result.ok) showToast('Modifications enregistrées', 'success');
    else showToast(result.error || 'Erreur lors de la mise à jour', 'error');
    return result;
  };

  const toggleDeleteMode = useCallback(() => {
    setDeleteMode(prev => { if (prev) setSelectedIds(new Set()); return !prev; });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    startTransition(() => {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    });
  }, []);

  const selectAll = useCallback(() => {
    startTransition(() => {
      setSelectedIds(new Set(
        filtered.map(g => { const e = entryById.get(g.site_id); return e?.id ?? ''; }).filter(Boolean)
      ));
    });
  }, [filtered, entryById]);

  const selectNone = useCallback(() => { startTransition(() => setSelectedIds(new Set())); }, []);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    const ids = [...selectedIds];
    const results = await Promise.allSettled(ids.map(id => remove(id)));
    let ok = 0, err = 0;
    results.forEach(r => { if (r.status === 'fulfilled' && r.value.ok) ok++; else err++; });
    setIsDeleting(false);
    setSelectedIds(new Set());
    setDeleteMode(false);
    refresh();
    if (ok > 0) showToast(`${ok} jeu(x) retiré(s) de la collection`, 'success');
    if (err > 0) showToast(`${err} erreur(s) lors de la suppression`, 'error');
  }, [selectedIds, remove, refresh, showToast]);

  const sortKey = sortMode === 'alpha_desc' ? 'nom_du_jeu' : sortMode === 'alpha_asc' ? 'nom_du_jeu' : '';
  const sortDir: 1 | -1 = sortMode === 'alpha_desc' ? -1 : 1;

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div className="library-collection-view">

      {/* ── Barre 1 : Import + Recherche ── */}
      <div className="library-toolbar library-toolbar--add-and-cookies">
        <F95ImportAndCookiesBar
          importInput={importInput} setImportInput={setImportInput}
          importing={importing} onAddByUrlOrId={handleAddByUrlOrId}
          onAddManual={() => setShowManualModal(true)}
          f95CookieInput={f95CookieInput} setF95CookieInput={setF95CookieInput}
          onSaveCookies={saveF95Cookies}
          onOpenF95Login={async () => {
            const res = await tauriAPI.openF95LoginWindow();
            if (!res.ok) showToast(res.error ?? 'Erreur', 'error');
          }}
          search={search} setSearch={setSearch}
        />
      </div>

      {/* ── Barre 2 : Filtres & actions ── */}
      <CollectionToolbar
        filterSync={filterSync}         setFilterSync={setFilterSync}
        syncCounts={syncCounts}         gamesCount={gamesEnriched.length}
        sortMode={sortMode}             setSortMode={setSortMode}
        statuts={statuts}               filterStatut={filterStatut}     setFilterStatut={setFilterStatut}
        traducteurs={traducteurs}       filterTrad={filterTrad}         setFilterTrad={setFilterTrad}
        types={types}                   filterType={filterType}         setFilterType={setFilterType}
        tradTypes={tradTypes}           filterTradType={filterTradType} setFilterTradType={setFilterTradType}
        pageSize={pageSize}             setPageSize={setPageSize}
        filterTagsByTag={filterTagsByTag}         filterTagsOpen={filterTagsOpen}   setFilterTagsOpen={setFilterTagsOpen}
        filterTagsAnchorRef={filterTagsAnchorRef} allUniqueTags={allUniqueTags}     cycleFilterTag={cycleFilterTag}
        filterLabelsByLabel={filterLabelsByLabel} filterLabelsOpen={filterLabelsOpen} setFilterLabelsOpen={setFilterLabelsOpen}
        filterLabelsAnchorRef={filterLabelsAnchorRef} allLabels={allLabels}         cycleFilterLabel={cycleFilterLabel}
        filterCounts={filterCounts}
        rssLoading={rssLoading}
        onOpenTagAvoirsModal={() => setShowTagAvoirsModal(true)}
        view={view}                     setView={setView}
        onResetFiltersAndRefresh={resetFiltersAndRefresh}
        loading={loading}
        deleteMode={deleteMode}         onToggleDeleteMode={toggleDeleteMode}
      />

      {/* ── Barre 3 : Contrôle RSS (visible seulement en mode game_update_desc) ── */}
      {sortMode === 'game_update_desc' && (
        <div className="library-rss-bar">
          <span className="library-rss-bar__label">
            {rssLoading
              ? '⏳ Chargement RSS F95…'
              : rssLastFetch
                ? `📡 RSS · ${rssLastFetch.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                : '📡 Flux RSS F95'}
          </span>
          <select
            className="app-select library-rss-bar__select"
            value={rssIntervalMs}
            onChange={e => setRssIntervalMs(Number(e.target.value))}
            title="Fréquence de mise à jour du flux RSS"
          >
            {RSS_INTERVALS.map(({ label, value }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button
            type="button"
            className="form-btn form-btn--ghost form-btn--sm"
            onClick={refreshRss}
            disabled={rssLoading}
            title="Rafraîchir le flux RSS maintenant"
          >↻</button>
        </div>
      )}

      {deleteMode && (
        <div className="collection-delete-banner">
          <div className="collection-delete-banner__info">
            <span className="collection-delete-banner__count">
              {selectedIds.size > 0
                ? `${selectedIds.size} jeu${selectedIds.size > 1 ? 'x' : ''} sélectionné${selectedIds.size > 1 ? 's' : ''}`
                : 'Aucun jeu sélectionné'}
            </span>
            <span className="collection-delete-banner__hint">— Cliquez sur les tuiles pour sélectionner</span>
          </div>
          <div className="collection-delete-banner__actions">
            <button type="button" className="form-btn form-btn--ghost collection-delete-banner__btn-select" onClick={selectAll}>☑ Tout sélectionner</button>
            <button type="button" className="form-btn form-btn--ghost collection-delete-banner__btn-select" onClick={selectNone} disabled={selectedIds.size === 0}>☐ Rien sélectionner</button>
            <button type="button" className="form-btn collection-delete-banner__btn-delete" onClick={handleDeleteSelected} disabled={selectedIds.size === 0 || isDeleting}>
              {isDeleting ? '⏳ Suppression…' : `🗑️ Supprimer (${selectedIds.size})`}
            </button>
            <button type="button" className="form-btn form-btn--ghost" onClick={toggleDeleteMode}>✕ Annuler</button>
          </div>
        </div>
      )}

      <div className="library-content styled-scrollbar">
        {loading && <div className="library-loading"><span className="library-loading-icon">⏳</span> Chargement de la collection…</div>}

        {error && !loading && (
          <div className="library-error">❌ {error}<br />
            <button type="button" className="library-retry-btn" onClick={refresh}>Réessayer</button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="library-empty">📭 Aucun jeu dans votre collection. Ajoutez-en via l'onglet Bibliothèque ou avec une URL / ID F95 ci-dessus.</div>
        )}

        {!loading && !error && items.length > 0 && filtered.length === 0 && (
          <div className="library-empty">🔍 Aucun résultat pour ces filtres.</div>
        )}

        {!loading && !error && view === 'grid' && filtered.length > 0 && (
          <div className="library-grid">
            {paginatedItems.map(game => {
              const entry = entryById.get(game.site_id);
              if (!entry) return null;
              const isSelected = selectedIds.has(entry.id);
              return (
                <div
                  key={entry.id}
                  className={`library-collection-card-wrap${deleteMode ? ' library-collection-card-wrap--delete-mode' : ''}${isSelected ? ' library-collection-card-wrap--selected' : ''}`}
                  onClick={deleteMode ? () => toggleSelect(entry.id) : undefined}
                  role={deleteMode ? 'checkbox' : undefined}
                  aria-checked={deleteMode ? isSelected : undefined}
                >
                  {deleteMode && <div className="collection-card-checkbox" aria-hidden="true">{isSelected ? '✔' : ''}</div>}
                  <GameCard
                    game={game} post={null} onEdit={() => {}} showDateBadge={false}
                    isInCollection={true}
                    collectionEntry={{ id: entry.id, labels: entry.labels ?? null, executable_paths: entry.executable_paths ?? null }}
                    allLabels={allLabels}
                    onUpdateLabels={updateLabels} onUpdateExecutablePaths={updateExecutablePaths}
                    onLabelsUpdated={refresh} clickDisabled={deleteMode}
                    onOpenEdit={deleteMode ? undefined : () => setEditEntry(entry)}
                  />
                  {!deleteMode && (
                    <button type="button" className="library-collection-card-edit"
                      onClick={e => { e.stopPropagation(); setEditEntry(entry); }}
                      title="Modifier les données de ce jeu"
                    >✏️</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && !error && view === 'list' && filtered.length > 0 && (
          <table className="library-table">
            <thead>
              <tr>
                {deleteMode && <th className="library-table-th library-table-th--checkbox" />}
                {TABLE_HEADERS.map(([k, h]) => (
                  <th
                    key={h}
                    className={`library-table-th ${k ? 'library-table-th--sortable' : ''} ${k === sortKey && (sortMode === 'alpha_asc' || sortMode === 'alpha_desc') ? 'library-table-th--active' : ''} ${k === '_sync' || k === 'statut' || k === 'type_maj' || k === null ? 'library-table-th--center' : 'library-table-th--left'}`}
                    onClick={k ? () => toggleSort(k) : undefined}
                  >
                    {h}{k === 'nom_du_jeu' && (sortMode === 'alpha_asc' || sortMode === 'alpha_desc') ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map(game => {
                const entry = entryById.get(game.site_id);
                if (!entry) return null;
                const isSelected = selectedIds.has(entry.id);
                return (
                  <GameRow
                    key={entry.id} game={game} post={null}
                    onEdit={() => setEditEntry(entry)} onEditEntry={() => setEditEntry(entry)}
                    onOpenDetail={deleteMode ? undefined : () => {
                      setSelectedGameForDetail(game);
                      setSelectedEntryForDetail(entry);
                    }}
                    deleteMode={deleteMode} selected={isSelected}
                    onToggleSelect={() => toggleSelect(entry.id)}
                    collectionEntry={{ id: entry.id, labels: entry.labels ?? null }}
                  />
                );
              })}
            </tbody>
          </table>
        )}

        {!loading && !error && filtered.length > 0 && totalPages > 1 && (
          <div className="library-pagination">
            <span>
              Page {effectivePage + 1} sur {totalPages}
              {pageSize !== -1 && (
                <span className="library-pagination-detail">
                  ({effectivePage * pageSize + 1}–{Math.min((effectivePage + 1) * pageSize, filtered.length)} sur {filtered.length})
                </span>
              )}
            </span>
            <button type="button" className="library-pagination-btn app-input" disabled={effectivePage === 0} onClick={() => setCurrentPage(p => Math.max(0, p - 1))}>← Précédent</button>
            <button type="button" className="library-pagination-btn app-input" disabled={effectivePage >= totalPages - 1} onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}>Suivant →</button>
          </div>
        )}

        {showManualModal && <ManualGameModal onClose={() => setShowManualModal(false)} onSubmit={handleAddManual} />}
        {editEntry && <EditGameModal entry={editEntry} onClose={() => setEditEntry(null)} onSubmit={handleEdit} />}
        {showTagAvoirsModal && (
          <TagAvoirsModal allTags={allUniqueTags} getAvoir={getAvoir} onSetAvoir={setAvoir} onClose={() => setShowTagAvoirsModal(false)} />
        )}
        {selectedGameForDetail && (
          <GameDetailModal
            game={selectedGameForDetail}
            onClose={() => { setSelectedGameForDetail(null); setSelectedEntryForDetail(null); }}
            isInCollection={true}
            collectionEntry={selectedEntryForDetail ? {
              id: selectedEntryForDetail.id,
              labels: selectedEntryForDetail.labels ?? null,
              executable_paths: selectedEntryForDetail.executable_paths ?? null,
            } : undefined}
            allLabels={allLabels}
            onUpdateLabels={updateLabels} onUpdateExecutablePaths={updateExecutablePaths}
            onLabelsUpdated={refresh}
            onOpenEdit={selectedEntryForDetail ? () => {
              setSelectedGameForDetail(null);
              setSelectedEntryForDetail(null);
              setEditEntry(selectedEntryForDetail);
            } : undefined}
          />
        )}
      </div>
    </div>
  );
}