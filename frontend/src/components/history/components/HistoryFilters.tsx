import HistoryAuthorSelect from './HistoryAuthorSelect';
import type { ExternalTranslatorPublic, ProfilePublic } from '../constants';

interface HistoryFiltersProps {
  filterAuthorId: string;
  defaultAuthorFilterId: string | null;
  onFilterAuthorChange: (id: string) => void;
  onDefaultAuthorChange: (id: string | null) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortBy: 'date-desc' | 'date-asc';
  onSortChange: (v: 'date-desc' | 'date-asc') => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  onOpenTransfer: () => void;
  allProfiles: ProfilePublic[];
  externalTranslators: ExternalTranslatorPublic[];
  currentUserDiscordId: string | undefined;
  currentUserPseudo: string | undefined;
  isMasterAdmin: boolean;
  showDefaultAuthorStar: boolean;
}

export default function HistoryFilters({
  filterAuthorId,
  defaultAuthorFilterId,
  onFilterAuthorChange,
  onDefaultAuthorChange,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  hasActiveFilters,
  onResetFilters,
  onOpenTransfer,
  allProfiles,
  externalTranslators,
  currentUserDiscordId,
  currentUserPseudo,
  isMasterAdmin,
  showDefaultAuthorStar,
}: HistoryFiltersProps) {
  return (
    <div className="history-filters">
      {showDefaultAuthorStar && (
        <p className="history-filters__hint">
          Dans la liste des auteurs, cliquez sur <span aria-hidden="true">☆</span> pour ouvrir
          l&apos;historique sur cet auteur par défaut (jusqu&apos;à réinitialisation des filtres).
        </p>
      )}
      <HistoryAuthorSelect
        filterAuthorId={filterAuthorId}
        defaultAuthorFilterId={defaultAuthorFilterId}
        onFilterAuthorChange={onFilterAuthorChange}
        onDefaultAuthorChange={onDefaultAuthorChange}
        allProfiles={allProfiles}
        externalTranslators={externalTranslators}
        currentUserDiscordId={currentUserDiscordId}
        currentUserPseudo={currentUserPseudo}
        showDefaultStar={showDefaultAuthorStar}
      />
      <input
        type="text"
        className="app-input history-filters__search"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Rechercher (nom du jeu, lien ou ID)..."
      />
      <select
        className="history-filters__select"
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value as 'date-desc' | 'date-asc')}
      >
        <option value="date-desc">Plus récent</option>
        <option value="date-asc">Plus ancien</option>
      </select>
      {hasActiveFilters && (
        <button type="button" className="history-filters__reset" onClick={onResetFilters}>
          Réinitialiser les filtres
        </button>
      )}
      <button
        type="button"
        className="history-filters__transfer"
        onClick={onOpenTransfer}
        title={
          isMasterAdmin
            ? 'Transférer la propriété (admin : tout auteur)'
            : 'Transférer vos publications vers un autre auteur'
        }
      >
        🔄 Transférer la propriété
      </button>
    </div>
  );
}
