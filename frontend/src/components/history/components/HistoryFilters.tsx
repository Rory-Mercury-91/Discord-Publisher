import type { ProfilePublic, ExternalTranslatorPublic } from '../constants';
import { PREFIX_EXT, PREFIX_PROFILE } from '../constants';

interface HistoryFiltersProps {
  filterAuthorId: string;
  onFilterAuthorChange: (id: string) => void;
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
  isMasterAdmin: boolean;
}

export default function HistoryFilters({
  filterAuthorId,
  onFilterAuthorChange,
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
  isMasterAdmin,
}: HistoryFiltersProps) {
  return (
    <div className="history-filters">
      <select
        className="history-filters__select history-filters__select--author"
        value={filterAuthorId}
        onChange={(e) => onFilterAuthorChange(e.target.value)}
      >
        <option value="">Tous les auteurs</option>
        <option value="me">Moi</option>
        {allProfiles
          .filter((p) => p.discord_id !== currentUserDiscordId)
          .map((p) => (
            <option key={PREFIX_PROFILE + p.id} value={PREFIX_PROFILE + p.id}>
              👤 {p.pseudo || p.discord_id || p.id}
            </option>
          ))}
        {externalTranslators.map((ext) => (
          <option key={PREFIX_EXT + ext.id} value={PREFIX_EXT + ext.id}>
            🔧 {ext.name}
          </option>
        ))}
      </select>
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
