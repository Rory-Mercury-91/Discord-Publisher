import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppMode, GameF95, SyncStatus } from './library-types';
import { getSyncStatus, TABLE_HEADERS } from './library-constants';
import GameCard from './components/GameCard';
import GameRow from './components/GameRow';
import GameDetailModal from './GameDetailModal';
import { useApp } from '../../state/appContext';
import { useToast } from '../shared/ToastProvider';
import Toggle from '../shared/Toggle';
import { StatsView } from '../stats';
import { useCollection } from '../../state/hooks/useCollection';
import { useTagAvoirs } from '../../state/hooks/useTagAvoirs';
import CollectionView from './CollectionView';
import FilterTagsPopover, { type FilterTagState } from './components/FilterTagsPopover';
import TagAvoirsModal from './components/TagAvoirsModal';

export default function LibraryView({ onModeChange }: { onModeChange: (m: AppMode) => void }) {
  const { publishedPosts, loadPostForEditing } = useApp();
  const { showToast } = useToast();
  const { items: collectionItems, addByGame, refresh: refreshCollection } = useCollection();
  const { getAvoir, setAvoir } = useTagAvoirs();

  const [games, setGames] = useState<GameF95[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'library' | 'stats' | 'collection'>('library');
  const [view, setView] = useState<'grid' | 'list'>(() => {
    try {
      const v = localStorage.getItem('library_view');
      return v === 'list' || v === 'grid' ? v : 'grid';
    } catch {
      return 'grid';
    }
  });
  const [selectedGameForDetail, setSelectedGameForDetail] = useState<GameF95 | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterTrad, setFilterTrad] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterTradType, setFilterTradType] = useState('');
  const [filterSync, setFilterSync] = useState<'' | SyncStatus>('');
  const [filterTagsByTag, setFilterTagsByTag] = useState<Record<string, FilterTagState>>({});
  const [filterTagsOpen, setFilterTagsOpen] = useState(false);
  const [showTagAvoirsModal, setShowTagAvoirsModal] = useState(false);
  const filterTagsAnchorRef = useRef<HTMLButtonElement>(null);
  const [sortKey, setSortKey] = useState('nom_du_jeu');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [dateSort, setDateSort] = useState(false);
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      const v = localStorage.getItem('library_page_size');
      const n = v ? parseInt(v, 10) : 100;
      return [50, 100, 250, 500, 1000, -1].includes(n) ? n : 100;
    } catch {
      return 100;
    }
  });
  const [currentPage, setCurrentPage] = useState(0);

  const handleDateSortChange = (checked: boolean) => {
    setDateSort(checked);
    if (!checked) setSortKey('nom_du_jeu');
  };

  useEffect(() => {
    try { localStorage.setItem('library_page_size', String(pageSize)); } catch { /* ignore */ }
  }, [pageSize]);

  useEffect(() => {
    try { localStorage.setItem('library_view', view); } catch { /* ignore */ }
  }, [view]);

  useEffect(() => {
    setCurrentPage(0);
  }, [search, filterStatut, filterTrad, filterType, filterTradType, filterSync, filterTagsByTag]);

  const prevTabRef = useRef<'library' | 'stats' | 'collection'>(tab);
  useEffect(() => {
    if (prevTabRef.current === 'collection' && tab === 'library') {
      refreshCollection();
    }
    prevTabRef.current = tab;
  }, [tab, refreshCollection]);

  const handleEdit = useCallback(
    (post: any) => {
      loadPostForEditing(post);
      onModeChange('translator');
      showToast('Post chargé — passage en mode Traducteur', 'info');
    },
    [loadPostForEditing, onModeChange, showToast]
  );

  const fetchGames = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
      const key = localStorage.getItem('apiKey') || '';
      const res = await fetch(`${base}/api/jeux`, { headers: { 'X-API-KEY': key } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: GameF95[] = Array.isArray(data) ? data : (data.jeux ?? []);
      setGames(list);
      setLastSync(new Date());
    } catch (e: any) {
      setError(e.message || 'Erreur réseau');
      showToast('❌ Impossible de charger la bibliothèque', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchGames(); }, [fetchGames]);

  const postByGameLink = useMemo(() => {
    const map = new Map<string, (typeof publishedPosts)[0]>();
    for (const p of publishedPosts) {
      const gl = p.savedInputs?.['Game_link'] || '';
      if (gl) {
        const m = gl.match(/threads\/(?:[^/]*\.)?(\d+)/);
        if (m) map.set(m[1], p);
        map.set(gl.toLowerCase(), p);
      }
    }
    return map;
  }, [publishedPosts]);

  const findPost = useCallback(
    (g: GameF95) => {
      const byId = postByGameLink.get(String(g.site_id));
      if (byId) return byId;
      for (const [k, v] of postByGameLink) if (k.includes(String(g.site_id))) return v;
      return null;
    },
    [postByGameLink]
  );

  const gamesEnriched = useMemo<GameF95[]>(
    () => games.map((g) => ({ ...g, _sync: getSyncStatus(g) })),
    [games]
  );

  const syncCounts = useMemo(() => {
    const c = { ok: 0, outdated: 0, unknown: 0 };
    gamesEnriched.forEach((g) => c[g._sync!]++);
    return c;
  }, [gamesEnriched]);

  const statuts    = useMemo(() => [...new Set(games.map((g) => g.statut).filter(Boolean))].sort(), [games]);
  const traducteurs = useMemo(() => [...new Set(games.map((g) => g.traducteur).filter(Boolean))].sort(), [games]);
  const types      = useMemo(() => [...new Set(games.map((g) => g.type).filter(Boolean))].sort(), [games]);
  const tradTypes  = useMemo(() => [...new Set(games.map((g) => g.type_de_traduction).filter(Boolean))].sort(), [games]);

  /** Tous les tags uniques de la bibliothèque (pour FilterTagsPopover + TagAvoirsModal) */
  const allUniqueTags = useMemo(() => {
    const set = new Set<string>();
    gamesEnriched.forEach((g) => {
      (g.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean).forEach((t) => set.add(t));
    });
    return [...set].sort();
  }, [gamesEnriched]);

  const cycleFilterTag = useCallback((tag: string) => {
    setFilterTagsByTag((prev) => {
      const current = prev[tag];
      const next = current === undefined ? 'include' : current === 'include' ? 'exclude' : undefined;
      const nextRec = { ...prev };
      if (next === undefined) delete nextRec[tag]; else nextRec[tag] = next;
      return nextRec;
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const includedTags = Object.entries(filterTagsByTag).filter(([, v]) => v === 'include').map(([k]) => k);
    const excludedTags = Object.entries(filterTagsByTag).filter(([, v]) => v === 'exclude').map(([k]) => k);

    let list = gamesEnriched.filter((g) => {
      if (q && !g.nom_du_jeu.toLowerCase().includes(q) && !(g.traducteur || '').toLowerCase().includes(q))
        return false;
      if (filterStatut   && g.statut             !== filterStatut)   return false;
      if (filterTrad     && g.traducteur          !== filterTrad)     return false;
      if (filterType     && g.type                !== filterType)     return false;
      if (filterTradType && g.type_de_traduction  !== filterTradType) return false;
      if (filterSync     && g._sync               !== filterSync)     return false;

      const tagList = (g.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
      if (excludedTags.length > 0 && excludedTags.some((t) => tagList.includes(t))) return false;
      if (includedTags.length > 0 && !tagList.some((t) => includedTags.includes(t))) return false;

      return true;
    });

    if (dateSort) {
      return list.sort((a, b) => {
        const da = a.date_maj || '', db = b.date_maj || '';
        if (db !== da) return db.localeCompare(da);
        return ((a.type_maj || '').includes('AJOUT') ? 0 : 1) - ((b.type_maj || '').includes('AJOUT') ? 0 : 1);
      });
    }

    return list.sort((a, b) => {
      const va = ((a as any)[sortKey] || '').toString().toLowerCase();
      const vb = ((b as any)[sortKey] || '').toString().toLowerCase();
      return va < vb ? -sortDir : va > vb ? sortDir : 0;
    });
  }, [gamesEnriched, search, filterStatut, filterTrad, filterType, filterTradType, filterSync, filterTagsByTag, sortKey, sortDir, dateSort]);

  const totalPages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const effectivePage = Math.min(currentPage, totalPages - 1);
  const paginatedItems = useMemo(() => {
    if (pageSize === -1) return filtered;
    const start = effectivePage * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSize, effectivePage]);

  useEffect(() => {
    const total = pageSize === -1 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
    setCurrentPage((p) => Math.min(p, total - 1));
  }, [filtered.length, pageSize]);

  const resetFilters = () => {
    setSearch(''); setFilterStatut(''); setFilterTrad(''); setFilterType('');
    setFilterTradType(''); setFilterSync(''); setFilterTagsByTag({});
  };

  const toggleSort = (key: string) => {
    setDateSort(false);
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(1); }
  };

  const syncFilterButtons: ['' | SyncStatus, string][] = [
    ['', '📚 Tous'],
    ['ok', '✓ À jour'],
    ['outdated', '⚠ Non à jour'],
  ];

  const collectionF95Ids = useMemo(
    () => new Set(collectionItems.map((c) => c.f95_thread_id)),
    [collectionItems]
  );

  const handleAddToCollection = useCallback(
    async (game: GameF95) => {
      const result = await addByGame(game.site_id, game.nom_du_jeu, game.nom_url || undefined);
      if (result.ok) showToast('Ajouté à ma collection', 'success');
      else showToast(result.error || 'Erreur', 'error');
    },
    [addByGame, showToast]
  );

  const activeTagFilterCount = Object.keys(filterTagsByTag).length;

  return (
    <div className="library-view-root">
      <div className="library-tabs">
        {(
          [
            ['library',    '📚 Bibliothèque'],
            ['collection', '📁 Ma collection'],
            ['stats',      '📊 Statistiques'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`library-tab ${tab === k ? 'library-tab--active' : ''}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'library' && (
        <>
          <div className="library-toolbar">
            {/* ── Sync + Date ── */}
            <div className="library-toolbar-filters">
              {syncFilterButtons.map(([val, label]) => {
                const isActive = filterSync === val;
                return (
                  <button
                    key={val || 'all'}
                    type="button"
                    className={`library-sync-btn ${isActive ? (val === '' ? 'library-sync-btn--active-all' : 'library-sync-btn--active') : ''}`}
                    data-sync={val || undefined}
                    title={
                      val === '' && lastSync
                        ? `Cache local : ${lastSync.toLocaleTimeString('fr-FR')} — mis à jour automatiquement toutes les 2h par le bot`
                        : val === '' ? 'Afficher tous les jeux' : undefined
                    }
                    onClick={() => setFilterSync(val)}
                  >
                    {label}
                    <span className="library-toolbar-badge-count">{val ? syncCounts[val] ?? 0 : games.length}</span>
                  </button>
                );
              })}
              <span className="library-toolbar-divider" />
              <Toggle
                label="📅 Date"
                checked={dateSort}
                onChange={handleDateSortChange}
                title={dateSort ? 'Tri par date actif — désactiver pour revenir A→Z' : 'Trier par date de MAJ (récent en premier)'}
                size="sm"
              />
            </div>

            {/* ── Recherche ── */}
            <input
              type="text"
              className="app-input library-toolbar-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher dans le catalogue (jeu, traducteur)…"
            />

            {/* ── Selects ── */}
            <select className="app-select library-toolbar-select--filter-statut" value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)}>
              <option value="">Tous les statuts</option>
              {statuts.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="app-select library-toolbar-select--filter-trad" value={filterTrad} onChange={(e) => setFilterTrad(e.target.value)}>
              <option value="">Tous les traducteurs</option>
              {traducteurs.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="app-select library-toolbar-select--filter-type" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">Tous les moteurs</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="app-select library-toolbar-select--filter-trad-type" value={filterTradType} onChange={(e) => setFilterTradType(e.target.value)}>
              <option value="">Tous les types de trad.</option>
              {tradTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              className="app-select library-toolbar-select library-toolbar-select--page-size"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              title="Nombre d'entrées par page"
            >
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
              <option value={250}>250 / page</option>
              <option value={500}>500 / page</option>
              <option value={1000}>1000 / page</option>
              <option value={-1}>Illimité</option>
            </select>

            {/* ── Actions + Filtre tags + Gestion tags ── */}
            <div className="library-toolbar-actions">
              {/* Filtre tags */}
              <div className="library-toolbar-filter-tags-wrap">
                <button
                  ref={filterTagsAnchorRef}
                  type="button"
                  className={`library-collection-tag-btn ${activeTagFilterCount > 0 ? 'library-collection-tag-btn--active' : ''}`}
                  onClick={() => setFilterTagsOpen((o) => !o)}
                  title="Filtrer par tags (inclure / exclure)"
                >
                  Filtre tags
                  {activeTagFilterCount > 0 && (
                    <span className="library-toolbar-badge-count">{activeTagFilterCount}</span>
                  )}
                </button>
                {filterTagsOpen && (
                  <FilterTagsPopover
                    allTags={allUniqueTags}
                    filterState={filterTagsByTag}
                    onCycleTag={cycleFilterTag}
                    onClose={() => setFilterTagsOpen(false)}
                    anchorRef={filterTagsAnchorRef}
                  />
                )}
              </div>

              {/* Gestion tags (avis) */}
              <button
                type="button"
                className="library-collection-tag-btn"
                onClick={() => setShowTagAvoirsModal(true)}
                title="Gérer les avis sur les tags (affichés en détail jeu)"
              >
                Gestion tags
              </button>

              <span className="library-toolbar-divider" />

              {/* Vue grille / liste */}
              {(['grid', 'list'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`library-toolbar-btn ${view === v ? 'library-toolbar-btn--active' : ''}`}
                  onClick={() => setView(v)}
                  title={v === 'grid' ? 'Vue grille' : 'Vue liste'}
                >
                  {v === 'grid' ? '⊞' : '≡'}
                </button>
              ))}

              {/* Réinitialiser filtres */}
              <button
                type="button"
                className="library-toolbar-btn"
                onClick={resetFilters}
                disabled={loading}
                title="Réinitialiser tous les filtres"
              >
                ↻
              </button>
            </div>
          </div>

          <div className="library-content styled-scrollbar">
            {loading && (
              <div className="library-loading">
                <span className="library-loading-icon">⏳</span> Chargement de la bibliothèque…
              </div>
            )}

            {error && !loading && (
              <div className="library-error">
                ❌ {error}
                <br />
                <button type="button" className="library-retry-btn" onClick={fetchGames}>Réessayer</button>
              </div>
            )}

            {!loading && !error && filtered.length === 0 && (
              <div className="library-empty">
                {games.length === 0 ? '📭 Aucun jeu chargé' : '🔍 Aucun résultat pour ces filtres'}
              </div>
            )}

            {!loading && !error && view === 'grid' && filtered.length > 0 && (
              <div className="library-grid">
                {paginatedItems.map((g) => (
                  <GameCard
                    key={g.id}
                    game={g}
                    post={findPost(g)}
                    onEdit={handleEdit}
                    showDateBadge={dateSort}
                    onAddToCollection={handleAddToCollection}
                    isInCollection={collectionF95Ids.has(g.site_id)}
                  />
                ))}
              </div>
            )}

            {!loading && !error && view === 'list' && filtered.length > 0 && (
              <table className="library-table">
                <thead>
                  <tr>
                    {TABLE_HEADERS.map(([k, h]) => (
                      <th
                        key={h}
                        className={`library-table-th ${k ? 'library-table-th--sortable' : ''} ${sortKey === k && !dateSort ? 'library-table-th--active' : ''} ${k === '_sync' || k === 'statut' || k === 'type_maj' || k === null ? 'library-table-th--center' : 'library-table-th--left'}`}
                        onClick={k ? () => toggleSort(k) : undefined}
                      >
                        {h}
                        {k && sortKey === k && !dateSort ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}
                        {k === 'date_maj' && dateSort ? ' ↓' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((g) => (
                    <GameRow
                      key={g.id}
                      game={g}
                      post={findPost(g)}
                      onEdit={handleEdit}
                      onOpenDetail={() => setSelectedGameForDetail(g)}
                      onAddToCollection={handleAddToCollection}
                      isInCollection={collectionF95Ids.has(g.site_id)}
                    />
                  ))}
                </tbody>
              </table>
            )}

            {selectedGameForDetail && (
              <GameDetailModal
                game={selectedGameForDetail}
                onClose={() => setSelectedGameForDetail(null)}
                onAddToCollection={handleAddToCollection}
                isInCollection={collectionF95Ids.has(selectedGameForDetail.site_id)}
              />
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
                <button
                  type="button"
                  className="library-pagination-btn app-input"
                  disabled={effectivePage === 0}
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                >
                  ← Précédent
                </button>
                <button
                  type="button"
                  className="library-pagination-btn app-input"
                  disabled={effectivePage >= totalPages - 1}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  Suivant →
                </button>
              </div>
            )}
          </div>

          {/* ── Modale Gestion tags (avis partagés avec Ma Collection) ── */}
          {showTagAvoirsModal && (
            <TagAvoirsModal
              allTags={allUniqueTags}
              getAvoir={getAvoir}
              onSetAvoir={setAvoir}
              onClose={() => setShowTagAvoirsModal(false)}
            />
          )}
        </>
      )}

      {tab === 'collection' && <CollectionView view={view} setView={setView} />}
      {tab === 'stats' && <StatsView jeux={gamesEnriched} />}
    </div>
  );
}