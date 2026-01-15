import React from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

interface ErrorDetails {
  code?: string | number;
  message: string;
  context?: string;
  timestamp?: number;
  httpStatus?: number;
  discordError?: any;
}

interface ErrorModalProps {
  error: ErrorDetails;
  onClose: () => void;
  onRetry?: () => void;
}

export default function ErrorModal({ error, onClose, onRetry }: ErrorModalProps) {
  useEscapeKey(onClose, true);
  useModalScrollLock();

  const getSuggestions = (): string[] => {
    const suggestions: string[] = [];
    const status = error.httpStatus;
    const code = error.code;

    // Suggestions basées sur le code HTTP
    if (status === 401 || status === 403) {
      suggestions.push('Vérifiez que votre token Discord est valide dans le fichier .env');
      suggestions.push('Assurez-vous que le bot a les permissions nécessaires sur le serveur');
    } else if (status === 404) {
      suggestions.push('Vérifiez que les IDs de forum sont corrects dans la configuration');
      suggestions.push('Assurez-vous que les canaux existent toujours sur le serveur');
    } else if (status === 429) {
      suggestions.push('Vous avez atteint la limite de taux Discord');
      suggestions.push('Attendez quelques minutes avant de réessayer');
      suggestions.push('Consultez le badge de statut API pour voir le temps restant');
    } else if (status && status >= 500) {
      suggestions.push('Discord rencontre des problèmes temporaires');
      suggestions.push('Réessayez dans quelques instants');
      suggestions.push('Consultez status.discord.com pour plus d\'informations');    } else if (!status || status === 0 || error.message.includes('fetch') || error.message.includes('network')) {
      // API locale non accessible
      suggestions.push('L\'API Publisher locale n\'a pas démarré correctement');
      suggestions.push('Fermez complètement l\'application et relancez-la');
      suggestions.push('Vérifiez que le port 8080 n\'est pas utilisé par une autre application');
      suggestions.push('Consultez la console (Ctrl+Shift+I) pour voir les logs de démarrage');    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      suggestions.push('Vérifiez votre connexion internet');
      suggestions.push('Vérifiez que l\'API Publisher est bien démarrée');
      suggestions.push('Vérifiez l\'URL de l\'API dans la configuration');
    } else if (error.message.includes('missing_title')) {
      suggestions.push('Le titre du post est obligatoire');
    } else if (error.message.includes('missing_api_url')) {
      suggestions.push('Configurez l\'URL de l\'API dans Configuration API');
    }

    // Suggestions génériques si aucune spécifique
    if (suggestions.length === 0) {
      suggestions.push('Vérifiez la configuration de l\'API');
      suggestions.push('Consultez le fichier errors.log pour plus de détails');
      suggestions.push('Réessayez dans quelques instants');
    }

    return suggestions;
  };

  const getErrorTitle = (): string => {
    const status = error.httpStatus;
    if (status === 401 || status === 403) return '🔒 Erreur d\'authentification';
    if (status === 404) return '🔍 Ressource introuvable';
    if (status === 429) return '⏱️ Limite de taux atteinte';
    if (status && status >= 500) return '🔥 Erreur serveur Discord';
    if (!status || status === 0) return '📡 API locale non accessible';
    if (error.message.includes('network') || error.message.includes('fetch')) return '📡 Erreur de connexion';
    return '⚠️ Erreur de publication';
  };

  const formatTimestamp = (): string => {
    if (!error.timestamp) return '';
    const date = new Date(error.timestamp);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const copyErrorDetails = () => {
    const details = `
Erreur Discord Publisher
========================
Heure: ${formatTimestamp()}
Code HTTP: ${error.httpStatus || 'N/A'}
Code erreur: ${error.code || 'N/A'}
Message: ${error.message}
Contexte: ${error.context || 'N/A'}

Détails Discord:
${error.discordError ? JSON.stringify(error.discordError, null, 2) : 'N/A'}
    `.trim();

    navigator.clipboard.writeText(details);
  };

  const suggestions = getSuggestions();

  return (
    <div className="modal" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1000, width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ margin: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          {getErrorTitle()}
        </h3>

        <div style={{ overflowY: 'auto', flex: 1 }}>
        {/* Error details */}
        <div style={{ 
          background: 'rgba(239, 68, 68, 0.1)', 
          border: '1px solid #ef4444',
          borderRadius: 8,
          padding: 12,
          marginBottom: 16
        }}>
          <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
            {error.timestamp && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>Heure:</span>
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{formatTimestamp()}</span>
              </div>
            )}

            {error.httpStatus && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>Code HTTP:</span>
                <span style={{ 
                  fontFamily: 'monospace', 
                  fontWeight: 600,
                  color: error.httpStatus >= 500 ? '#ef4444' : error.httpStatus >= 400 ? '#f59e0b' : 'inherit'
                }}>
                  {error.httpStatus}
                </span>
              </div>
            )}

            {error.code && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>Code erreur:</span>
                <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{error.code}</span>
              </div>
            )}

            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(239, 68, 68, 0.3)' }}>
              <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 4 }}>Message:</div>
              <div style={{ 
                fontSize: 14, 
                fontWeight: 500,
                wordBreak: 'break-word'
              }}>
                {error.message}
              </div>
            </div>

            {error.context && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(239, 68, 68, 0.3)' }}>
                <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 4 }}>Contexte:</div>
                <div style={{ fontSize: 13, fontStyle: 'italic' }}>{error.context}</div>
              </div>
            )}
          </div>
        </div>

        {/* Suggestions */}
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ margin: 0, marginBottom: 8, fontSize: 14, color: 'var(--accent)' }}>
            💡 Suggestions
          </h4>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.6 }}>
            {suggestions.map((suggestion, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>{suggestion}</li>
            ))}
          </ul>
        </div>

        {/* Discord error details (if available) */}
        {error.discordError && (
          <details style={{ 
            marginBottom: 16,
            fontSize: 13,
            background: 'var(--bg-secondary)',
            padding: 12,
            borderRadius: 6
          }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: 8 }}>
              🔍 Détails techniques Discord
            </summary>
            <pre style={{ 
              margin: 0,
              padding: 8,
              background: 'var(--bg-main)',
              borderRadius: 4,
              fontSize: 11,
              overflow: 'auto',
              maxHeight: 200
            }}>
              {JSON.stringify(error.discordError, null, 2)}
            </pre>
          </details>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {onRetry && (
            <button
              onClick={() => {
                onClose();
                onRetry();
              }}
              style={{
                flex: 1,
                minWidth: 120,
                background: 'var(--accent)',
                padding: '10px 16px'
              }}
            >
              🔄 Réessayer
            </button>
          )}
          
          <button
            onClick={copyErrorDetails}
            style={{
              flex: 1,
              minWidth: 120,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              padding: '10px 16px'
            }}
          >
            📋 Copier les détails
          </button>

          <button
            onClick={onClose}
            style={{
              flex: 1,
              minWidth: 120,
              background: 'transparent',
              border: '1px solid var(--border)',
              padding: '10px 16px'
            }}
          >
            🚪 Fermer
          </button>
        </div>

        {/* Help link */}
        <div style={{ 
          marginTop: 16, 
          paddingTop: 16, 
          borderTop: '1px solid var(--border)',
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--muted)'
        }}>
          Besoin d'aide ? Consultez le fichier <code style={{ 
            background: 'var(--bg-secondary)', 
            padding: '2px 6px', 
            borderRadius: 3,
            fontFamily: 'monospace'
          }}>errors.log</code> pour plus de détails
        </div>
        </div>
      </div>
    </div>
  );
}
