import React, { useState } from 'react';
import { tauriAPI } from '../lib/tauri-api';

export default function LogsModal({ onClose }: { onClose?: () => void }) {
  const [logContent, setLogContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLog = async (file: string) => {
    setLoading(true);
    setError(null);
    try {
      // Utilise invoke pour lire le fichier log côté backend
      const content = await tauriAPI.readLogFile(file);
      setLogContent(content);
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la lecture du log.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ minWidth: 600, minHeight: 400 }}>
        <h2>Logs de l'application</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={() => fetchLog('tauri_debug.log')}>Voir log Tauri</button>
          <button onClick={() => fetchLog('errors.log')}>Voir log Python</button>
        </div>
        {loading && <div>Chargement...</div>}
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <pre style={{ maxHeight: 350, overflow: 'auto', background: '#222', color: '#eee', padding: 12, borderRadius: 6 }}>{logContent}</pre>
        <button onClick={onClose} style={{ marginTop: 16 }}>Fermer</button>
      </div>
    </div>
  );
}
