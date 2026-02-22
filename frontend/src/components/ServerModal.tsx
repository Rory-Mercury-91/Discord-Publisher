import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConfirm } from '../hooks/useConfirm';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { useApp } from '../state/appContext';
import { useAuth } from '../state/authContext';
import ConfirmModal from './ConfirmModal';

type Tab = 'status' | 'security' | 'operations';

interface ActionResult {
  ts: number;
  action: string;
  output: string;
  ok: boolean;
}

interface ServerModalProps {
  onClose: () => void;
}

const DEFAULT_BASE = 'http://138.2.182.125:8080';

function getBase(apiUrl?: string): string {
  const raw = (apiUrl || '').trim() || DEFAULT_BASE;
  try { return new URL(raw).origin; }
  catch { return raw.split('/api')[0]?.replace(/\/+$/, '') || DEFAULT_BASE; }
}

const sec: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 12, padding: 16,
  background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: 12,
};

const btn = (v: 'default' | 'danger' | 'warning' | 'success' = 'default', disabled = false): React.CSSProperties => {
  const c = {
    default: { bg: 'rgba(99,102,241,0.14)', border: 'rgba(99,102,241,0.35)', color: 'var(--accent)' },
    danger: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)', color: '#ef4444' },
    warning: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', color: '#f59e0b' },
    success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)', color: '#10b981' },
  }[v];
  return {
    padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
    border: `1px solid ${c.border}`, background: c.bg, color: c.color,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
  };
};

const inp: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, boxSizing: 'border-box',
  border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)',
  color: 'var(--text)', fontSize: 13,
};

