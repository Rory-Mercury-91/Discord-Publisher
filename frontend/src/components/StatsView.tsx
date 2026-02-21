// frontend/src/components/StatsView.tsx
import { useMemo, useState } from 'react';
import {
  Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip,
} from 'recharts';
import type { JeuF95 } from './LibraryView';

/* ─────────────────────────────────────────────────────────
   CONSTANTES
───────────────────────────────────────────────────────── */
const P = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#38bdf8', '#a78bfa', '#fb923c', '#34d399'];
const pal = (i: number) => P[i % P.length];

const TT: any = {
  contentStyle: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 },
  itemStyle: { color: 'var(--text)' },
  labelStyle: { color: 'var(--muted)', fontWeight: 600 },
};

/* ─────────────────────────────────────────────────────────
   SOUS-COMPOSANTS
───────────────────────────────────────────────────────── */

/** Légende Recharts sans noir par défaut */
function ChartLegend({ payload }: any) {
  if (!payload?.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 8, justifyContent: 'center' }}>
      {payload.map((e: any, i: number) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text)' }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: e.color, display: 'inline-block', flexShrink: 0 }} />
          {e.value}
        </span>
      ))}
    </div>
  );
}

/** Carte KPI */
function KpiCard({ icon, label, value, color, sub }:
  { icon: string; label: string; value: number; color: string; sub?: string }) {
  return (
    <div style={{
      flexShrink: 0, background: 'var(--panel)', borderRadius: 12, padding: '14px 16px',
      border: `1px solid ${color}44`, textAlign: 'center'
    }}>
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1.1, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color, marginTop: 2, fontWeight: 600 }}>{sub}</div>}
    </div>
  );
}

