import { useMemo } from 'react';
import { useCollection, normalizeExecutablePaths } from '../../state/hooks/useCollection';
import KpiCard from './components/KpiCard';
import PieCard from './components/PieCard';
import { chartColor } from './stats-view-constants';

export default function CollectionStatsView() {
  const { items, loading } = useCollection();

  const stats = useMemo(() => {
    const total = items.length;
    const withExec = items.filter(
      i => normalizeExecutablePaths(i.executable_paths).length > 0
    ).length;

    // Couleurs réelles des labels (dédupliquées par nom)
    const labelColorMap: Record<string, string> = {};
    items.forEach(item => {
      (item.labels ?? []).forEach(l => {
        const key = l.label.trim();
        if (key && !labelColorMap[key]) labelColorMap[key] = l.color;
      });
    });
    const uniqueLabels = Object.keys(labelColorMap).length;

    // Par statut
    const statusMap: Record<string, number> = {};
    items.forEach(item => {
      const s = item.game?.statut ?? item.scraped_data?.status ?? 'Inconnu';
      statusMap[s] = (statusMap[s] || 0) + 1;
    });
    const byStatus = Object.entries(statusMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Par type
    const typeMap: Record<string, number> = {};
    items.forEach(item => {
      const t = item.game?.type ?? item.scraped_data?.type ?? 'Non précisé';
      typeMap[t] = (typeMap[t] || 0) + 1;
    });
    const byType = Object.entries(typeMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Par label
    const labelMap: Record<string, number> = {};
    items.forEach(item => {
      (item.labels ?? []).forEach(l => {
        const key = l.label.trim();
        if (key) labelMap[key] = (labelMap[key] || 0) + 1;
      });
    });
    const byLabel = Object.entries(labelMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Derniers jeux joués (top 5 par date de dernière session)
    const lastPlayed = items
      .flatMap(item => {
        const paths = normalizeExecutablePaths(item.executable_paths);
        const lastLaunch = paths
          .filter(p => p.last_launch)
          .map(p => p.last_launch!)
          .sort((a, b) => b.localeCompare(a))[0];
        if (!lastLaunch) return [];
        return [{
          title: item.game?.nom_du_jeu ?? item.title ?? `Jeu #${item.f95_thread_id}`,
          date: lastLaunch,
        }];
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);

    // Derniers ajouts (top 5 par created_at)
    const recentlyAdded = [...items]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 5)
      .map(item => ({
        title: item.game?.nom_du_jeu ?? item.title ?? `Jeu #${item.f95_thread_id}`,
        date: item.created_at,
      }));

    return { total, withExec, uniqueLabels, byStatus, byType, byLabel, lastPlayed, recentlyAdded, labelColorMap };
  }, [items]);

  if (loading) {
    return <div className="stats-collection__loading">Chargement de la collection…</div>;
  }

  if (stats.total === 0) {
    return (
      <div className="stats-modal__empty">
        <div className="stats-modal__empty-icon">📦</div>
        <p>Ta collection est vide pour le moment.</p>
      </div>
    );
  }

  const pct = (n: number) => stats.total ? `${Math.round((n / stats.total) * 100)}%` : '—';

  const labelColorFn = (i: number) =>
    stats.labelColorMap[stats.byLabel[i]?.name] || chartColor(i);

  return (
    <div className="stats-collection">
      {/* KPIs */}
      <div className="stats-view__kpis">
        <KpiCard icon="🎮" label="Total jeux" value={stats.total} color="var(--accent)" />
        <KpiCard icon="🖥️" label="Avec exécutable" value={stats.withExec} color="#22c55e" sub={pct(stats.withExec)} />
        <KpiCard icon="🏷️" label="Labels distincts" value={stats.uniqueLabels} color="#f59e0b" />
      </div>

      {/* Graphiques camembert */}
      {(stats.byStatus.length > 0 || stats.byType.length > 0 || stats.byLabel.length > 0) && (
        <div className="stats-view__pie-grid">
          {stats.byStatus.length > 0 && (
            <PieCard title="📁 Par statut" data={stats.byStatus} colorFn={chartColor} />
          )}
          {stats.byType.length > 0 && (
            <PieCard title="🎲 Par type" data={stats.byType} colorFn={chartColor} />
          )}
          {stats.byLabel.length > 0 && (
            <PieCard title="🏷️ Par label" data={stats.byLabel} colorFn={labelColorFn} />
          )}
        </div>
      )}

      {/* Listes récentes */}
      <div className="stats-collection__recent-grid">
        {stats.lastPlayed.length > 0 && (
          <div className="stats-modal__section">
            <h4 className="stats-modal__section-title">🕹️ Derniers jeux joués</h4>
            <div className="stats-collection__recent-list">
              {stats.lastPlayed.map((item, i) => (
                <div key={i} className="stats-collection__recent-item">
                  <span className="stats-collection__recent-rank">#{i + 1}</span>
                  <span className="stats-collection__recent-title">{item.title}</span>
                  <span className="stats-collection__recent-date">
                    {new Date(item.date).toLocaleDateString('fr-FR')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="stats-modal__section">
          <h4 className="stats-modal__section-title">🆕 Derniers ajouts</h4>
          <div className="stats-collection__recent-list">
            {stats.recentlyAdded.map((item, i) => (
              <div key={i} className="stats-collection__recent-item">
                <span className="stats-collection__recent-rank">#{i + 1}</span>
                <span className="stats-collection__recent-title">{item.title}</span>
                <span className="stats-collection__recent-date">
                  {new Date(item.date).toLocaleDateString('fr-FR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