export default function ServerModal({ onClose }: ServerModalProps) {
  const { apiUrl } = useApp();
  const { profile } = useAuth();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  const [activeTab, setActiveTab] = useState<Tab>('status');

  // ── Config SSH locale (pour démarrer le service via Tauri Shell) ───────────
  const [sshKeyPath, setSshKeyPath] = useState<string>(
    () => localStorage.getItem('ssh_key_path') || ''
  );
  const [showSshConfig, setShowSshConfig] = useState(false);
  const sshKeyInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { localStorage.setItem('ssh_key_path', sshKeyPath); }, [sshKeyPath]);

  const isTauri = !!window.__TAURI__;

  const startServiceViaSsh = useCallback(async () => {
    if (!isTauri) {
      setResults(p => ({
        ...p,
        operations: {
          ts: Date.now(), action: 'systemctl start discord-bots',
          output: '❌ Démarrage SSH uniquement disponible dans l\'app desktop (Tauri).',
          ok: false,
        },
      }));
      return;
    }
    if (!sshKeyPath.trim()) {
      setShowSshConfig(true);
      return;
    }
    setLoading(p => ({ ...p, op_start: true }));
    try {
      // Import dynamique Tauri Shell — compatible v1 et v2
      // withGlobalTauri: true → tout est dispo sur window.__TAURI__
      const Command = (window as any).__TAURI__?.shell?.Command;
      if (!Command) throw new Error('Tauri Shell API non disponible (withGlobalTauri ?)');
      const cmd = Command.create('ssh', [
        '-i', sshKeyPath.trim(),
        '-p', '4242',
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ConnectTimeout=10',
        'ubuntu@138.2.182.125',
        'sudo systemctl start discord-bots && sudo systemctl status discord-bots --no-pager -l',
      ]);
      const output = await cmd.execute();
      const text = (output.stdout + output.stderr).trim();
      setResults(p => ({
        ...p,
        operations: {
          ts: Date.now(), action: 'ssh → systemctl start discord-bots',
          output: text || '✅ Commande envoyée (pas de sortie)',
          ok: output.code === 0,
        },
      }));
    } catch (e: any) {
      setResults(p => ({
        ...p,
        operations: {
          ts: Date.now(), action: 'ssh → systemctl start discord-bots',
          output: `❌ Erreur SSH : ${e.message}\n\nVérifiez le chemin de la clé SSH dans la configuration.`,
          ok: false,
        },
      }));
    } finally {
      setLoading(p => ({ ...p, op_start: false }));
    }
  }, [isTauri, sshKeyPath]);

  // Une seule zone de résultat par onglet
  const [results, setResults] = useState<Record<Tab, ActionResult | null>>({
    status: null, security: null, operations: null,
  });
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  // Inputs sécurité — via ref pour éviter le re-render/scroll
  const blockRef = useRef<HTMLTextAreaElement>(null);
  const unblockRef = useRef<HTMLInputElement>(null);
  const f2bIpRef = useRef<HTMLInputElement>(null);
  const f2bJailRef = useRef<HTMLInputElement>(null);

  useEscapeKey(onClose, true);
  useModalScrollLock();

  if (profile?.is_master_admin !== true) return null;

  const base = getBase(apiUrl);
  const apiKey = localStorage.getItem('apiKey') || '';

  // ── Appel générique ────────────────────────────────────────────────────────
  const callAction = useCallback(async (
    tab: Tab,
    action: string,
    params: Record<string, unknown> = {},
    label?: string,
    loadingKey?: string,
  ) => {
    const lk = loadingKey || action;
    setLoading(p => ({ ...p, [lk]: true }));
    try {
      const res = await fetch(`${base}/api/server/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
        body: JSON.stringify({ action, params }),
      });
      const data = await res.json();
      setResults(p => ({
        ...p,
        [tab]: { ts: Date.now(), action: label || action, output: data.output || data.error || '(vide)', ok: !!data.ok },
      }));
    } catch (e: any) {
      // ERR_CONNECTION_RESET attendu après stop/restart
      const isReset = e?.message?.includes('Failed to fetch') || e?.message?.includes('NetworkError');
      const isStopAction = ['service_restart', 'service_stop'].includes(action);
      const output = isReset && isStopAction
        ? '✅ Commande envoyée — connexion coupée (comportement normal : le service s\'arrête/redémarre).\n\nLe serveur sera de retour dans ~15 secondes pour un restart.'
        : `❌ ${e.message}`;
      setResults(p => ({
        ...p,
        [tab]: { ts: Date.now(), action: label || action, output, ok: isReset && isStopAction },
      }));
    } finally {
      setLoading(p => ({ ...p, [lk]: false }));
    }
  }, [base, apiKey]);

  // ── Export résultat ────────────────────────────────────────────────────────
  const exportResult = (r: ActionResult, format: 'json' | 'txt') => {
    const ts = new Date(r.ts).toISOString();
    let content: string;
    let mime: string;
    let ext: string;
    if (format === 'json') {
      content = JSON.stringify({ timestamp: ts, action: r.action, ok: r.ok, output: r.output }, null, 2);
      mime = 'application/json'; ext = 'json';
    } else {
      content = `[${ts}] ${r.action}\n${'─'.repeat(60)}\n${r.output}`;
      mime = 'text/plain'; ext = 'txt';
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = `server_result_${Date.now()}.${ext}`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  // ── Zone de sortie unifiée par onglet ─────────────────────────────────────
  const OutputPanel = ({ tab }: { tab: Tab }) => {
    const r = results[tab];
    const isLoading = Object.entries(loading).some(([, v]) => v);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {r && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => exportResult(r, 'txt')} style={btn('default')}>📄 Exporter .txt</button>
            <button onClick={() => exportResult(r, 'json')} style={btn('default')}>🔷 Exporter .json</button>
          </div>
        )}
        <div style={{
          background: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: 12,
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          minHeight: 100, maxHeight: 320, overflowY: 'auto',
          border: `1px solid ${r ? (r.ok ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)') : 'var(--border)'}`,
          color: r ? (r.ok ? '#d1fae5' : '#fca5a5') : 'var(--muted)',
        }}>
          {isLoading
            ? '⏳ Exécution en cours…'
            : r
              ? `[${new Date(r.ts).toLocaleTimeString('fr-FR')}] ${r.action}\n${'─'.repeat(40)}\n${r.output}`
              : 'Les résultats des actions s\'afficheront ici.'
          }
        </div>
      </div>
    );
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'status', label: 'Statut', icon: '📊' },
    { id: 'security', label: 'Sécurité', icon: '🛡️' },
    { id: 'operations', label: 'Opérations', icon: '⚙️' },
  ];

  const modalContent = (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999, backdropFilter: 'blur(4px)',
    }}>
      <div
        style={{
          background: 'var(--panel)', borderRadius: 14,
          width: '92%', maxWidth: 900, maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          border: '1px solid var(--border)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🖥️</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Gestion du serveur</h2>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Oracle Cloud — 138.2.182.125 • Accès master admin</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: 26, cursor: 'pointer', lineHeight: 1, padding: 0 }}>&times;</button>
        </div>

        {/* Onglets */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, padding: '0 24px' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding: '11px 18px', background: 'none', border: 'none',
              borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === t.id ? 'var(--accent)' : 'var(--muted)',
              cursor: 'pointer', fontSize: 13, fontWeight: activeTab === t.id ? 700 : 400,
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: -1,
            }}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        {/* Contenu scrollable */}
        <div className="styled-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ══ STATUT ════════════════════════════════════════════════════════ */}
          {activeTab === 'status' && <>
            <section style={sec}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <h4 style={{ margin: 0, fontSize: '0.9rem' }}>⚙️ Service &amp; Fail2ban</h4>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={btn('default', loading['status_svc'])} disabled={loading['status_svc']}
                    onClick={() => callAction('status', 'service_status', {}, 'systemctl status discord-bots', 'status_svc')}>
                    ⚙️ Statut service
                  </button>
                  <button style={btn('default', loading['status_f2b'])} disabled={loading['status_f2b']}
                    onClick={() => callAction('status', 'fail2ban_status', {}, 'fail2ban status (toutes prisons)', 'status_f2b')}>
                    🛡️ Statut Fail2ban
                  </button>
                </div>
              </div>
              <OutputPanel tab="status" />
            </section>
          </>}

          {/* ══ SÉCURITÉ ══════════════════════════════════════════════════════ */}
          {activeTab === 'security' && <>
            <section style={sec}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <h4 style={{ margin: 0, fontSize: '0.9rem' }}>🛡️ Actions sécurité</h4>
                <button style={btn('default', loading['sec_list'])} disabled={loading['sec_list']}
                  onClick={() => callAction('security', 'ip_list_blocked', {}, 'iptables + fail2ban list', 'sec_list')}>
                  📋 Lister les IP bloquées
                </button>
              </div>

              {/* Bloquer */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>🚫 Bloquer des IPs (une par ligne)</label>
                <textarea ref={blockRef} rows={3} placeholder={'192.168.1.1\n10.0.0.2'}
                  style={{ ...inp, width: '100%', resize: 'vertical', fontFamily: 'monospace' }} />
                <button style={btn('danger', loading['sec_block'])} disabled={loading['sec_block']}
                  onClick={async () => {
                    const raw = blockRef.current?.value || '';
                    const ips = raw.split('\n').map(s => s.trim()).filter(s => /^\d{1,3}(\.\d{1,3}){3}$/.test(s));
                    if (!ips.length) return;
                    const ok = await confirm({ title: '🚫 Bloquer des IPs', message: `Bloquer ${ips.length} IP(s) :\n${ips.join('\n')}`, confirmText: 'Bloquer', type: 'danger' });
                    if (!ok) return;
                    if (blockRef.current) blockRef.current.value = '';
                    await callAction('security', 'ip_block', { ips }, `iptables DROP (${ips.length} IPs)`, 'sec_block');
                  }}>
                  🚫 Bloquer
                </button>
              </div>

              {/* Débloquer iptables */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>✅ Débloquer — iptables manuel</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input ref={unblockRef} type="text" placeholder="IP à débloquer" style={{ ...inp, flex: 1 }} />
                  <button style={btn('success', loading['sec_unblock'])} disabled={loading['sec_unblock']}
                    onClick={async () => {
                      const val = unblockRef.current?.value || '';
                      const ips = val.split(/[\s,]+/).map(s => s.trim()).filter(s => /^\d{1,3}(\.\d{1,3}){3}$/.test(s));
                      if (!ips.length) return;
                      const ok = await confirm({ title: '✅ Débloquer', message: `Supprimer les règles DROP pour :\n${ips.join('\n')}`, confirmText: 'Débloquer', type: 'warning' });
                      if (!ok) return;
                      if (unblockRef.current) unblockRef.current.value = '';
                      await callAction('security', 'ip_unblock', { ips }, `iptables unblock (${ips.join(', ')})`, 'sec_unblock');
                    }}>
                    ✅ Débloquer iptables
                  </button>
                </div>
              </div>

              {/* Fail2ban unban */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>🔓 Débloquer — Fail2ban (laisser Prison vide = toutes)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input ref={f2bIpRef} type="text" placeholder="IP (ex: 1.2.3.4)" style={{ ...inp, flex: 2 }} />
                  <input ref={f2bJailRef} type="text" placeholder="Prison (optionnel)" style={{ ...inp, flex: 1 }} />
                  <button style={btn('success', loading['sec_f2b'])} disabled={loading['sec_f2b']}
                    onClick={() => {
                      const ip = f2bIpRef.current?.value?.trim() || '';
                      const jail = f2bJailRef.current?.value?.trim() || '';
                      if (!ip) return;
                      callAction('security', 'fail2ban_unban', { ip, jail }, `fail2ban unban ${ip}`, 'sec_f2b');
                    }}>
                    🔓 Unban F2B
                  </button>
                </div>
              </div>

              <OutputPanel tab="security" />
            </section>
          </>}

          {/* ══ OPÉRATIONS ════════════════════════════════════════════════════ */}
          {activeTab === 'operations' && <>
            <section style={{ ...sec, border: '1px solid rgba(99,102,241,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h4 style={{ margin: 0, fontSize: '0.9rem' }}>⚙️ Service discord-bots</h4>
                {isTauri && (
                  <button style={{ ...btn('default'), fontSize: 11 }} onClick={() => setShowSshConfig(s => !s)}>
                    🔑 Clé SSH {sshKeyPath ? '✅' : '⚠️ non configurée'}
                  </button>
                )}
              </div>

              {/* Config SSH key path */}
              {showSshConfig && isTauri && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, background: 'rgba(99,102,241,0.06)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.2)' }}>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                    📁 Chemin absolu vers la clé SSH privée (utilisée pour démarrer le service)
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      ref={sshKeyInputRef}
                      type="text"
                      defaultValue={sshKeyPath}
                      placeholder="D:\Projet GitHub\...\ssh-key-2026-02-07.key"
                      style={{ ...inp, flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                    />
                    <button style={btn('success')} onClick={() => {
                      const v = sshKeyInputRef.current?.value?.trim() || '';
                      setSshKeyPath(v);
                      setShowSshConfig(false);
                    }}>
                      💾 Sauvegarder
                    </button>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Stockée localement, jamais transmise au serveur. Utilisée uniquement pour SSH depuis cette machine.
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {/* Démarrer — SSH local, uniquement si Tauri */}
                {isTauri && (
                  <button style={btn('success', loading['op_start'])} disabled={loading['op_start']}
                    onClick={async () => {
                      const ok = await confirm({ title: '▶️ Démarrer le service', message: 'Connexion SSH locale vers 138.2.182.125:4242\npuis : sudo systemctl start discord-bots\n\nLe service sera opérationnel dans ~5 secondes.', confirmText: '▶️ Démarrer', type: 'warning' });
                      if (!ok) return;
                      await startServiceViaSsh();
                    }}>
                    ▶️ Démarrer
                  </button>
                )}
                <button style={btn('warning', loading['op_restart'])} disabled={loading['op_restart']}
                  onClick={async () => {
                    const ok = await confirm({ title: '🔄 Redémarrer le service', message: 'Le service va être redémarré (~15s d\'interruption).\n\n⚠️ La connexion sera coupée pendant le restart — c\'est normal.', confirmText: 'Redémarrer', type: 'warning' });
                    if (!ok) return;
                    await callAction('operations', 'service_restart', {}, 'systemctl restart discord-bots', 'op_restart');
                  }}>
                  🔄 Redémarrer
                </button>
                <button style={btn('danger', loading['op_stop'])} disabled={loading['op_stop']}
                  onClick={async () => {
                    const ok = await confirm({ title: '⛔ Arrêter le service', message: '⚠️ ATTENTION — Arrêt complet.\n\nL\'API sera inaccessible.\n\nUtilise le bouton ▶️ Démarrer (SSH local) pour relancer sans accès SSH manuel.\n\nLa connexion sera coupée — c\'est attendu.', confirmText: '⛔ Arrêter', type: 'danger' });
                    if (!ok) return;
                    const ok2 = await confirm({ title: '⛔ CONFIRMATION FINALE', message: 'Confirmer l\'arrêt complet du service ?', confirmText: '⛔ OUI, ARRÊTER', type: 'danger' });
                    if (!ok2) return;
                    await callAction('operations', 'service_stop', {}, 'systemctl stop discord-bots', 'op_stop');
                  }}>
                  ⛔ Arrêter
                </button>
              </div>
            </section>

            <section style={{ ...sec, border: '1px solid rgba(245,158,11,0.2)' }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem' }}>🔥 Pare-feu iptables</h4>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
                Le reset efface toutes les règles DROP manuelles et restaure les règles ACCEPT de base (SSH:22, API:8080, port:4242, loopback, RELATED/ESTABLISHED) puis recharge Fail2ban.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button style={btn('default', loading['op_fw_status'])} disabled={loading['op_fw_status']}
                  onClick={() => callAction('operations', 'firewall_status', {}, 'iptables -L INPUT -n -v', 'op_fw_status')}>
                  📋 Voir les règles
                </button>
                <button style={btn('danger', loading['op_fw_reset'])} disabled={loading['op_fw_reset']}
                  onClick={async () => {
                    const ok = await confirm({ title: '💥 Reset total du pare-feu', message: 'Cette action va :\n1. Vider toutes les chaînes iptables\n2. Restaurer les règles ACCEPT de base (ports 22, 8080, 4242, loopback, ICMP)\n3. Sauvegarder avec netfilter-persistent\n4. Recharger Fail2ban\n\n⚠️ Toutes les IP bloquées manuellement seront débloquées.', confirmText: '💥 Réinitialiser', type: 'danger' });
                    if (!ok) return;
                    const ok2 = await confirm({ title: '💥 CONFIRMATION FINALE', message: 'Confirmer le reset complet d\'iptables ?', confirmText: '💥 CONFIRMER', type: 'danger' });
                    if (!ok2) return;
                    await callAction('operations', 'firewall_reset', {}, 'iptables RESET + règles base + fail2ban reload', 'op_fw_reset');
                  }}>
                  💥 Reset pare-feu
                </button>
              </div>
            </section>

            <OutputPanel tab="operations" />
          </>}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 24px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>↩️ Fermer</button>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        type={confirmState.type}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );

  return createPortal(modalContent, document.body);
}