/** Camembert avec titre */
function PieCard({ title, data, colorFn }:
  { title: string; data: { name: string; value: number }[]; colorFn: (i: number) => string }) {
  return (
    <div style={{
      flexShrink: 0, background: 'var(--panel)', borderRadius: 12,
      border: '1px solid var(--border)', padding: 16
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{title}</div>
      <ResponsiveContainer width="100%" height={190}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={68}>
            {data.map((_, i) => <Cell key={i} fill={colorFn(i)} />)}
          </Pie>
          <Tooltip {...TT} />
          <Legend content={ChartLegend} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   COMPOSANT PRINCIPAL
───────────────────────────────────────────────────────── */
export default function StatsView({ jeux }: { jeux: JeuF95[] }) {

  /* ── Filtre traducteur ── */
  const traducteurs = useMemo(() =>
    [...new Set(jeux.map(j => j.traducteur).filter(Boolean))].sort()
    , [jeux]);

  const [selectedTrad, setSelectedTrad] = useState('');

  /* ── Données filtrées (KPIs + camemberts) ── */
  const filtered = useMemo(() =>
    selectedTrad ? jeux.filter(j => j.traducteur === selectedTrad) : jeux
    , [jeux, selectedTrad]);

  const total = filtered.length;

  const kpis = useMemo(() => {
    const c = { ok: 0, outdated: 0, unknown: 0 };
    filtered.forEach(j => c[j._sync!]++);
    return c;
  }, [filtered]);

  const pct = (n: number) => total ? `${Math.round(n / total * 100)}%` : '—';

  /* Camemberts — calculés sur la sélection */
  const byTradType = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.forEach(j => { const k = j.type_de_traduction || 'Non précisé'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const byStatut = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.forEach(j => { const k = j.statut || 'Inconnu'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const bySite = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.forEach(j => { const k = j.site || 'Autre'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  /* ── Tableau traducteurs — TOUJOURS sur jeux complet, jamais filtré ── */
  const tradTable = useMemo(() => {
    const totalAll = jeux.length;
    const m: Record<string, number> = {};
    jeux.forEach(j => { if (j.traducteur) m[j.traducteur] = (m[j.traducteur] || 0) + 1; });
    return Object.entries(m)
      .map(([name, count]) => ({
        name,
        count,
        pct: totalAll ? Math.round(count / totalAll * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [jeux]);

  /* ─── RENDER ─── */
  return (
    <div
      className="styled-scrollbar"
      style={{
        flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
        padding: '20px 20px 40px', display: 'flex', flexDirection: 'column', gap: 16
      }}
    >

      {/* ── Filtre traducteur ── */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
          👤 Traducteur
        </span>
        <select
          value={selectedTrad}
          onChange={e => setSelectedTrad(e.target.value)}
          style={{
            height: 32, padding: '0 10px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text)', fontSize: 13, cursor: 'pointer', minWidth: 200
          }}
        >
          <option value="">Tous les traducteurs</option>
          {traducteurs.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {selectedTrad && (
          <button onClick={() => setSelectedTrad('')}
            style={{
              height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)',
              background: 'rgba(239,68,68,0.08)', color: '#f87171', fontSize: 12, cursor: 'pointer'
            }}>
            ✕ Réinitialiser
          </button>
        )}
      </div>

      {/* ── KPIs ── */}
      <div style={{
        flexShrink: 0, display: 'grid',
        gridTemplateColumns: 'repeat(3,1fr)', gap: 12
      }}>
        <KpiCard icon="📚" label="Total jeux" value={total} color="var(--accent)" />
        <KpiCard icon="✅" label="À jour" value={kpis.ok} color="#22c55e" sub={pct(kpis.ok)} />
        <KpiCard icon="⚠️" label="Non à jour" value={kpis.outdated} color="#ef4444" sub={pct(kpis.outdated)} />
      </div>

      {/* ── Barre de progression sync ── */}
      <div style={{
        flexShrink: 0, background: 'var(--panel)', borderRadius: 12,
        border: '1px solid var(--border)', padding: '14px 16px'
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
          📊 Progression sync {selectedTrad ? `— ${selectedTrad}` : 'globale'}
        </div>
        <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', gap: 1 }}>
          {kpis.ok > 0 && <div style={{ flex: kpis.ok, background: '#22c55e', transition: 'flex .4s' }} />}
          {kpis.outdated > 0 && <div style={{ flex: kpis.outdated, background: '#ef4444', transition: 'flex .4s' }} />}
          {kpis.unknown > 0 && <div style={{ flex: kpis.unknown, background: 'var(--border)', transition: 'flex .4s' }} />}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 8, fontSize: 11 }}>
          {([
            ['#22c55e', 'À jour', kpis.ok],
            ['#ef4444', 'Non à jour', kpis.outdated],
            ['#6b7280', 'Inconnu', kpis.unknown],
          ] as [string, string, number][]).map(([c, l, n]) => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: c, display: 'inline-block' }} />
              <span style={{ color: 'var(--muted)' }}>{l} : <strong style={{ color: c }}>{n}</strong></span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Camemberts ── */}
      <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        <PieCard title="⚙ Type de traduction" data={byTradType} colorFn={pal} />
        <PieCard title="📁 Par statut" data={byStatut} colorFn={pal} />
        <PieCard title="🌐 Par site" data={bySite} colorFn={pal} />
      </div>

      {/* ── Tableau traducteurs (toujours global) ── */}
      <div style={{
        flexShrink: 0, background: 'var(--panel)', borderRadius: 12,
        border: '1px solid var(--border)', overflow: 'hidden'
      }}>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            👥 Traducteurs — {tradTable.length} au total
          </span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            Non affecté par le filtre
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(128,128,128,0.04)' }}>
                <th style={th({ textAlign: 'left' })}>#</th>
                <th style={th({ textAlign: 'left' })}>Traducteur</th>
                <th style={th({ textAlign: 'right' })}>Jeux</th>
                <th style={th({ textAlign: 'right' })}>% du catalogue</th>
                <th style={th({})}>Répartition</th>
              </tr>
            </thead>
            <tbody>
              {tradTable.map((row, i) => (
                <tr
                  key={row.name}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: selectedTrad === row.name ? 'rgba(99,102,241,0.07)' : 'transparent',
                    transition: 'background .15s'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background =
                    selectedTrad === row.name ? 'rgba(99,102,241,0.12)' : 'rgba(128,128,128,0.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background =
                    selectedTrad === row.name ? 'rgba(99,102,241,0.07)' : 'transparent')}
                >
                  <td style={td({ color: 'var(--muted)', width: 36 })}>{i + 1}</td>
                  <td style={td({ fontWeight: selectedTrad === row.name ? 700 : 400 })}>
                    {selectedTrad === row.name && (
                      <span style={{ color: 'var(--accent)', marginRight: 6 }}>▶</span>
                    )}
                    {row.name}
                  </td>
                  <td style={td({ textAlign: 'right', fontWeight: 600, color: 'var(--text)' })}>
                    {row.count}
                  </td>
                  <td style={td({ textAlign: 'right' })}>
                    <span style={{
                      color: row.pct >= 20 ? '#6366f1' : row.pct >= 10 ? '#22c55e' : 'var(--muted)',
                      fontWeight: 600
                    }}>
                      {row.pct}%
                    </span>
                  </td>
                  <td style={td({ width: 140 })}>
                    <div style={{
                      display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden',
                      background: 'var(--border)', width: 120
                    }}>
                      <div style={{
                        width: `${row.pct}%`, background: row.pct >= 20 ? '#6366f1' : '#22c55e',
                        borderRadius: 4, transition: 'width .3s'
                      }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

/* ── Helpers style cellules ── */
const th = (extra?: React.CSSProperties): React.CSSProperties => ({
  padding: '8px 14px', fontWeight: 600, fontSize: 12,
  color: 'var(--muted)', whiteSpace: 'nowrap', ...extra,
});
const td = (extra?: React.CSSProperties): React.CSSProperties => ({
  padding: '9px 14px', color: 'var(--text)', fontSize: 13,
  verticalAlign: 'middle', ...extra,
});
