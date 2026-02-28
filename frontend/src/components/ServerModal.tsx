import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConfirm } from '../hooks/useConfirm';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { apiFetch } from '../lib/api-helpers';
import { getSupabase } from '../lib/supabase';
import { useApp } from '../state/appContext';
import { useAuth } from '../state/authContext';
import ConfirmModal from './ConfirmModal';

type Tab = 'status' | 'security' | 'operations' | 'ip_analysis';

interface ActionResult {
  ts: number;
  action: string;
  output: string;
  ok: boolean;
}

interface IpRow {
  ip: string;
  total: number;
  suspicious: number;
  org: string;
  category: 'MOI' | 'MEMBRE' | 'PROXY' | 'PUBLIC' | 'ERREUR';
  identity: string;
  topRoute: string;
}

interface ServerModalProps {
  onClose: () => void;
  /** Si true : pas de portal/backdrop propre — pour usage dans DualLayout */
  inlineMode?: boolean;
}

const DEFAULT_BASE = 'http://138.2.182.125:8080';

function getBase(apiUrl?: string): string {
  const raw = (apiUrl || '').trim() || DEFAULT_BASE;
  try { return new URL(raw).origin; }
  catch { return raw.split('/api')[0]?.replace(/\/+$/, '') || DEFAULT_BASE; }
}

const ALLOWED_METHODS = ['GET', 'POST', 'OPTIONS'];
const ALLOWED_ROUTES = [
  '/', '/api/status', '/api/configure', '/api/publisher/health',
  '/api/forum-post', '/api/forum-post/update', '/api/forum-post/delete',
  '/api/history', '/reset-password', '/api/jeux', '/api/logs',
];

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

