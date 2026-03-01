import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConfirm } from '../../hooks/useConfirm';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';
import { apiFetch } from '../../lib/api-helpers';
import { getSupabase } from '../../lib/supabase';
import { useApp } from '../../state/appContext';
import { useAuth } from '../../state/authContext';
import ConfirmModal from '../Modals/ConfirmModal';
import IpAnalysisTab from './components/IpAnalysisTab';
import OperationsTab from './components/OperationsTab';
import SecurityTab from './components/SecurityTab';
import StatusTab from './components/StatusTab';
import { ALLOWED_METHODS, ALLOWED_ROUTES, getBase } from './constants';
import type { ActionResult, IpRow, ServerTab } from './types';

interface ServerModalProps {
  onClose: () => void;
  /** Si true : pas de portal/backdrop propre — pour usage dans DualLayout */
  inlineMode?: boolean;
}

export default function ServerModal({ onClose, inlineMode = false }: ServerModalProps) {
  const { apiUrl } = useApp();
  const { profile } = useAuth();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  const [activeTab, setActiveTab] = useState<ServerTab>('status');

  // ── SSH Key ────────────────────────────────────────────────────────────────
  const [sshKeyPath, setSshKeyPath] = useState(() => localStorage.getItem('ssh_key_path') || '');
  const [showSshConfig, setShowSshConfig] = useState(false);
  const sshKeyInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { localStorage.setItem('ssh_key_path', sshKeyPath); }, [sshKeyPath]);

  const isTauri = !!window.__TAURI__;

  // ── Results & loading ──────────────────────────────────────────────────────
  const [results, setResults] = useState<Record<ServerTab, ActionResult | null>>({
    status: null,
    security: null,
    operations: null,
    ip_analysis: null,
  });
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  // ── IP Analysis state ──────────────────────────────────────────────────────
  const [ipRows, setIpRows] = useState<IpRow[]>([]);
  const [ipLoading, setIpLoading] = useState(false);
  const [ipError, setIpError] = useState<string | null>(null);
  const [myIp, setMyIp] = useState('');

  useEscapeKey(onClose, true);
  useModalScrollLock();

  if (profile?.is_master_admin !== true) return null;

  const base = getBase(apiUrl);
  const apiKey = localStorage.getItem('apiKey') || '';

  // ── Generic action call ────────────────────────────────────────────────────
  const callAction = useCallback(
    async (
      tab: ServerTab,
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
          [tab]: {
            ts: Date.now(),
            action: label || action,
            output: data.output || data.error || '(vide)',
            ok: !!data.ok,
          },
        }));
      } catch (e: unknown) {
        const err = e as { message?: string };
        const isReset =
          err?.message?.includes('Failed to fetch') || err?.message?.includes('NetworkError');
        const isStop = ['service_restart', 'service_stop'].includes(action);
        const output =
          isReset && isStop
            ? '✅ Commande envoyée — connexion coupée (comportement normal).\n\nLe serveur sera de retour dans ~15s pour un restart.'
            : `❌ ${err?.message ?? String(e)}`;
        setResults(p => ({
          ...p,
          [tab]: { ts: Date.now(), action: label || action, output, ok: isReset && isStop },
        }));
      } finally {
        setLoading(p => ({ ...p, [lk]: false }));
      }
    },
    [base, apiKey],
  );

  // ── SSH Terminal (Tauri) ───────────────────────────────────────────────────
  const openSshTerminal = useCallback(async () => {
    if (!isTauri) return;
    if (!sshKeyPath.trim()) {
      setShowSshConfig(true);
      return;
    }
    try {
      const Command = (window as unknown as { __TAURI__?: { shell?: { Command: { create: (cmd: string, args: string[]) => { spawn: () => Promise<void> } } } } }).__TAURI__?.shell?.Command;
      if (!Command) throw new Error('Tauri Shell API non disponible');
      const normalizedKey = sshKeyPath.trim().replace(/\\/g, '/');
      const sshCommand = `ssh -i "${normalizedKey}" ubuntu@138.2.182.125 -p 4242`;
      const cmd = Command.create('cmd', [
        '/c',
        'start',
        'powershell',
        '-NoExit',
        '-Command',
        sshCommand,
      ]);
      await cmd.spawn();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setResults(p => ({
        ...p,
        operations: {
          ts: Date.now(),
          action: 'SSH Terminal',
          output: `❌ ${err?.message ?? String(e)}`,
          ok: false,
        },
      }));
    }
  }, [isTauri, sshKeyPath]);

  const startServiceViaSsh = useCallback(async () => {
    if (!isTauri) {
      setResults(p => ({
        ...p,
        operations: {
          ts: Date.now(),
          action: 'systemctl start',
          output: '❌ Uniquement disponible en mode desktop (Tauri).',
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
      const Command = (window as unknown as { __TAURI__?: { shell?: { Command: { create: (cmd: string, args: string[]) => { execute: () => Promise<{ code: number; stdout: string; stderr: string }> } } } } }).__TAURI__?.shell?.Command;
      if (!Command) throw new Error('Tauri Shell API non disponible');
      const normalizedKey = sshKeyPath.trim().replace(/\\/g, '/');
      const cmd = Command.create('ssh', [
        '-i',
        normalizedKey,
        '-p',
        '4242',
        '-o',
        'StrictHostKeyChecking=no',
        '-o',
        'ConnectTimeout=10',
        'ubuntu@138.2.182.125',
        'sudo systemctl start discord-bots && sudo systemctl status discord-bots --no-pager -l',
      ]);
      const out = await cmd.execute();
      const text = (out.stdout + out.stderr).trim();
      setResults(p => ({
        ...p,
        operations: {
          ts: Date.now(),
          action: 'ssh → systemctl start',
          output: text || '✅ Commande envoyée',
          ok: out.code === 0,
        },
      }));
    } catch (e: unknown) {
      const err = e as { message?: string };
      setResults(p => ({
        ...p,
        operations: {
          ts: Date.now(),
          action: 'ssh → systemctl start',
          output: `❌ Erreur SSH : ${err?.message ?? String(e)}`,
          ok: false,
        },
      }));
    } finally {
      setLoading(p => ({ ...p, op_start: false }));
    }
  }, [isTauri, sshKeyPath]);

  const browseForSshKey = useCallback(async () => {
    try {
      const win = window as unknown as {
        __TAURI__?: { dialog?: { open: (opts: unknown) => Promise<string | string[] | null> } };
        __TAURI_PLUGIN_DIALOG__?: { open: (opts: unknown) => Promise<string | string[] | null> };
      };
      const dialogOpen = win.__TAURI__?.dialog?.open ?? win.__TAURI_PLUGIN_DIALOG__?.open;
      if (!dialogOpen) {
        alert('API Dialog Tauri non disponible. Saisissez le chemin manuellement.');
        return;
      }
      const selected = await dialogOpen({
        title: 'Clé SSH privée',
        filters: [
          { name: 'Clé SSH', extensions: ['key', 'pem', 'ppk'] },
          { name: 'Tous', extensions: ['*'] },
        ],
        multiple: false,
        directory: false,
      });
      if (selected && typeof selected === 'string') {
        setSshKeyPath(selected);
        if (sshKeyInputRef.current) sshKeyInputRef.current.value = selected;
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      console.warn('browseForSshKey:', err?.message ?? e);
    }
  }, []);

  // ── IP Analysis ────────────────────────────────────────────────────────────
  const runIpAnalysis = useCallback(async () => {
    setIpLoading(true);
    setIpError(null);
    setIpRows([]);
    try {
      let selfIp = myIp;
      if (!selfIp) {
        try {
          const r = await fetch('https://ipinfo.io/json');
          const d = await r.json();
          selfIp = d.ip || '';
          setMyIp(selfIp);
        } catch {
          selfIp = '';
        }
      }

      const res = await apiFetch(`${base}/api/logs`, apiKey);
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      const rawLogs: string = data.logs || '';

      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const requestRe =
        /\[REQUEST\]\s+(\d{1,3}(?:\.\d{1,3}){3})\s+\|\s+([^|]+)\s+\|\s+(?:[^|]+\s+\|\s+)?(.+?)\s*$/;

      const parsed: {
        ip: string;
        identity: string;
        method: string;
        path: string;
        suspicious: boolean;
      }[] = [];
      const uuids: string[] = [];

      for (const line of rawLogs.split('\n')) {
        const m = line.match(requestRe);
        if (!m) continue;
        const ip = m[1].trim();
        if (ip === '127.0.0.1') continue;
        const ident = m[2].trim() === 'NULL' ? '' : m[2].trim();
        if (ident && uuidRe.test(ident) && !uuids.includes(ident.toLowerCase())) {
          uuids.push(ident.toLowerCase());
        }
        const rest = m[3].trim();
        let method = rest,
          path = '-';
        const mp = rest.match(/^([A-Z]+)\s+(.+)$/);
        if (mp) {
          method = mp[1];
          path = mp[2];
        }
        const methodOk = ALLOWED_METHODS.includes(method);
        const routeOk = method === 'OPTIONS' || ALLOWED_ROUTES.includes(path);
        parsed.push({ ip, identity: ident, method, path, suspicious: !(methodOk && routeOk) });
      }

      if (!parsed.length) {
        setIpError('Aucune ligne [REQUEST] parsée.');
        setIpLoading(false);
        return;
      }

      const uuidMap: Record<string, string> = {};
      if (uuids.length) {
        try {
          const sb = getSupabase();
          if (sb) {
            const { data: profiles } = await sb.from('profiles').select('id,pseudo').in('id', uuids);
            (profiles ?? []).forEach((p: { id: string; pseudo?: string }) => {
              uuidMap[p.id.toLowerCase()] = p.pseudo || 'Utilisateur';
            });
          }
        } catch {
          /* non bloquant */
        }
      }

      const resolveIdent = (ident: string) => {
        if (!ident) return '';
        if (uuidRe.test(ident)) {
          const pseudo = uuidMap[ident.toLowerCase()];
          return pseudo ? `@${pseudo}` : ident.slice(0, 8) + '…';
        }
        return ident;
      };

      const byIp: Record<string, typeof parsed> = {};
      for (const r of parsed) {
        if (!byIp[r.ip]) byIp[r.ip] = [];
        byIp[r.ip].push(r);
      }

      const rows: IpRow[] = [];
      for (const [ip, reqs] of Object.entries(byIp)) {
        const total = reqs.length;
        const suspicious = reqs.filter(r => r.suspicious).length;
        const ident = resolveIdent(reqs.find(r => r.identity)?.identity || '');
        const topRoute = (() => {
          const cnt: Record<string, number> = {};
          reqs.forEach(r => {
            const k = `${r.method} ${r.path}`;
            cnt[k] = (cnt[k] || 0) + 1;
          });
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
          else if (/Proton|M247|Datacamp|VPN|Proxy|Servers|Cloudflare/i.test(org))
            category = 'PROXY';
          else category = 'PUBLIC';
        } catch {
          category = 'ERREUR';
        }
        rows.push({ ip, total, suspicious, org, category, identity: ident, topRoute });
      }

      setIpRows(rows.sort((a, b) => b.total - a.total));
    } catch (e: unknown) {
      const err = e as { message?: string };
      setIpError(err?.message ?? String(e));
    } finally {
      setIpLoading(false);
    }
  }, [base, apiKey, myIp]);

  const exportResult = useCallback((r: ActionResult, fmt: 'json' | 'txt') => {
    const ts = new Date(r.ts).toISOString();
    let content: string, mime: string, ext: string;
    if (fmt === 'json') {
      content = JSON.stringify(
        { timestamp: ts, action: r.action, ok: r.ok, output: r.output },
        null,
        2,
      );
      mime = 'application/json';
      ext = 'json';
    } else {
      content = `[${ts}] ${r.action}\n${'─'.repeat(60)}\n${r.output}`;
      mime = 'text/plain';
      ext = 'txt';
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = `server_result_${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  const isLoadingAny = Object.entries(loading).some(([, v]) => v);

  const callStatus = useCallback(
    (action: string, params: Record<string, unknown> = {}, label?: string, loadingKey?: string) =>
      callAction('status', action, params, label, loadingKey),
    [callAction],
  );
  const callSecurity = useCallback(
    (action: string, params: Record<string, unknown> = {}, label?: string, loadingKey?: string) =>
      callAction('security', action, params, label, loadingKey),
    [callAction],
  );
  const callOperations = useCallback(
    (action: string, params: Record<string, unknown> = {}, label?: string, loadingKey?: string) =>
      callAction('operations', action, params, label, loadingKey),
    [callAction],
  );

  const tabs: { id: ServerTab; label: string; icon: string }[] = [
    { id: 'status', label: 'Statut', icon: '📊' },
    { id: 'security', label: 'Sécurité', icon: '🛡️' },
    { id: 'operations', label: 'Opérations', icon: '⚙️' },
    { id: 'ip_analysis', label: 'Analyse IPs', icon: '🔍' },
  ];

  const panel = (
    <div
      className="server-panel"
      style={{
        width: inlineMode ? 860 : '92%',
        maxWidth: inlineMode ? 860 : 900,
        height: inlineMode ? '88vh' : undefined,
        maxHeight: inlineMode ? '88vh' : '90vh',
      }}
      onClick={e => e.stopPropagation()}
    >
      <div className="server-panel__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🖥️</span>
          <div>
            <h2 className="server-panel__title" style={{ margin: 0 }}>
              Gestion du serveur
            </h2>
            <span className="server-panel__subtitle">
              Oracle Cloud — 138.2.182.125 • Accès master admin
            </span>
          </div>
        </div>
      </div>

      <div className="server-panel__tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={
              activeTab === t.id ? 'server-panel__tab server-panel__tab--active' : 'server-panel__tab'
            }
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="styled-scrollbar server-panel__body">
        {activeTab === 'status' && (
          <StatusTab
            result={results.status}
            isLoading={isLoadingAny}
            loading={loading}
            onCallAction={callStatus}
            onExportTxt={() => results.status && exportResult(results.status, 'txt')}
            onExportJson={() => results.status && exportResult(results.status, 'json')}
          />
        )}
        {activeTab === 'security' && (
          <SecurityTab
            result={results.security}
            isLoading={isLoadingAny}
            loading={loading}
            onCallAction={callSecurity}
            onExportTxt={() => results.security && exportResult(results.security, 'txt')}
            onExportJson={() => results.security && exportResult(results.security, 'json')}
            onConfirm={confirm}
          />
        )}
        {activeTab === 'operations' && (
          <OperationsTab
            result={results.operations}
            isLoading={isLoadingAny}
            loading={loading}
            onCallAction={callOperations}
            onExportTxt={() => results.operations && exportResult(results.operations, 'txt')}
            onExportJson={() => results.operations && exportResult(results.operations, 'json')}
            onConfirm={confirm}
            isTauri={isTauri}
            sshKeyPath={sshKeyPath}
            setSshKeyPath={setSshKeyPath}
            showSshConfig={showSshConfig}
            setShowSshConfig={setShowSshConfig}
            sshKeyInputRef={sshKeyInputRef}
            onOpenSshTerminal={openSshTerminal}
            onBrowseSshKey={browseForSshKey}
            onStartViaSsh={startServiceViaSsh}
          />
        )}
        {activeTab === 'ip_analysis' && (
          <IpAnalysisTab
            ipRows={ipRows}
            ipLoading={ipLoading}
            ipError={ipError}
            onRunAnalysis={runIpAnalysis}
          />
        )}
      </div>

      <div className="server-panel__footer">
        {!inlineMode && (
          <button type="button" onClick={onClose} className="form-btn form-btn--ghost">
            ↩️ Fermer
          </button>
        )}
      </div>
    </div>
  );

  const content = inlineMode
    ? panel
    : (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--modal-backdrop)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            backdropFilter: 'var(--modal-backdrop-blur)',
          }}
        >
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
