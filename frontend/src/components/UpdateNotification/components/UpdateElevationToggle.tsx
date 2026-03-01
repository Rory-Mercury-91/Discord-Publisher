// Toggle « Mode administrateur (UAC) » pour l’installation avec élévation
interface UpdateElevationToggleProps {
  useElevation: boolean;
  onToggle: () => void;
}

export default function UpdateElevationToggle({ useElevation, onToggle }: UpdateElevationToggleProps) {
  return (
    <div className={`update-elevation ${useElevation ? 'update-elevation--active' : ''}`}>
      <label className="update-elevation__label" onClick={(e) => { e.preventDefault(); onToggle(); }}>
        <div className="update-elevation__switch" role="switch" aria-checked={useElevation}>
          <div className="update-elevation__thumb" />
        </div>
        <div style={{ flex: 1 }}>
          <div className="update-elevation__title">🔐 Mode administrateur (UAC)</div>
          <div className="update-elevation__hint">
            {useElevation
              ? '⚠️ Installation avec droits admin'
              : '✅ Installation standard (recommandé)'}
          </div>
        </div>
      </label>
      <div className="update-elevation__help">
        💡 <strong>Quand activer ?</strong><br />
        • Compte restreint : laissez désactivé<br />
        • Installation système : activez
      </div>
    </div>
  );
}
