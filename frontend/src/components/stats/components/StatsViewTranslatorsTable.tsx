interface TradRow {
  name: string;
  count: number;
  pct: number;
  barPct: number;
}

interface StatsViewTranslatorsTableProps {
  rows: TradRow[];
  selectedTrad: string;
}

export default function StatsViewTranslatorsTable({ rows, selectedTrad }: StatsViewTranslatorsTableProps) {
  return (
    <div className="stats-view-table-wrap">
      <div className="stats-view-table__header">
        <span className="stats-view-table__header-title">
          👥 Traducteurs — {rows.length} au total
        </span>
        <span className="stats-view-table__header-hint">Non affecté par le filtre</span>
      </div>
      <div className="stats-view-table__scroll">
        <table className="stats-view-table">
          <thead>
            <tr>
              <th className="stats-view-table__th stats-view-table__th--left">#</th>
              <th className="stats-view-table__th stats-view-table__th--left">Traducteur</th>
              <th className="stats-view-table__th stats-view-table__th--right">Jeux</th>
              <th className="stats-view-table__th stats-view-table__th--right">% des traductions</th>
              <th className="stats-view-table__th">Répartition</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.name}
                className={`stats-view-table__tr ${selectedTrad === row.name ? 'stats-view-table__tr--selected' : ''}`}
              >
                <td className="stats-view-table__td stats-view-table__td--muted stats-view-table__td--num">
                  {i + 1}
                </td>
                <td className={`stats-view-table__td ${selectedTrad === row.name ? 'stats-view-table__td--bold' : ''}`}>
                  {selectedTrad === row.name && <span className="stats-view-table__td-accent">▶</span>}
                  {row.name}
                </td>
                <td className="stats-view-table__td stats-view-table__td--right stats-view-table__td--bold">
                  {row.count}
                </td>
                <td className="stats-view-table__td stats-view-table__td--right">
                  <span
                    className={`stats-view-table__pct ${
                      row.pct >= 20 ? 'stats-view-table__pct--high' : row.pct >= 10 ? 'stats-view-table__pct--mid' : ''
                    }`}
                  >
                    {row.pct}%
                  </span>
                </td>
                <td className="stats-view-table__td stats-view-table__td--bar">
                  <div className="stats-view-table__bar-track">
                    <div
                      className={`stats-view-table__bar-fill ${row.pct >= 20 ? 'stats-view-table__bar-fill--high' : ''}`}
                      style={{ width: `${row.barPct}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
