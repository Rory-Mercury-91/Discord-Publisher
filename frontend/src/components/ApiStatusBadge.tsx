import React, { useEffect, useState } from 'react';
import { useApp } from '../state/appContext';
import { useAuth } from '../state/authContext';

const DEFAULT_API_BASE = 'http://138.2.182.125:8080';
type Status = 'connected' | 'disconnected' | 'checking';

interface ApiStatusBadgeProps {
  onOpenLogs?: () => void;
  onOpenServer?: () => void;
}

export default function ApiStatusBadge({ onOpenLogs, onOpenServer }: ApiStatusBadgeProps) {
  const { apiUrl } = useApp();
  const { profile } = useAuth();
  const isMasterAdmin = profile?.is_master_admin === true;

  const [status, setStatus] = useState<Status>('checking');
  const [showDetails, setShowDetails] = useState(false);
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const getBaseUrl = (url?: string) => {
    const toParse = (url || '').trim() || `${DEFAULT_API_BASE}/api/forum-post`;
    try { return new URL(toParse).origin; }
    catch { return toParse.split('/api')[0]?.replace(/\/+$/, '') || DEFAULT_API_BASE; }
  };

  const checkStatus = async () => {
    const url = `${getBaseUrl(apiUrl)}/api/publisher/health`;
    setStatus('checking'); setLastCheck(Date.now());
    try {
      const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const d = await res.json();
        setStatus(d && (d.configured || d.ok || d.status === 'ok') ? 'connected' : 'disconnected');
      } else { setStatus('disconnected'); }
    } catch { setStatus('disconnected'); }
  };

  useEffect(() => {
    checkStatus();
    const iv = setInterval(checkStatus, 900000);
    return () => clearInterval(iv);
  }, [apiUrl]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDetails(false);
    };
    if (showDetails) document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [showDetails]);

  const color = status === 'connected' ? '#4ade80' : status === 'disconnected' ? '#ef4444' : '#fbbf24';
  const label = status === 'connected' ? 'Publisher connecté' : status === 'checking' ? 'Vérification…' : 'Publisher déconnecté';
  const statusText = status === 'connected' ? 'Connecté' : status === 'disconnected' ? 'Déconnecté' : 'Vérification…';

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <div onClick={() => setShowDetails(!showDetails)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
        borderRadius: 4, background: 'var(--bg-secondary)', border: `1px solid ${color}`,
        cursor: 'pointer', fontSize: 12, userSelect: 'none',
      }} title="Cliquer pour voir les détails">
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', animation: status === 'checking' ? 'pulse 2s infinite' : 'none' }} />
        <span style={{ fontWeight: 500 }}>{label}</span>
      </div>

      {showDetails && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8, padding: 12,
          background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)', minWidth: 260, zIndex: 1000,
          fontSize: 13, backdropFilter: 'blur(10px)',
        }} onClick={e => e.stopPropagation()}>
          <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 14 }}>Statut du publisher</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 500 }}>Publisher</span>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
            <span style={{ fontWeight: 500, color }}>{statusText}</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
            Dernier test : {lastCheck ? new Date(lastCheck).toLocaleString('fr-FR') : 'Jamais'}
          </div>

          {/* Bouton conditionnel selon is_master_admin */}
          {isMasterAdmin ? (
            <button onClick={() => { onOpenServer?.(); onOpenLogs?.(); setShowDetails(false); }} style={{
              marginTop: 12, width: '100%', padding: '7px 12px', fontSize: 12,
              background: 'var(--accent)', border: 'none', borderRadius: 6,
              color: '#fff', cursor: 'pointer', fontWeight: 600,
            }}>🖥️ Gestion Serveur</button>
          ) : (
            onOpenLogs && (
              <button onClick={() => { onOpenLogs(); setShowDetails(false); }} style={{
                marginTop: 12, width: '100%', padding: '7px 12px', fontSize: 12,
                background: 'var(--accent)', border: 'none', borderRadius: 6,
                color: '#fff', cursor: 'pointer', fontWeight: 500,
              }}>📋 Voir les logs</button>
            )
          )}

          <button onClick={checkStatus} style={{ marginTop: 8, width: '100%', padding: '6px 12px', fontSize: 12 }}>
            🔄 Actualiser
          </button>
          <button onClick={() => setShowDetails(false)} style={{
            marginTop: 6, width: '100%', padding: '6px 12px', fontSize: 12,
            background: 'transparent', border: '1px solid var(--border)',
          }}>↩️ Fermer</button>
        </div>
      )}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  );
}
