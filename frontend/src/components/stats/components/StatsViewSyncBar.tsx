interface StatsViewSyncBarProps {
  selectedTrad: string | null;
  kpis: { ok: number; outdated: number; unknown: number };
}

export default function StatsViewSyncBar({ selectedTrad, kpis }: StatsViewSyncBarProps) {
  const { ok, outdated, unknown } = kpis;
  const items: [string, string, number][] = [
    ['#22c55e', 'À jour', ok],
    ['#ef4444', 'Non à jour', outdated],
    ['#6b7280', 'Inconnu', unknown],
  ];

  return (
    <div className="stats-view-sync-bar">
      <div className="stats-view-sync-bar__title">
        📊 Progression sync {selectedTrad ? `— ${selectedTrad}` : 'globale'}
      </div>
      <div className="stats-view-sync-bar__track">
        {ok > 0 && <div className="stats-view-sync-bar__segment stats-view-sync-bar__segment--ok" style={{ flex: ok }} />}
        {outdated > 0 && <div className="stats-view-sync-bar__segment stats-view-sync-bar__segment--outdated" style={{ flex: outdated }} />}
        {unknown > 0 && <div className="stats-view-sync-bar__segment stats-view-sync-bar__segment--unknown" style={{ flex: unknown }} />}
      </div>
      <div className="stats-view-sync-bar__legend">
        {items.map(([c, label, n]) => (
          <span key={label} className="stats-view-sync-bar__legend-item">
            <span className="stats-view-sync-bar__legend-dot" style={{ background: c }} />
            <span className="stats-view-sync-bar__legend-text">
              {label} : <strong style={{ color: c }}>{n}</strong>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
