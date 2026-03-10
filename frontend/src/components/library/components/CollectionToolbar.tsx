/**
 * Barre d'outils de la vue Ma collection.
 * Ordre : Tous / À jour / Non à jour → Input recherche → Selects → Filtre tags → Gestion tags → Grille / Liste / Rafraîchir
 */
import type { RefObject } from 'react';
import FilterTagsPopover, { type FilterTagState } from './FilterTagsPopover';
import type { SyncStatus } from '../library-types';

const SYNC_FILTER_BUTTONS: ['' | SyncStatus, string][] = [
  ['', 'Tous'],
  ['ok', 'À jour'],
  ['outdated', 'Non à jour'],
];

type ViewMode = 'grid' | 'list';

interface CollectionToolbarProps {
  search: string;
  setSearch: (v: string) => void;
  filterSync: '' | SyncStatus;
  setFilterSync: (v: '' | SyncStatus) => void;
  syncCounts: { ok: number; outdated: number; unknown: number };
  gamesCount: number;
  statuts: string[];
  filterStatut: string;
  setFilterStatut: (v: string) => void;
  traducteurs: string[];
  filterTrad: string;
  setFilterTrad: (v: string) => void;
  types: string[];
  filterType: string;
  setFilterType: (v: string) => void;
  tradTypes: string[];
  filterTradType: string;
  setFilterTradType: (v: string) => void;
  pageSize: number;
  setPageSize: (v: number) => void;
  filterTagsByTag: Record<string, FilterTagState>;
  filterTagsOpen: boolean;
  setFilterTagsOpen: (v: boolean) => void;
  filterTagsAnchorRef: RefObject<HTMLButtonElement | null>;
  allUniqueTags: string[];
  cycleFilterTag: (tag: string) => void;
  onOpenTagAvoirsModal: () => void;
  view: ViewMode;
  setView: (v: ViewMode) => void;
  onResetFiltersAndRefresh: () => void;
  loading: boolean;
  deleteMode: boolean;
  onToggleDeleteMode: () => void;
}

export default function CollectionToolbar({
  search,
  setSearch,
  filterSync,
  setFilterSync,
  syncCounts,
  gamesCount,
  statuts,
  filterStatut,
  setFilterStatut,
  traducteurs,
  filterTrad,
  setFilterTrad,
  types,
  filterType,
  setFilterType,
  tradTypes,
  filterTradType,
  setFilterTradType,
  pageSize,
  setPageSize,
  filterTagsByTag,
  filterTagsOpen,
  setFilterTagsOpen,
  filterTagsAnchorRef,
  allUniqueTags,
  cycleFilterTag,
  onOpenTagAvoirsModal,
  view,
  setView,
  onResetFiltersAndRefresh,
  loading,
  deleteMode,
  onToggleDeleteMode,
}: CollectionToolbarProps) {
  return (
    <div className="library-toolbar library-toolbar--collection">
      <div className="library-toolbar-filters">
        {SYNC_FILTER_BUTTONS.map(([val, label]) => {
          const isActive = filterSync === val;
          return (
            <button
              key={val || 'all'}
              type="button"
              className={`library-sync-btn ${isActive ? (val === '' ? 'library-sync-btn--active-all' : 'library-sync-btn--active') : ''}`}
              data-sync={val || undefined}
              onClick={() => setFilterSync(val)}
            >
              {label}
              <span className="library-toolbar-badge-count">
                {val ? syncCounts[val] ?? 0 : gamesCount}
              </span>
            </button>
          );
        })}
      </div>

      <input
        type="text"
        className="app-input library-toolbar-input library-toolbar-input--collection"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher…"
      />

      <select
        className="app-select library-toolbar-select--filter-statut"
        value={filterStatut}
        onChange={(e) => setFilterStatut(e.target.value)}
      >
        <option value="">Tous les statuts</option>
        {statuts.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <select
        className="app-select library-toolbar-select--filter-trad"
        value={filterTrad}
        onChange={(e) => setFilterTrad(e.target.value)}
      >
        <option value="">Tous les traducteurs</option>
        {traducteurs.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <select
        className="app-select library-toolbar-select--filter-type"
        value={filterType}
        onChange={(e) => setFilterType(e.target.value)}
      >
        <option value="">Tous les moteurs</option>
        {types.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <select
        className="app-select library-toolbar-select--filter-trad-type"
        value={filterTradType}
        onChange={(e) => setFilterTradType(e.target.value)}
      >
        <option value="">Tous les types de trad.</option>
        {tradTypes.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
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

      <div className="library-toolbar-right">
        <div className="library-toolbar-filter-tags-wrap">
          <button
            ref={filterTagsAnchorRef}
            type="button"
            className={`library-collection-tag-btn ${Object.keys(filterTagsByTag).length > 0 ? 'library-collection-tag-btn--active' : ''}`}
            onClick={() => setFilterTagsOpen(!filterTagsOpen)}
            title="Filtrer par tags (inclure / exclure)"
          >
            Filtre tags
            {Object.keys(filterTagsByTag).length > 0 && (
              <span className="library-toolbar-badge-count">{Object.keys(filterTagsByTag).length}</span>
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

        <button
          type="button"
          className="library-collection-tag-btn"
          onClick={onOpenTagAvoirsModal}
          title="Gérer les avis sur les tags (affichés en détail jeu)"
        >
          Gestion tags
        </button>

        <div className="library-toolbar-spacer" aria-hidden="true" />

        <button
          type="button"
          className={`library-toolbar-btn ${view === 'grid' ? 'library-toolbar-btn--active' : ''}`}
          onClick={() => setView('grid')}
          title="Vue grille"
        >
          ⊞
        </button>
        <button
          type="button"
          className={`library-toolbar-btn ${view === 'list' ? 'library-toolbar-btn--active' : ''}`}
          onClick={() => setView('list')}
          title="Vue liste"
        >
          ≡
        </button>
        <button
          type="button"
          className="library-toolbar-btn"
          onClick={onResetFiltersAndRefresh}
          disabled={loading}
          title="Réinitialiser les filtres et rafraîchir la liste"
        >
          ↻
        </button>

        <div className="library-toolbar-spacer" aria-hidden="true" />

        <button
          type="button"
          className={`library-toolbar-btn library-toolbar-btn--delete-mode${deleteMode ? ' library-toolbar-btn--delete-mode-active' : ''}`}
          onClick={onToggleDeleteMode}
          title={deleteMode ? 'Quitter le mode suppression' : 'Activer la sélection multiple pour supprimer'}
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
