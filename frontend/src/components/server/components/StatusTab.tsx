import type { ActionResult } from '../types';
import ServerOutputPanel from './ServerOutputPanel';

const btnClass = (v: 'default' | 'danger' | 'warning' | 'success') =>
  `server-btn server-btn--${v}`;

interface StatusTabProps {
  result: ActionResult | null;
  isLoading: boolean;
  loading: Record<string, boolean>;
  onCallAction: (action: string, params: Record<string, unknown>, label?: string, loadingKey?: string) => Promise<void>;
  onExportTxt: () => void;
  onExportJson: () => void;
}

export default function StatusTab({
  result,
  isLoading,
  loading,
  onCallAction,
  onExportTxt,
  onExportJson,
}: StatusTabProps) {
  return (
    <>
      <section className="server-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h4 style={{ margin: 0, fontSize: '0.9rem' }}>⚙️ Service &amp; Fail2ban</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className={btnClass('default')}
              disabled={loading['status_svc']}
              onClick={() => onCallAction('service_status', {}, 'systemctl status discord-bots', 'status_svc')}
            >
              ⚙️ Statut service
            </button>
            <button
              className={btnClass('default')}
              disabled={loading['status_f2b']}
              onClick={() => onCallAction('fail2ban_status', {}, 'fail2ban status', 'status_f2b')}
            >
              🛡️ Statut Fail2ban
            </button>
            <button
              className={btnClass('default')}
              disabled={loading['status_api']}
              onClick={() => onCallAction('api_test', {}, 'Test API (port + health)', 'status_api')}
              title="Vérifie ss -tunlp | grep 8080 et curl localhost health"
            >
              🔬 Tester l'API
            </button>
          </div>
        </div>
        <ServerOutputPanel
          result={result}
          isLoading={isLoading}
          onExportTxt={onExportTxt}
          onExportJson={onExportJson}
        />
      </section>
    </>
  );
}
