import type { IpRow } from '../types';

/** Variables CSS communes pour les catégories IP (définies dans index.css) */
const IP_CAT_VARS: Record<IpRow['category'], string> = {
  MOI: 'var(--ip-cat-moi)',
  MEMBRE: 'var(--ip-cat-membre)',
  PROXY: 'var(--ip-cat-proxy)',
  PUBLIC: 'var(--ip-cat-public)',
  ERREUR: 'var(--ip-cat-erreur)',
};

function catColorVar(cat: IpRow['category']): string {
  return IP_CAT_VARS[cat] ?? 'var(--ip-cat-public)';
}

const btnClass = (v: 'default' | 'danger' | 'warning' | 'success') =>
  `server-btn server-btn--${v}`;

interface IpAnalysisTabProps {
  ipRows: IpRow[];
  ipLoading: boolean;
  ipError: string | null;
  onRunAnalysis: () => void;
}

export default function IpAnalysisTab({
  ipRows,
  ipLoading,
  ipError,
  onRunAnalysis,
}: IpAnalysisTabProps) {
  return (
    <>
      <section className="server-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>🔍 Analyse des IPs (logs [REQUEST])</h4>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
              Parse les 500 dernières lignes de logs, catégorise les IPs via ipinfo.io et résout les UUIDs.
            </p>
          </div>
          <button className={btnClass('default')} disabled={ipLoading} onClick={onRunAnalysis}>
            {ipLoading ? '⏳ Analyse…' : '🔍 Analyser'}
          </button>
        </div>

        {ipError && <div className="server-ip-error">❌ {ipError}</div>}

        {ipRows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
              {(['MOI', 'MEMBRE', 'PROXY', 'PUBLIC', 'ERREUR'] as const).map(c => (
                <span key={c} style={{ fontSize: 11, color: catColorVar(c), display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: catColorVar(c), display: 'inline-block' }} />
                  {c}
                </span>
              ))}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                  {['Req.', 'IP', 'Suspect', 'Route dominante', 'Type', 'Identité', 'Org'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ipRows.map(row => (
                  <tr key={row.ip} className="server-ip-table__row">
                    <td style={{ padding: '6px 8px', fontWeight: 700 }}>{row.total}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{row.ip}</td>
                    <td style={{ padding: '6px 8px' }} className={row.suspicious > 0 ? 'server-ip-cell--suspicious' : 'server-ip-cell--ok'}>
                      {row.suspicious}/{row.total}
                    </td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.topRoute}</td>
                    <td style={{ padding: '6px 8px', color: catColorVar(row.category), fontWeight: 600 }}>[{row.category}]</td>
                    <td style={{ padding: '6px 8px' }} className={row.identity.startsWith('@') ? 'server-ip-cell--identity' : 'server-ip-cell--muted'}>{row.identity || '—'}</td>
                    <td style={{ padding: '6px 8px', fontSize: 11, color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.org}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
              {ipRows.length} IPs analysées — {ipRows.reduce((s, r) => s + r.suspicious, 0)} requêtes suspectes au total
            </div>
          </div>
        )}

        {!ipLoading && !ipError && ipRows.length === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: 10 }}>
            Cliquez sur &quot;Analyser&quot; pour lancer l&apos;analyse des IPs depuis les logs.
          </div>
        )}
      </section>
    </>
  );
}
