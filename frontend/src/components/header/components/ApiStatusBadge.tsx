import React, { useEffect, useState } from 'react';
import { useApp } from '../../../state/appContext';
import { useAuth } from '../../../state/authContext';
import { getBaseUrl } from '../constants';

export type ApiStatus = 'connected' | 'disconnected' | 'checking';

interface ApiStatusBadgeProps {
  onOpenLogs?: () => void;
  onOpenServer?: () => void;
}

export default function ApiStatusBadge({ onOpenLogs, onOpenServer }: ApiStatusBadgeProps) {
  const { apiUrl } = useApp();
  const { profile } = useAuth();
  const isMasterAdmin = profile?.is_master_admin === true;

  const [status, setStatus] = useState<ApiStatus>('checking');
  const [showDetails, setShowDetails] = useState(false);
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const checkStatus = async () => {
    const url = `${getBaseUrl(apiUrl)}/api/publisher/health`;
    setStatus('checking');
    setLastCheck(Date.now());
    try {
      const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
      if (res.ok) {
        const d = await res.json();
        setStatus(
          d && (d.configured || d.ok || d.status === 'ok') ? 'connected' : 'disconnected'
        );
      } else {
        setStatus('disconnected');
      }
    } catch {
      setStatus('disconnected');
    }
  };

  useEffect(() => {
    checkStatus();
    const iv = setInterval(checkStatus, 900000);
    return () => clearInterval(iv);
  }, [apiUrl]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDetails(false);
      }
    };
    if (showDetails) document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [showDetails]);

  const label =
    status === 'connected'
      ? 'Publisher connecté'
      : status === 'checking'
        ? 'Vérification…'
        : 'Publisher déconnecté';
  const statusText =
    status === 'connected' ? 'Connecté' : status === 'disconnected' ? 'Déconnecté' : 'Vérification…';

  return (
    <div ref={dropdownRef} className="api-status-wrap">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setShowDetails(!showDetails)}
        onKeyDown={e => e.key === 'Enter' && setShowDetails(!showDetails)}
        className={`api-status-badge api-status-badge--${status}`}
        title="Cliquer pour voir les détails"
      >
        <span className={`api-status-badge__dot api-status-badge__dot--${status}`} />
        <span className="api-status-badge__label">{label}</span>
      </div>

      {showDetails && (
        <div
          className="api-status-dropdown"
          onClick={e => e.stopPropagation()}
        >
          <div className="api-status-dropdown__title">Statut du publisher</div>
          <div className="api-status-dropdown__row">
            <span className="api-status-dropdown__status-text">Publisher</span>
            <span className={`api-status-badge__dot api-status-badge__dot--${status}`} />
            <span className={`api-status-dropdown__status-text api-status-dropdown__status-text--${status}`}>
              {statusText}
            </span>
          </div>
          <div className="api-status-dropdown__last-check">
            Dernier test : {lastCheck ? new Date(lastCheck).toLocaleString('fr-FR') : 'Jamais'}
          </div>

          {isMasterAdmin ? (
            <button
              type="button"
              className="api-status-dropdown__btn-primary"
              onClick={() => {
                onOpenServer?.();
                onOpenLogs?.();
                setShowDetails(false);
              }}
            >
              🖥️ Gestion Serveur
            </button>
          ) : (
            onOpenLogs && (
              <button
                type="button"
                className="api-status-dropdown__btn-primary"
                onClick={() => {
                  onOpenLogs();
                  setShowDetails(false);
                }}
              >
                📋 Voir les logs
              </button>
            )
          )}

          <button type="button" className="form-btn form-btn--ghost api-status-dropdown__btn-refresh" onClick={checkStatus}>
            🔄 Actualiser
          </button>
          <button type="button" onClick={() => setShowDetails(false)} className="form-btn form-btn--ghost">
            ↩️ Fermer
          </button>
        </div>
      )}
    </div>
  );
}
