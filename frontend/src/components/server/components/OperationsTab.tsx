import { useState } from 'react';
import type { ActionResult } from '../types';
import ServerOutputPanel from './ServerOutputPanel';

const btnClass = (v: 'default' | 'danger' | 'warning' | 'success') =>
  `server-btn server-btn--${v}`;

interface OperationsTabProps {
  result: ActionResult | null;
  isLoading: boolean;
  loading: Record<string, boolean>;
  onCallAction: (action: string, params: Record<string, unknown>, label?: string, loadingKey?: string) => Promise<void>;
  onExportTxt: () => void;
  onExportJson: () => void;
  onConfirm: (options: { title: string; message: string; confirmText: string; type: 'danger' | 'warning' }) => Promise<boolean>;
  isTauri: boolean;
  sshKeyPath: string;
  setSshKeyPath: (v: string) => void;
  showSshConfig: boolean;
  setShowSshConfig: (v: boolean | ((prev: boolean) => boolean)) => void;
  sshKeyInputRef: React.RefObject<HTMLInputElement | null>;
  onOpenSshTerminal: () => Promise<void>;
  onBrowseSshKey: () => Promise<void>;
  onStartViaSsh: () => Promise<void>;
}

export default function OperationsTab({
  result,
  isLoading,
  loading,
  onCallAction,
  onExportTxt,
  onExportJson,
  onConfirm,
  isTauri,
  sshKeyPath,
  setSshKeyPath,
  showSshConfig,
  setShowSshConfig,
  sshKeyInputRef,
  onOpenSshTerminal,
  onBrowseSshKey,
  onStartViaSsh,
}: OperationsTabProps) {

  return (
    <>
      <section className="server-section" style={{ borderColor: 'var(--accent-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0, fontSize: '0.9rem' }}>⚙️ Service discord-bots</h4>
          <div style={{ display: 'flex', gap: 8 }}>
            {isTauri && (
              <>
                <button
                  type="button"
                  className={btnClass('default')}
                  style={{ fontSize: 11 }}
                  onClick={() => setShowSshConfig(s => !s)}
                >
                  🔑 Clé SSH {sshKeyPath ? '✅' : '⚠️'}
                </button>
                <button type="button" className={btnClass('default')} onClick={onOpenSshTerminal} title="Ouvre un terminal PowerShell SSH">
                  💻 Terminal SSH
                </button>
              </>
            )}
          </div>
        </div>

        {showSshConfig && isTauri && (
          <div className="server-ssh-config">
            <label className="server-section__label">📁 Chemin absolu vers la clé SSH privée</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={sshKeyInputRef}
                type="text"
                defaultValue={sshKeyPath}
                placeholder="D:/Projet GitHub/.../ssh-key.key"
                className="server-input"
                style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
              />
              <button type="button" className={btnClass('default')} onClick={onBrowseSshKey}>📂 Parcourir</button>
              <button
                type="button"
                className={btnClass('success')}
                onClick={() => {
                  const v = sshKeyInputRef.current?.value?.trim() ?? '';
                  setSshKeyPath(v);
                  setShowSshConfig(false);
                }}
              >
                💾 Sauvegarder
              </button>
            </div>
            {sshKeyPath && <span className="server-ssh-config__path-ok">✅ Chemin : {sshKeyPath}</span>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isTauri && (
            <button
              className={btnClass('success')}
              disabled={loading['op_start']}
              onClick={async () => {
                const ok = await onConfirm({ title: '▶️ Démarrer', message: 'Connexion SSH → sudo systemctl start discord-bots', confirmText: '▶️ Démarrer', type: 'warning' });
                if (!ok) return;
                await onStartViaSsh();
              }}
            >
              ▶️ Démarrer
            </button>
          )}
          <button
            className={btnClass('warning')}
            disabled={loading['op_restart']}
            onClick={async () => {
              const ok = await onConfirm({ title: '🔄 Redémarrer', message: 'Le service va être redémarré (~15s d\'interruption).', confirmText: 'Redémarrer', type: 'warning' });
              if (!ok) return;
              await onCallAction('service_restart', {}, 'systemctl restart discord-bots', 'op_restart');
            }}
          >
            🔄 Redémarrer
          </button>
          <button
            className={btnClass('danger')}
            disabled={loading['op_stop']}
            onClick={async () => {
              const ok = await onConfirm({ title: '⛔ Arrêter', message: '⚠️ L\'API sera inaccessible.', confirmText: '⛔ Arrêter', type: 'danger' });
              if (!ok) return;
              const ok2 = await onConfirm({ title: '⛔ CONFIRMATION', message: 'Confirmer l\'arrêt complet ?', confirmText: '⛔ OUI', type: 'danger' });
              if (!ok2) return;
              await onCallAction('service_stop', {}, 'systemctl stop discord-bots', 'op_stop');
            }}
          >
            ⛔ Arrêter
          </button>
        </div>
      </section>

      <section className="server-section" style={{ borderColor: 'var(--warning)' }}>
        <h4 style={{ margin: 0, fontSize: '0.9rem' }}>🔥 Pare-feu iptables</h4>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
          Le reset efface toutes les règles DROP et restaure les règles ACCEPT de base, puis recharge Fail2ban.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className={btnClass('default')}
            disabled={loading['op_fw_status']}
            onClick={() => onCallAction('firewall_status', {}, 'iptables -L INPUT -n -v', 'op_fw_status')}
          >
            📋 Voir les règles
          </button>
          <button
            className={btnClass('danger')}
            disabled={loading['op_fw_reset']}
            onClick={async () => {
              const ok = await onConfirm({ title: '💥 Reset pare-feu', message: '⚠️ Toutes les IPs bloquées manuellement seront débloquées.', confirmText: '💥 Réinitialiser', type: 'danger' });
              if (!ok) return;
              const ok2 = await onConfirm({ title: '💥 CONFIRMATION', message: 'Confirmer le reset complet d\'iptables ?', confirmText: '💥 CONFIRMER', type: 'danger' });
              if (!ok2) return;
              await onCallAction('firewall_reset', {}, 'iptables RESET + règles base + fail2ban reload', 'op_fw_reset');
            }}
          >
            💥 Reset pare-feu
          </button>
        </div>
      </section>

      <PurgeLogsSection
        loading={loading}
        onCallAction={onCallAction}
        onConfirm={onConfirm}
      />

      <ServerOutputPanel
        result={result}
        isLoading={isLoading}
        onExportTxt={onExportTxt}
        onExportJson={onExportJson}
      />
    </>
  );
}

function PurgeLogsSection({
  loading,
  onCallAction,
  onConfirm,
}: {
  loading: Record<string, boolean>;
  onCallAction: (action: string, params: Record<string, unknown>, label?: string, loadingKey?: string) => Promise<void>;
  onConfirm: (options: { title: string; message: string; confirmText: string; type: 'danger' | 'warning' }) => Promise<boolean>;
}) {
  const [purgeMode, setPurgeMode] = useState<'bot' | 'journal' | 'both'>('both');
  const [vacuumTime, setVacuumTime] = useState<'1d' | '7d' | '30d' | 'all'>('7d');

  return (
    <section className="server-section" style={{ borderColor: 'var(--error-border)' }}>
      <h4 style={{ margin: 0, fontSize: '0.9rem' }}>🗑️ Purge des logs</h4>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="server-section__label">Cibles</label>
          <div className="server-chips">
            {(['bot', 'journal', 'both'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setPurgeMode(m)}
                className={purgeMode === m ? 'server-chip server-chip--active' : 'server-chip'}
              >
                {m === 'bot' ? '📄 bot.log' : m === 'journal' ? '📋 journalctl' : '🗑️ Tout'}
              </button>
            ))}
          </div>
        </div>
        {purgeMode !== 'bot' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="server-section__label">Vacuum journalctl</label>
            <div className="server-chips">
              {(['1d', '7d', '30d', 'all'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVacuumTime(v)}
                  className={vacuumTime === v ? 'server-chip server-chip--warning-active' : 'server-chip'}
                >
                  {v === 'all' ? '🔥 Tout' : v === '1d' ? '24h' : v === '7d' ? '7 jours' : '30 jours'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <button
        className={btnClass('danger')}
        disabled={loading['op_purge']}
        onClick={async () => {
          const desc = purgeMode === 'bot' ? 'Vider bot.log'
            : purgeMode === 'journal' ? `Vacuum journalctl (${vacuumTime})`
              : `Vider bot.log + Vacuum journalctl (${vacuumTime})`;
          const ok = await onConfirm({ title: '🗑️ Purge logs', message: `Action : ${desc}\n\n⚠️ Cette action est irréversible.`, confirmText: '🗑️ Purger', type: 'danger' });
          if (!ok) return;
          await onCallAction('logs_purge', { mode: purgeMode, vacuum_time: vacuumTime }, desc, 'op_purge');
        }}
      >
        🗑️ Exécuter la purge
      </button>
    </section>
  );
}
