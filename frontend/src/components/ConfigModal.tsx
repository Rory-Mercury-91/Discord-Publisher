import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { useApp } from '../state/appContext';
import { useToast } from './ToastProvider';

export default function ConfigModal({ onClose }: { onClose?: () => void }) {
  const { showToast } = useToast();
  const {
    templates,
    savedTags,
    savedInstructions,
    savedTraductors,
    allVarsConfig,
    publishedPosts
  } = useApp();

  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('apiUrl') || '');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('apiKey') || '');

  // Hooks pour fermer avec Echap et bloquer le scroll du fond
  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  const handleSave = () => {
    localStorage.setItem('apiUrl', apiUrl);
    localStorage.setItem('apiKey', apiKey);
    showToast("Configuration enregistrée !", "success");
  };

  const handleExportConfig = () => {
    try {
      const fullConfig = {
        // Configuration API
        apiUrl,
        apiKey,

        // Templates et variables
        templates,
        allVarsConfig,

        // Données sauvegardées
        savedTags,
        savedInstructions,
        savedTraductors,

        // Historique et statistiques
        publishedPosts,

        // Métadonnées d'export
        exportDate: new Date().toISOString(),
        version: '1.0'
      };

      const blob = new Blob([JSON.stringify(fullConfig, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_discord_generator_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      showToast("Sauvegarde complète téléchargée", "success");
    } catch (err: any) {
      console.error(err?.message || "Erreur export");
      showToast("Erreur lors de l'export", "error");
    }
  };

  const modalContent = (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        backdropFilter: 'blur(3px)'
      }}
    >
      <div
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--panel)',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '500px',
          border: '1px solid var(--border)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div className="modal-header" style={{
          padding: '16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>⚙️ Configuration</h2>
          <button
            className="close-button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text)',
              fontSize: '24px',
              cursor: 'pointer'
            }}
          >
            &times;
          </button>
        </div>

        <div className="modal-body" style={{ padding: '20px' }}>
          {/* Section API */}
          <div style={{ marginBottom: '25px' }}>
            <h3 style={{
              fontSize: '1rem',
              color: 'var(--accent)',
              marginBottom: '15px'
            }}>
              🌐 Configuration API
            </h3>

            <div style={{ marginBottom: '12px' }}>
              <label style={{
                display: 'block',
                marginBottom: '5px',
                fontSize: '0.9rem'
              }}>
                URL de l'API Koyeb
              </label>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://votre-app.koyeb.app"
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  borderRadius: '6px'
                }}
              />
              <div style={{
                fontSize: '11px',
                color: 'var(--muted)',
                marginTop: '4px'
              }}>
                💡 URL de base de votre service Koyeb (sans /api)
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{
                display: 'block',
                marginBottom: '5px',
                fontSize: '0.9rem'
              }}>
                Clé API
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Votre clé secrète"
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  borderRadius: '6px'
                }}
              />
              <div style={{
                fontSize: '11px',
                color: 'var(--muted)',
                marginTop: '4px'
              }}>
                🔒 Clé de sécurité pour l'accès à l'API
              </div>
            </div>

            <button
              className="btn-primary"
              onClick={handleSave}
              style={{
                width: '100%',
                padding: '10px',
                background: 'var(--accent)',
                border: 'none',
                color: 'white',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600
              }}
            >
              💾 Enregistrer la configuration
            </button>
          </div>

          {/* Section Sauvegarde */}
          <div style={{
            padding: '16px',
            background: 'rgba(74, 158, 255, 0.1)',
            border: '1px solid rgba(74, 158, 255, 0.3)',
            borderRadius: '8px'
          }}>
            <h4 style={{
              margin: '0 0 12px 0',
              fontSize: '0.95rem',
              color: 'var(--text)'
            }}>
              💾 Sauvegarde complète
            </h4>
            <p style={{
              fontSize: '13px',
              color: 'var(--muted)',
              margin: '0 0 12px 0',
              lineHeight: '1.5'
            }}>
              Exporter toutes les données de l'application dans un fichier JSON :
            </p>
            <ul style={{
              fontSize: '12px',
              color: 'var(--muted)',
              margin: '0 0 16px 0',
              paddingLeft: '20px',
              lineHeight: '1.6'
            }}>
              <li>Configuration API</li>
              <li>Templates (par défaut modifiés + personnalisés)</li>
              <li>Variables personnalisées</li>
              <li>Tags sauvegardés</li>
              <li>Traducteurs sauvegardés</li>
              <li>Instructions sauvegardées</li>
              <li>Historique complet des publications</li>
            </ul>
            <button
              onClick={handleExportConfig}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(74, 158, 255, 0.2)',
                border: '1px solid rgba(74, 158, 255, 0.4)',
                color: '#4a9eff',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(74, 158, 255, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(74, 158, 255, 0.2)';
              }}
            >
              📤 Télécharger la sauvegarde complète
            </button>
          </div>
        </div>

        <div className="modal-footer" style={{
          padding: '16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            className="btn-secondary"
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
