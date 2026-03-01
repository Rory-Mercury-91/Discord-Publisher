declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

interface HeaderActionsProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenConfig: () => void;
  onOpenHelp: () => void;
}

export default function HeaderActions({
  theme,
  onToggleTheme,
  onOpenConfig,
  onOpenHelp,
}: HeaderActionsProps) {
  const handleClose = async () => {
    try {
      if (window.__TAURI__) {
        try {
          const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
          await getCurrentWebviewWindow().close();
        } catch {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          await getCurrentWindow().close();
        }
      } else {
        window.close();
      }
    } catch (e) {
      console.error('Erreur fermeture:', e);
    }
  };

  return (
    <div className="app-header-actions">
      <button type="button" className="app-header-icon-btn" onClick={onOpenConfig} title="Configuration">
        ⚙️
      </button>
      <button type="button" className="app-header-icon-btn" onClick={onOpenHelp} title="Aide & raccourcis clavier">
        ❓
      </button>
      <button
        type="button"
        className="app-header-icon-btn"
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Passer en mode jour' : 'Passer en mode nuit'}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <div className="app-header-sep app-header-sep--sm" />
      <button
        type="button"
        className="app-header-icon-btn app-header-icon-btn--close"
        onClick={handleClose}
        title="Fermer l'application"
      >
        ✕
      </button>
    </div>
  );
}
