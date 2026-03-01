// frontend/src/components/Settings/components/PreferenceSettings.tsx
import { useEffect, useState } from 'react';

type WindowState = 'normal' | 'maximized' | 'fullscreen' | 'minimized';

export default function PreferenceSettings() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('apiKey') || '');
  const [defaultTranslationLabel, setDefaultTranslationLabel] = useState(() => localStorage.getItem('default_translation_label') || 'Traduction');
  const [defaultModLabel, setDefaultModLabel] = useState(() => localStorage.getItem('default_mod_label') || 'Mod');
  const [windowState, setWindowState] = useState<WindowState>(() => (localStorage.getItem('windowState') as WindowState) || 'maximized');

  useEffect(() => { localStorage.setItem('apiKey', apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem('default_translation_label', defaultTranslationLabel); }, [defaultTranslationLabel]);
  useEffect(() => { localStorage.setItem('default_mod_label', defaultModLabel); }, [defaultModLabel]);

  const applyWindowStateLive = async (next: WindowState) => {
    try {
      if (!window.__TAURI__) return;
      let win: any = null;
      try {
        const wv: any = await import('@tauri-apps/api/webviewWindow');
        win = typeof wv.getCurrentWebviewWindow === 'function' ? wv.getCurrentWebviewWindow() : (wv.appWindow ?? null);
      } catch { }
      if (!win) {
        try {
          const w: any = await import('@tauri-apps/api/window');
          win = typeof w.getCurrentWindow === 'function' ? w.getCurrentWindow() : (w.appWindow ?? null);
        } catch { }
      }
      if (!win) return;

      if (next !== 'fullscreen' && typeof win.setFullscreen === 'function') {
        const isFs = typeof win.isFullscreen === 'function' ? await win.isFullscreen() : false;
        if (isFs) await win.setFullscreen(false);
      }
      if (next !== 'minimized' && typeof win.isMinimized === 'function') {
        const isMin = await win.isMinimized();
        if (isMin && typeof win.unminimize === 'function') await win.unminimize();
      }

      switch (next) {
        case 'fullscreen': await win.unmaximize?.(); await win.setFullscreen?.(true); break;
        case 'maximized': await win.maximize?.(); break;
        case 'normal': await win.unmaximize?.(); break;
        case 'minimized': await win.minimize?.(); break;
      }
    } catch (e) {
      console.error('Erreur état fenêtre:', e);
    }
  };

  const handleWindowStateChange = async (state: WindowState) => {
    setWindowState(state);
    await applyWindowStateLive(state);
    localStorage.setItem('windowState', state);
  };

  return (
    <div className="settings-grid">
      <section className="settings-section">
        <h4 className="settings-section__title">🔑 Clé API</h4>
        <div className="form-field">
          <label className="form-label">Clé d'accès à l'API</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Votre clé secrète"
            className="form-input"
          />
        </div>
      </section>

      <section className="settings-section">
        <h4 className="settings-section__title">🪟 Affichage de la fenêtre</h4>
        <div className="form-field">
          <label className="form-label">Mode d'affichage au démarrage</label>
          <select
            value={windowState}
            onChange={e => handleWindowStateChange(e.target.value as WindowState)}
            className="form-input settings-select-pointer"
          >
            <option value="normal">🔲 Normal</option>
            <option value="maximized">⬛ Maximisé</option>
            <option value="fullscreen">🖥️ Plein écran</option>
            <option value="minimized">➖ Minimisé</option>
          </select>
        </div>
      </section>

      <section className="settings-section settings-grid--full">
        <div className="settings-log-header settings-log-header--labels">
          <div>
            <h4 className="settings-section__title">🏷️ Labels par défaut</h4>
            <p className="settings-log-description">
              Valeurs préservées lors de la réinitialisation du formulaire.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDefaultTranslationLabel('Traduction');
              setDefaultModLabel('Mod');
            }}
            className="form-btn form-btn--ghost form-btn--sm"
          >
            Restaurer
          </button>
        </div>
        <div className="settings-grid">
          <div className="form-field">
            <label className="form-label">Label de traduction</label>
            <input
              type="text"
              value={defaultTranslationLabel}
              onChange={e => setDefaultTranslationLabel(e.target.value)}
              placeholder="Traduction"
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label className="form-label">Label de mod</label>
            <input
              type="text"
              value={defaultModLabel}
              onChange={e => setDefaultModLabel(e.target.value)}
              placeholder="Mod"
              className="form-input"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
