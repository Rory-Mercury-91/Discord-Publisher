import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../state/appContext';
import { useToast } from './ToastProvider';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { logger } from '../lib/logger';
import LogsModal from './LogsModal';

export default function ConfigModal({ onClose }: { onClose?: () => void }) {
  const { showToast } = useToast();
  const { 
    apiStatus, 
    templates, 
    savedTags, 
    savedInstructions, 
    savedTraductors, 
    allVarsConfig 
  } = useApp();

  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('apiUrl') || '');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('apiKey') || '');
  const [showLogs, setShowLogs] = useState(false);

  // Hooks pour fermer avec Echap et bloquer le scroll du fond
  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  // Calcul du statut pour l'affichage des pastilles
  const status = typeof apiStatus === 'object' && apiStatus !== null 
    ? { 
        connected: (apiStatus as any).status === 'ok', 
        bot1: (apiStatus as any).bots?.server1 || false,
        bot2: (apiStatus as any).bots?.server2 || false 
      }
    : { connected: false, bot1: false, bot2: false };

  const handleSave = () => {
    localStorage.setItem('apiUrl', apiUrl);
    localStorage.setItem('apiKey', apiKey);
    showToast("Configuration enregistrée !", "success");
  };

  const handleExportConfig = () => {
    try {
      const fullConfig = { 
        templates, savedTags, savedInstructions, savedTraductors, 
        allVarsConfig, apiUrl, apiKey 
      };
      const blob = new Blob([JSON.stringify(fullConfig, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'backup_config_discord.json';
      a.click();
      showToast("Sauvegarde téléchargée", "success");
    } catch (err: any) {
      logger.error(err?.message || "Erreur export");
      showToast("Erreur lors de l'export", "error");
    }
  };

  // Le contenu HTML de la modale
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
        backgroundColor: 'rgba(0, 0, 0, 0.8)', // Fond bien sombre
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999, // Z-index ultra élevé
        backdropFilter: 'blur(3px)' // Petit flou derrière
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
        <div className="modal-header" style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>⚙️ Configuration Serveur</h2>
          <button className="close-button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: '24px', cursor: 'pointer' }}>&times;</button>
        </div>

        <div className="modal-body" style={{ padding: '20px' }}>
          {/* Section API */}
          <div style={{ marginBottom: '25px' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--accent)', marginBottom: '15px' }}>🌐 Connexion Koyeb</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem' }}>URL API</label>
              <input 
                type="text" 
                value={apiUrl} 
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://votre-app.koyeb.app"
                style={{ width: '100%', padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }}
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem' }}>Clé API</label>
              <input 
                type="password" 
                value={apiKey} 
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Votre clé secrète"
                style={{ width: '100%', padding: '10px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }}
              />
            </div>
            <button className="btn-primary" onClick={handleSave} style={{ width: '100%', padding: '10px' }}>
              💾 Enregistrer les accès
            </button>
          </div>

          {/* Section Statut */}
          <div style={{ marginBottom: '10px' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--accent)', marginBottom: '15px' }}>🤖 État des Bots</h3>
            <div style={{ padding: '15px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ marginBottom: '10px' }}>
                Serveur : <span style={{ color: status.connected ? 'var(--success)' : 'var(--error)', fontWeight: 'bold' }}>
                  {status.connected ? "● EN LIGNE" : "○ HORS LIGNE"}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '20px', fontSize: '0.85rem' }}>
                <span>Bot 1 : {status.bot1 ? "✅" : "❌"}</span>
                <span>Bot 2 : {status.bot2 ? "✅" : "❌"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ padding: '16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleExportConfig}>📤 Backup</button>
            <button onClick={() => setShowLogs(true)}>📜 Logs</button>
          </div>
          <button onClick={onClose} className="btn-secondary">Fermer</button>
        </div>
      </div>

      {showLogs && <LogsModal onClose={() => setShowLogs(false)} />}
    </div>
  );

  // On téléporte le tout dans le body pour être au premier plan
  return createPortal(modalContent, document.body);
}