import { useMemo, useState } from 'react';
import type { GameF95 } from '../library';
import { chartColor } from './stats-view-constants';
import KpiCard from './components/KpiCard';
import PieCard from './components/PieCard';
import StatsViewFilter from './components/StatsViewFilter';
import StatsViewSyncBar from './components/StatsViewSyncBar';
import StatsViewTranslatorsTable from './components/StatsViewTranslatorsTable';
import CollectionStatsView from './CollectionStatsView';

export default function StatsView({ jeux }: { jeux: GameF95[] }) {
  const [activeTab, setActiveTab] = useState<'library' | 'collection'>('library');

  const traducteurs = useMemo(
    () => [...new Set(jeux.map((j) => j.traducteur).filter(Boolean))].sort(),
    [jeux]
  );

  const [selectedTrad, setSelectedTrad] = useState('');

  const filtered = useMemo(
    () => (selectedTrad ? jeux.filter((j) => j.traducteur === selectedTrad) : jeux),
    [jeux, selectedTrad]
  );

  const total = filtered.length;

  const kpis = useMemo(() => {
    const c: Record<'ok' | 'outdated' | 'unknown', number> = { ok: 0, outdated: 0, unknown: 0 };
    filtered.forEach((j) => {
      const status = (j as GameF95 & { _sync?: 'ok' | 'outdated' | 'unknown' })._sync ?? 'unknown';
      c[status]++;
    });
    return c;
  }, [filtered]);

  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : '—');

  const byTradType = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.forEach((j) => {
      const k = j.type_de_traduction || 'Non précisé';
      m[k] = (m[k] || 0) + 1;
    });
    return Object.entries(m)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const byStatut = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.forEach((j) => {
      const k = j.statut || 'Inconnu';
      m[k] = (m[k] || 0) + 1;
    });
    return Object.entries(m)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const bySite = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.forEach((j) => {
      const k = j.site || 'Autre';
      m[k] = (m[k] || 0) + 1;
    });
    return Object.entries(m)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const tradTable = useMemo(() => {
    const m: Record<string, number> = {};
    jeux.forEach((j) => {
      if (j.traducteur) m[j.traducteur] = (m[j.traducteur] || 0) + 1;
    });
    const totalTrad = Object.values(m).reduce((acc, v) => acc + v, 0);
    const rows = Object.entries(m).map(([name, count]) => {
      const rawPct = totalTrad ? (count / totalTrad) * 100 : 0;
      const pct = Math.round(rawPct * 10) / 10;
      return { name, count, pct };
    });
    rows.sort((a, b) => b.count - a.count);
    const maxCount = rows.length ? rows[0].count : 0;
    return rows.map((row) => {
      if (!maxCount) return { ...row, barPct: 0 };
      const ratio = row.count / maxCount;
      const eased = Math.pow(ratio, 0.5);
      const barPct = Math.max(5, Math.round(eased * 100));
      return { ...row, barPct };
    });
  }, [jeux]);

  return (
    <div className="stats-view styled-scrollbar">
      {/* Onglets Bibliothèque / Ma Collection */}
      <div className="stats-view__tabs">
        <button
          type="button"
          className={`stats-view__tab${activeTab === 'library' ? ' stats-view__tab--active' : ''}`}
          onClick={() => setActiveTab('library')}
        >
          📚 Bibliothèque
        </button>
        <button
          type="button"
          className={`stats-view__tab${activeTab === 'collection' ? ' stats-view__tab--active' : ''}`}
          onClick={() => setActiveTab('collection')}
        >
          📦 Ma Collection
        </button>
      </div>

      {activeTab === 'collection' ? (
        <CollectionStatsView />
      ) : (
        <>
          <StatsViewFilter
            traducteurs={traducteurs}
            selectedTrad={selectedTrad}
            onSelect={setSelectedTrad}
            onReset={() => setSelectedTrad('')}
          />

          <div className="stats-view__kpis">
            <KpiCard icon="📚" label="Total jeux" value={total} color="var(--accent)" />
            <KpiCard icon="✅" label="À jour" value={kpis.ok} color="#22c55e" sub={pct(kpis.ok)} />
            <KpiCard icon="⚠️" label="Non à jour" value={kpis.outdated} color="#ef4444" sub={pct(kpis.outdated)} />
          </div>

          <StatsViewSyncBar selectedTrad={selectedTrad || null} kpis={kpis} />

          <div className="stats-view__pie-grid">
            <PieCard title="⚙ Type de traduction" data={byTradType} colorFn={chartColor} />
            <PieCard title="📁 Par statut" data={byStatut} colorFn={chartColor} />
            <PieCard title="🌐 Par site" data={bySite} colorFn={chartColor} />
          </div>

          <StatsViewTranslatorsTable rows={tradTable} selectedTrad={selectedTrad} />
        </>
      )}
    </div>
  );
}
