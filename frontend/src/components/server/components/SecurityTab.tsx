import { useRef } from 'react';
import type { ActionResult } from '../types';
import ServerOutputPanel from './ServerOutputPanel';

const btnClass = (v: 'default' | 'danger' | 'warning' | 'success') =>
  `server-btn server-btn--${v}`;

interface SecurityTabProps {
  result: ActionResult | null;
  isLoading: boolean;
  loading: Record<string, boolean>;
  onCallAction: (action: string, params: Record<string, unknown>, label?: string, loadingKey?: string) => Promise<void>;
  onExportTxt: () => void;
  onExportJson: () => void;
  onConfirm: (options: { title: string; message: string; confirmText: string; type: 'danger' | 'warning' }) => Promise<boolean>;
}

export default function SecurityTab({
  result,
  isLoading,
  loading,
  onCallAction,
  onExportTxt,
  onExportJson,
  onConfirm,
}: SecurityTabProps) {
  const blockRef = useRef<HTMLTextAreaElement>(null);
  const unblockRef = useRef<HTMLInputElement>(null);
  const f2bIpRef = useRef<HTMLInputElement>(null);
  const f2bJailRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <section className="server-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h4 style={{ margin: 0, fontSize: '0.9rem' }}>🛡️ Actions sécurité</h4>
          <button
            className={btnClass('default')}
            disabled={loading['sec_list']}
            onClick={() => onCallAction('ip_list_blocked', {}, 'iptables + fail2ban list', 'sec_list')}
          >
            📋 Lister les IP bloquées
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="server-section__label">🚫 Bloquer des IPs (une par ligne)</label>
          <textarea
            ref={blockRef}
            rows={3}
            placeholder={'192.168.1.1\n10.0.0.2'}
            className="server-input"
            style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace' }}
          />
          <button
            className={btnClass('danger')}
            disabled={loading['sec_block']}
            onClick={async () => {
              const raw = blockRef.current?.value || '';
              const ips = raw.split('\n').map(s => s.trim()).filter(s => /^\d{1,3}(\.\d{1,3}){3}$/.test(s));
              if (!ips.length) return;
              const ok = await onConfirm({ title: '🚫 Bloquer des IPs', message: `Bloquer ${ips.length} IP(s) :\n${ips.join('\n')}`, confirmText: 'Bloquer', type: 'danger' });
              if (!ok) return;
              if (blockRef.current) blockRef.current.value = '';
              await onCallAction('ip_block', { ips }, `iptables DROP (${ips.length} IPs)`, 'sec_block');
            }}
          >
            🚫 Bloquer
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="server-section__label">✅ Débloquer — iptables manuel</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input ref={unblockRef} type="text" placeholder="IP à débloquer" className="server-input" style={{ flex: 1 }} />
            <button
              className={btnClass('success')}
              disabled={loading['sec_unblock']}
              onClick={async () => {
                const val = unblockRef.current?.value || '';
                const ips = val.split(/[\s,]+/).map(s => s.trim()).filter(s => /^\d{1,3}(\.\d{1,3}){3}$/.test(s));
                if (!ips.length) return;
                const ok = await onConfirm({ title: '✅ Débloquer', message: `Supprimer les règles DROP pour :\n${ips.join('\n')}`, confirmText: 'Débloquer', type: 'warning' });
                if (!ok) return;
                if (unblockRef.current) unblockRef.current.value = '';
                await onCallAction('ip_unblock', { ips }, `iptables unblock (${ips.join(', ')})`, 'sec_unblock');
              }}
            >
              ✅ Débloquer iptables
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="server-section__label">🔓 Débloquer — Fail2ban (Prison vide = toutes)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input ref={f2bIpRef} type="text" placeholder="IP (ex: 1.2.3.4)" className="server-input" style={{ flex: 2 }} />
            <input ref={f2bJailRef} type="text" placeholder="Prison (optionnel)" className="server-input" style={{ flex: 1 }} />
            <button
              className={btnClass('success')}
              disabled={loading['sec_f2b']}
              onClick={() => {
                const ip = f2bIpRef.current?.value?.trim() || '';
                const jail = f2bJailRef.current?.value?.trim() || '';
                if (!ip) return;
                onCallAction('fail2ban_unban', { ip, jail }, `fail2ban unban ${ip}`, 'sec_f2b');
              }}
            >
              🔓 Unban F2B
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