export default function ServerModal({ onClose, inlineMode = false }: ServerModalProps) {
  const { apiUrl } = useApp();
  const { profile } = useAuth();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  const [activeTab, setActiveTab] = useState<Tab>('status');

  // ── SSH Key ────────────────────────────────────────────────────────────────
  const [sshKeyPath, setSshKeyPath] = useState(() => localStorage.getItem('ssh_key_path') || '');
  const [showSshConfig, setShowSshConfig] = useState(false);
  const sshKeyInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { localStorage.setItem('ssh_key_path', sshKeyPath); }, [sshKeyPath]);

  const isTauri = !!window.__TAURI__;

  // ── Results & loading ──────────────────────────────────────────────────────
  const [results, setResults] = useState<Record<Tab, ActionResult | null>>({
    status: null, security: null, operations: null, ip_analysis: null,
  });
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  // ── IP Analysis state ──────────────────────────────────────────────────────
  const [ipRows, setIpRows] = useState<IpRow[]>([]);
  const [ipLoading, setIpLoading] = useState(false);
  const [ipError, setIpError] = useState<string | null>(null);
  const [myIp, setMyIp] = useState('');

  // ── Purge logs state ───────────────────────────────────────────────────────
  const [purgeMode, setPurgeMode] = useState<'bot' | 'journal' | 'both'>('both');
  const [vacuumTime, setVacuumTime] = useState<'1d' | '7d' | '30d' | 'all'>('7d');

  // ── Inputs sécurité ────────────────────────────────────────────────────────
  const blockRef = useRef<HTMLTextAreaElement>(null);
  const unblockRef = useRef<HTMLInputElement>(null);
  const f2bIpRef = useRef<HTMLInputElement>(null);
  const f2bJailRef = useRef<HTMLInputElement>(null);

  useEscapeKey(onClose, true);
  useModalScrollLock();

  if (profile?.is_master_admin !== true) return null;

  const base = getBase(apiUrl);
  const apiKey = localStorage.getItem('apiKey') || '';

  // ── Generic action call ────────────────────────────────────────────────────
  const callAction = useCallback(async (
    tab: Tab, action: string,
    params: Record<string, unknown> = {},
    label?: string, loadingKey?: string,
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
      const isReset = e?.message?.includes('Failed to fetch') || e?.message?.includes('NetworkError');
      const isStop = ['service_restart', 'service_stop'].includes(action);
      const output = isReset && isStop
        ? '✅ Commande envoyée — connexion coupée (comportement normal).\n\nLe serveur sera de retour dans ~15s pour un restart.'
        : `❌ ${e.message}`;
      setResults(p => ({
        ...p,
        [tab]: { ts: Date.now(), action: label || action, output, ok: isReset && isStop },
      }));
    } finally {
      setLoading(p => ({ ...p, [lk]: false }));
    }
  }, [base, apiKey]);

  // ── SSH Terminal (Tauri) ───────────────────────────────────────────────────
  const openSshTerminal = useCallback(async () => {
    if (!isTauri) return;
    if (!sshKeyPath.trim()) { setShowSshConfig(true); return; }
    try {
      const Command = (window as any).__TAURI__?.shell?.Command;
      if (!Command) throw new Error('Tauri Shell API non disponible');
      const normalizedKey = sshKeyPath.trim().replace(/\\/g, '/');
      const sshCommand = `ssh -i "${normalizedKey}" ubuntu@138.2.182.125 -p 4242`;
      // cmd /c start ouvre une NOUVELLE fenêtre powershell visible
      const cmd = Command.create('cmd', [
        '/c', 'start', 'powershell',
        '-NoExit', '-Command', sshCommand,
      ]);
      await cmd.spawn();
    } catch (e: any) {
      setResults(p => ({
        ...p,
        operations: {
          ts: Date.now(),
          action: 'SSH Terminal',
          output: `❌ ${e?.message || e}`,
          ok: false
        },
      }));
    }
  }, [isTauri, sshKeyPath]);

  // ── Start via SSH ──────────────────────────────────────────────────────────
  const startServiceViaSsh = useCallback(async () => {
    if (!isTauri) {
      setResults(p => ({ ...p, operations: { ts: Date.now(), action: 'systemctl start', output: '❌ Uniquement disponible en mode desktop (Tauri).', ok: false } }));
      return;
    }
    if (!sshKeyPath.trim()) { setShowSshConfig(true); return; }
    setLoading(p => ({ ...p, op_start: true }));
    try {
      const Command = (window as any).__TAURI__?.shell?.Command;
      if (!Command) throw new Error('Tauri Shell API non disponible');
      const normalizedKey = sshKeyPath.trim().replace(/\\/g, '/');
      const cmd = Command.create('ssh', [
        '-i', normalizedKey, '-p', '4242',
        '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10',
        'ubuntu@138.2.182.125',
        'sudo systemctl start discord-bots && sudo systemctl status discord-bots --no-pager -l',
      ]);
      const out = await cmd.execute();
      const text = (out.stdout + out.stderr).trim();
      setResults(p => ({
        ...p,
        operations: { ts: Date.now(), action: 'ssh → systemctl start', output: text || '✅ Commande envoyée', ok: out.code === 0 },
      }));
    } catch (e: any) {
      setResults(p => ({
        ...p,
        operations: { ts: Date.now(), action: 'ssh → systemctl start', output: `❌ Erreur SSH : ${e?.message || e}`, ok: false },
      }));
    } finally {
      setLoading(p => ({ ...p, op_start: false }));
    }
  }, [isTauri, sshKeyPath]);

  const browseForSshKey = useCallback(async () => {
    try {
      const dialogOpen = (window as any).__TAURI__?.dialog?.open ?? (window as any).__TAURI_PLUGIN_DIALOG__?.open;
      if (!dialogOpen) { alert('API Dialog Tauri non disponible. Saisissez le chemin manuellement.'); return; }
      const selected = await dialogOpen({ title: 'Clé SSH privée', filters: [{ name: 'Clé SSH', extensions: ['key', 'pem', 'ppk'] }, { name: 'Tous', extensions: ['*'] }], multiple: false, directory: false });
      if (selected && typeof selected === 'string') {
        setSshKeyPath(selected);
        if (sshKeyInputRef.current) sshKeyInputRef.current.value = selected;
      }
    } catch (e: any) { console.warn('browseForSshKey:', e?.message || e); }
  }, []);

  // ── IP Analysis ────────────────────────────────────────────────────────────
  const runIpAnalysis = useCallback(async () => {
    setIpLoading(true);
    setIpError(null);
    setIpRows([]);
    try {
      // 1. Mon IP
      let selfIp = myIp;
      if (!selfIp) {
        try { const r = await fetch('https://ipinfo.io/json'); const d = await r.json(); selfIp = d.ip || ''; setMyIp(selfIp); }
        catch { selfIp = ''; }
      }

      // 2. Logs
      const res = await apiFetch(`${base}/api/logs`, apiKey);
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      const rawLogs: string = data.logs || '';

      // 3. Parse [REQUEST] lines
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const requestRe = /\[REQUEST\]\s+(\d{1,3}(?:\.\d{1,3}){3})\s+\|\s+([^|]+)\s+\|\s+(?:[^|]+\s+\|\s+)?(.+?)\s*$/;

      const parsed: { ip: string; identity: string; method: string; path: string; suspicious: boolean }[] = [];
      const uuids: string[] = [];

      for (const line of rawLogs.split('\n')) {
        const m = line.match(requestRe);
        if (!m) continue;
        const ip = m[1].trim();
        if (ip === '127.0.0.1') continue;
        const ident = m[2].trim() === 'NULL' ? '' : m[2].trim();
        if (ident && uuidRe.test(ident) && !uuids.includes(ident.toLowerCase())) uuids.push(ident.toLowerCase());
        const rest = m[3].trim();
        let method = rest, path = '-';
        const mp = rest.match(/^([A-Z]+)\s+(.+)$/);
        if (mp) { method = mp[1]; path = mp[2]; }
        const methodOk = ALLOWED_METHODS.includes(method);
        const routeOk = method === 'OPTIONS' || ALLOWED_ROUTES.includes(path);
        parsed.push({ ip, identity: ident, method, path, suspicious: !(methodOk && routeOk) });
      }

      if (!parsed.length) { setIpError('Aucune ligne [REQUEST] parsée.'); setIpLoading(false); return; }

      // 4. Supabase UUID → pseudo
      const uuidMap: Record<string, string> = {};
      if (uuids.length) {
        try {
          const sb = getSupabase();
          if (sb) {
            const { data: profiles } = await sb.from('profiles').select('id,pseudo').in('id', uuids);
            profiles?.forEach((p: any) => { uuidMap[p.id.toLowerCase()] = p.pseudo || 'Utilisateur'; });
          }
        } catch { /* non bloquant */ }
      }

      // Résoudre les identités
      const resolveIdent = (ident: string) => {
        if (!ident) return '';
        if (uuidRe.test(ident)) { const pseudo = uuidMap[ident.toLowerCase()]; return pseudo ? `@${pseudo}` : ident.slice(0, 8) + '…'; }
        return ident;
      };

      // 5. Grouper par IP
      const byIp: Record<string, typeof parsed> = {};
      for (const r of parsed) {
        if (!byIp[r.ip]) byIp[r.ip] = [];
        byIp[r.ip].push(r);
      }

      // 6. ipinfo.io pour chaque IP
      const rows: IpRow[] = [];
      for (const [ip, reqs] of Object.entries(byIp)) {
        const total = reqs.length;
        const suspicious = reqs.filter(r => r.suspicious).length;
        const ident = resolveIdent(reqs.find(r => r.identity)?.identity || '');
        const topRoute = (() => {
          const cnt: Record<string, number> = {};
          reqs.forEach(r => { const k = `${r.method} ${r.path}`; cnt[k] = (cnt[k] || 0) + 1; });
          return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
        })();
        let org = 'Unknown';
        let category: IpRow['category'] = 'PUBLIC';
        try {
          const ir = await fetch(`https://ipinfo.io/${ip}/json`);
          const id = await ir.json();
          org = id.org || 'Unknown';
          if (ip === selfIp) category = 'MOI';
          else if (ident.startsWith('@')) category = 'MEMBRE';
          else if (/Proton|M247|Datacamp|VPN|Proxy|Servers|Cloudflare/i.test(org)) category = 'PROXY';
          else category = 'PUBLIC';
        } catch { category = 'ERREUR'; }
        rows.push({ ip, total, suspicious, org, category, identity: ident, topRoute });
      }

      setIpRows(rows.sort((a, b) => b.total - a.total));
    } catch (e: any) {
      setIpError(e.message || String(e));
    } finally {
      setIpLoading(false);
    }
  }, [base, apiKey, myIp]);

  // ── Export ─────────────────────────────────────────────────────────────────
  const exportResult = (r: ActionResult, fmt: 'json' | 'txt') => {
    const ts = new Date(r.ts).toISOString();
    let content: string, mime: string, ext: string;
    if (fmt === 'json') { content = JSON.stringify({ timestamp: ts, action: r.action, ok: r.ok, output: r.output }, null, 2); mime = 'application/json'; ext = 'json'; }
    else { content = `[${ts}] ${r.action}\n${'─'.repeat(60)}\n${r.output}`; mime = 'text/plain'; ext = 'txt'; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = `server_result_${Date.now()}.${ext}`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  // ── Output panel ───────────────────────────────────────────────────────────
  const OutputPanel = ({ tab }: { tab: Tab }) => {
    const r = results[tab];
    const isLoading = Object.entries(loading).some(([, v]) => v);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {r && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => exportResult(r, 'txt')} style={btn()}>📄 .txt</button>
            <button onClick={() => exportResult(r, 'json')} style={btn()}>🔷 .json</button>
          </div>
        )}
        <div style={{
          background: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: 12,
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          minHeight: 100, maxHeight: 280, overflowY: 'auto',
          border: `1px solid ${r ? (r.ok ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)') : 'var(--border)'}`,
          color: r ? (r.ok ? '#d1fae5' : '#fca5a5') : 'var(--muted)',
        }}>
          {isLoading ? '⏳ Exécution en cours…'
            : r ? `[${new Date(r.ts).toLocaleTimeString('fr-FR')}] ${r.action}\n${'─'.repeat(40)}\n${r.output}`
              : 'Les résultats s\'afficheront ici.'}
        </div>
      </div>
    );
  };

  // ── Category color ─────────────────────────────────────────────────────────
  const catColor = (cat: IpRow['category']) => ({
    MOI: '#38bdf8', MEMBRE: '#4ade80', PROXY: '#e879f9', PUBLIC: '#e2e8f0', ERREUR: '#ef4444',
  }[cat] || '#e2e8f0');

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'status', label: 'Statut', icon: '📊' },
    { id: 'security', label: 'Sécurité', icon: '🛡️' },
    { id: 'operations', label: 'Opérations', icon: '⚙️' },
    { id: 'ip_analysis', label: 'Analyse IPs', icon: '🔍' },
  ];

  // ── Panel ──────────────────────────────────────────────────────────────────
  const panel = (
    <div
      style={{
        background: 'var(--panel)', borderRadius: 14,
        width: inlineMode ? 860 : '92%',
        maxWidth: inlineMode ? 860 : 900,
        height: inlineMode ? '88vh' : undefined,
        maxHeight: inlineMode ? '88vh' : '90vh',
        display: 'flex', flexDirection: 'column',
        border: '1px solid var(--border)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        flexShrink: 0,
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🖥️</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Gestion du serveur</h2>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Oracle Cloud — 138.2.182.125 • Accès master admin</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, padding: '0 24px' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '11px 14px', background: 'none', border: 'none',
            borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === t.id ? 'var(--accent)' : 'var(--muted)',
            cursor: 'pointer', fontSize: 12, fontWeight: activeTab === t.id ? 700 : 400,
            display: 'flex', alignItems: 'center', gap: 5, marginBottom: -1,
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className="styled-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ══ STATUT ══════════════════════════════════════════════════════════ */}
        {activeTab === 'status' && <>
          <section style={sec}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem' }}>⚙️ Service &amp; Fail2ban</h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={btn('default', loading['status_svc'])} disabled={loading['status_svc']}
                  onClick={() => callAction('status', 'service_status', {}, 'systemctl status discord-bots', 'status_svc')}>
                  ⚙️ Statut service
                </button>
                <button style={btn('default', loading['status_f2b'])} disabled={loading['status_f2b']}
                  onClick={() => callAction('status', 'fail2ban_status', {}, 'fail2ban status', 'status_f2b')}>
                  🛡️ Statut Fail2ban
                </button>
                <button style={btn('default', loading['status_api'])} disabled={loading['status_api']}
                  onClick={() => callAction('status', 'api_test', {}, 'Test API (port + health)', 'status_api')}
                  title="Vérifie ss -tunlp | grep 8080 et curl localhost health">
                  🔬 Tester l'API
                </button>
              </div>
            </div>
            <OutputPanel tab="status" />
          </section>
        </>}

        {/* ══ SÉCURITÉ ════════════════════════════════════════════════════════ */}
        {activeTab === 'security' && <>
          <section style={sec}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem' }}>🛡️ Actions sécurité</h4>
              <button style={btn('default', loading['sec_list'])} disabled={loading['sec_list']}
                onClick={() => callAction('security', 'ip_list_blocked', {}, 'iptables + fail2ban list', 'sec_list')}>
                📋 Lister les IP bloquées
              </button>
            </div>

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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>🔓 Débloquer — Fail2ban (Prison vide = toutes)</label>
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

        {/* ══ OPÉRATIONS ══════════════════════════════════════════════════════ */}
        {activeTab === 'operations' && <>
          {/* Service */}
          <section style={{ ...sec, border: '1px solid rgba(99,102,241,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem' }}>⚙️ Service discord-bots</h4>
              <div style={{ display: 'flex', gap: 8 }}>
                {isTauri && (
                  <>
                    <button style={{ ...btn('default'), fontSize: 11 }} onClick={() => setShowSshConfig(s => !s)}>
                      🔑 Clé SSH {sshKeyPath ? '✅' : '⚠️'}
                    </button>
                    <button style={btn('default')} onClick={openSshTerminal} title="Ouvre un terminal PowerShell SSH">
                      💻 Terminal SSH
                    </button>
                  </>
                )}
              </div>
            </div>

            {showSshConfig && isTauri && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, background: 'rgba(99,102,241,0.06)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.2)' }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>📁 Chemin absolu vers la clé SSH privée</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input ref={sshKeyInputRef} type="text" defaultValue={sshKeyPath}
                    placeholder="D:/Projet GitHub/.../ssh-key.key"
                    style={{ ...inp, flex: 1, fontFamily: 'monospace', fontSize: 12 }} />
                  <button style={btn('default')} onClick={browseForSshKey}>📂 Parcourir</button>
                  <button style={btn('success')} onClick={() => { setSshKeyPath(sshKeyInputRef.current?.value?.trim() || ''); setShowSshConfig(false); }}>💾 Sauvegarder</button>
                </div>
                {sshKeyPath && <span style={{ fontSize: 11, color: '#10b981' }}>✅ Chemin : {sshKeyPath}</span>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {isTauri && (
                <button style={btn('success', loading['op_start'])} disabled={loading['op_start']}
                  onClick={async () => {
                    const ok = await confirm({ title: '▶️ Démarrer', message: 'Connexion SSH → sudo systemctl start discord-bots', confirmText: '▶️ Démarrer', type: 'warning' });
                    if (!ok) return;
                    await startServiceViaSsh();
                  }}>▶️ Démarrer</button>
              )}
              <button style={btn('warning', loading['op_restart'])} disabled={loading['op_restart']}
                onClick={async () => {
                  const ok = await confirm({ title: '🔄 Redémarrer', message: 'Le service va être redémarré (~15s d\'interruption).', confirmText: 'Redémarrer', type: 'warning' });
                  if (!ok) return;
                  await callAction('operations', 'service_restart', {}, 'systemctl restart discord-bots', 'op_restart');
                }}>🔄 Redémarrer</button>
              <button style={btn('danger', loading['op_stop'])} disabled={loading['op_stop']}
                onClick={async () => {
                  const ok = await confirm({ title: '⛔ Arrêter', message: '⚠️ L\'API sera inaccessible.', confirmText: '⛔ Arrêter', type: 'danger' });
                  if (!ok) return;
                  const ok2 = await confirm({ title: '⛔ CONFIRMATION', message: 'Confirmer l\'arrêt complet ?', confirmText: '⛔ OUI', type: 'danger' });
                  if (!ok2) return;
                  await callAction('operations', 'service_stop', {}, 'systemctl stop discord-bots', 'op_stop');
                }}>⛔ Arrêter</button>
            </div>
          </section>

          {/* Pare-feu */}
          <section style={{ ...sec, border: '1px solid rgba(245,158,11,0.2)' }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>🔥 Pare-feu iptables</h4>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
              Le reset efface toutes les règles DROP et restaure les règles ACCEPT de base, puis recharge Fail2ban.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button style={btn('default', loading['op_fw_status'])} disabled={loading['op_fw_status']}
                onClick={() => callAction('operations', 'firewall_status', {}, 'iptables -L INPUT -n -v', 'op_fw_status')}>
                📋 Voir les règles
              </button>
              <button style={btn('danger', loading['op_fw_reset'])} disabled={loading['op_fw_reset']}
                onClick={async () => {
                  const ok = await confirm({ title: '💥 Reset pare-feu', message: '⚠️ Toutes les IPs bloquées manuellement seront débloquées.', confirmText: '💥 Réinitialiser', type: 'danger' });
                  if (!ok) return;
                  const ok2 = await confirm({ title: '💥 CONFIRMATION', message: 'Confirmer le reset complet d\'iptables ?', confirmText: '💥 CONFIRMER', type: 'danger' });
                  if (!ok2) return;
                  await callAction('operations', 'firewall_reset', {}, 'iptables RESET + règles base + fail2ban reload', 'op_fw_reset');
                }}>
                💥 Reset pare-feu
              </button>
            </div>
          </section>

          {/* Purge logs */}
          <section style={{ ...sec, border: '1px solid rgba(239,68,68,0.15)' }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>🗑️ Purge des logs</h4>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>Cibles</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['bot', 'journal', 'both'] as const).map(m => (
                    <button key={m} onClick={() => setPurgeMode(m)} style={{
                      padding: '5px 12px', borderRadius: 6, fontSize: 12,
                      border: `1px solid ${purgeMode === m ? 'var(--accent)' : 'var(--border)'}`,
                      background: purgeMode === m ? 'rgba(99,102,241,0.15)' : 'transparent',
                      color: purgeMode === m ? 'var(--accent)' : 'var(--muted)',
                      cursor: 'pointer',
                    }}>
                      {m === 'bot' ? '📄 bot.log' : m === 'journal' ? '📋 journalctl' : '🗑️ Tout'}
                    </button>
                  ))}
                </div>
              </div>
              {purgeMode !== 'bot' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>Vacuum journalctl</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['1d', '7d', '30d', 'all'] as const).map(v => (
                      <button key={v} onClick={() => setVacuumTime(v)} style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: 12,
                        border: `1px solid ${vacuumTime === v ? '#f59e0b' : 'var(--border)'}`,
                        background: vacuumTime === v ? 'rgba(245,158,11,0.12)' : 'transparent',
                        color: vacuumTime === v ? '#f59e0b' : 'var(--muted)',
                        cursor: 'pointer',
                      }}>
                        {v === 'all' ? '🔥 Tout' : v === '1d' ? '24h' : v === '7d' ? '7 jours' : '30 jours'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              style={btn('danger', loading['op_purge'])} disabled={loading['op_purge']}
              onClick={async () => {
                const desc = purgeMode === 'bot' ? 'Vider bot.log'
                  : purgeMode === 'journal' ? `Vacuum journalctl (${vacuumTime})`
                    : `Vider bot.log + Vacuum journalctl (${vacuumTime})`;
                const ok = await confirm({ title: '🗑️ Purge logs', message: `Action : ${desc}\n\n⚠️ Cette action est irréversible.`, confirmText: '🗑️ Purger', type: 'danger' });
                if (!ok) return;
                await callAction('operations', 'logs_purge', { mode: purgeMode, vacuum_time: vacuumTime }, desc, 'op_purge');
              }}>
              🗑️ Exécuter la purge
            </button>
          </section>

          <OutputPanel tab="operations" />
        </>}

        {/* ══ ANALYSE IPs ═════════════════════════════════════════════════════ */}
        {activeTab === 'ip_analysis' && <>
          <section style={sec}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.9rem' }}>🔍 Analyse des IPs (logs [REQUEST])</h4>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                  Parse les 500 dernières lignes de logs, catégorise les IPs via ipinfo.io et résout les UUIDs.
                </p>
              </div>
              <button style={btn('default', ipLoading)} disabled={ipLoading} onClick={runIpAnalysis}>
                {ipLoading ? '⏳ Analyse…' : '🔍 Analyser'}
              </button>
            </div>

            {ipError && <div style={{ color: '#ef4444', fontSize: 13 }}>❌ {ipError}</div>}

            {ipRows.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                {/* Légende */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                  {(['MOI', 'MEMBRE', 'PROXY', 'PUBLIC', 'ERREUR'] as const).map(c => (
                    <span key={c} style={{ fontSize: 11, color: catColor(c), display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: catColor(c), display: 'inline-block' }} />
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
                      <tr key={row.ip} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 700 }}>{row.total}</td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{row.ip}</td>
                        <td style={{ padding: '6px 8px', color: row.suspicious > 0 ? '#ef4444' : '#4ade80' }}>
                          {row.suspicious}/{row.total}
                        </td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.topRoute}</td>
                        <td style={{ padding: '6px 8px', color: catColor(row.category), fontWeight: 600 }}>[{row.category}]</td>
                        <td style={{ padding: '6px 8px', color: row.identity.startsWith('@') ? '#4ade80' : 'var(--muted)' }}>{row.identity || '—'}</td>
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

            {!ipLoading && !ipError && !ipRows.length && (
              <div style={{ color: 'var(--muted)', fontSize: 13, padding: 10 }}>
                Cliquez sur "Analyser" pour lancer l'analyse des IPs depuis les logs.
              </div>
            )}
          </section>
        </>}

      </div>

      {/* Footer */}
      <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
        {!inlineMode && (
          <button onClick={onClose} style={{ padding: '9px 24px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>↩️ Fermer</button>
        )}
      </div>
    </div>
  );

  const content = inlineMode ? panel : (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--modal-backdrop)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'var(--modal-backdrop-blur)' }}>
      {panel}
    </div>
  );

  const withConfirm = (
    <>
      {content}
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
    </>
  );

  return inlineMode ? withConfirm : createPortal(withConfirm, document.body);
}
