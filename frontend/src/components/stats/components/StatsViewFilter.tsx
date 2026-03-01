interface StatsViewFilterProps {
  traducteurs: string[];
  selectedTrad: string;
  onSelect: (value: string) => void;
  onReset: () => void;
}

export default function StatsViewFilter({
  traducteurs,
  selectedTrad,
  onSelect,
  onReset,
}: StatsViewFilterProps) {
  return (
    <div className="stats-view__filter">
      <span className="stats-view__filter-label">👤 Traducteur</span>
      <select
        className="stats-view__filter-select"
        value={selectedTrad}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">Tous les traducteurs</option>
        {traducteurs.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {selectedTrad && (
        <button type="button" className="stats-view__filter-reset" onClick={onReset}>
          ✕ Réinitialiser
        </button>
      )}
    </div>
  );
}
