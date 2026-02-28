// frontend/src/components/Settings/components/PreferenceSettings.tsx
import { useEffect, useState } from 'react';

type WindowState = 'normal' | 'maximized' | 'fullscreen' | 'minimized';

export default function PreferenceSettings() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('apiKey') || '');
  const [defaultTranslationLabel, setDefaultTranslationLabel] = useState(() => localStorage.getItem('default_translation_label') || 'Traduction');
  const [defaultModLabel, setDefaultModLabel] = useState(() => localStorage.getItem('default_mod_label') || 'Mod');
  const [windowState, setWindowState] = useState<WindowState>(() => (localStorage.getItem('windowState') as WindowState) || 'maximized');

  const [displayMode, setDisplayMode] = useState<'compact' | 'enriched'>(() => {
    try {
      const saved = localStorage.getItem('library_display_mode');
      return (saved === 'enriched' ? 'enriched' : 'compact') as 'compact' | 'enriched';
    } catch {
      return 'compact';
    }
  });

  useEffect(() => { localStorage.setItem('apiKey', apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem('default_translation_label', defaultTranslationLabel); }, [defaultTranslationLabel]);
  useEffect(() => { localStorage.setItem('default_mod_label', defaultModLabel); }, [defaultModLabel]);
  useEffect(() => {
    localStorage.setItem('library_display_mode', displayMode);
    window.dispatchEvent(new CustomEvent('libraryDisplayModeChanged', { detail: displayMode }));
  }, [displayMode]);

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
            className="form-input"
            style={{ cursor: 'pointer' }}
          >
            <option value="normal">🔲 Normal</option>
            <option value="maximized">⬛ Maximisé</option>
            <option value="fullscreen">🖥️ Plein écran</option>
            <option value="minimized">➖ Minimisé</option>
          </select>
        </div>
      </section>

      <section className="settings-section settings-grid--full">
        <div className="settings-log-header" style={{ marginBottom: 4 }}>
          <div>
            <h4 className="settings-section__title">🏷️ Labels par défaut</h4>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
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

      <section className="settings-section settings-grid--full">
        <h4 className="settings-section__title">📚 Préférences de la Bibliothèque</h4>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, marginBottom: 16, lineHeight: 1.5 }}>
          Choisissez comment afficher les jeux dans la bibliothèque :
        </p>
        <div className="settings-grid">
          <label
            className="settings-radio-card"
            style={{
              background: displayMode === 'compact' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255,255,255,0.03)',
              borderColor: displayMode === 'compact' ? 'rgba(59, 130, 246, 0.35)' : 'var(--border)',
            }}
          >
            <input
              type="radio"
              checked={displayMode === 'compact'}
              onChange={() => setDisplayMode('compact')}
              style={{ marginTop: 3, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: displayMode === 'compact' ? 'var(--accent)' : 'var(--text)', marginBottom: 6 }}>
                📋 Information directe
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>
                Affichage compact avec toutes les informations et liens visibles directement sur la carte.
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
                  • Versions visibles<br />• Traducteur + type de traduction<br />• Date de mise à jour<br />• Liens directs (jeu + traduction)
                </div>
              </div>
            </div>
          </label>
          <label
            className="settings-radio-card"
            style={{
              background: displayMode === 'enriched' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255,255,255,0.03)',
              borderColor: displayMode === 'enriched' ? 'rgba(59, 130, 246, 0.35)' : 'var(--border)',
            }}
          >
            <input
              type="radio"
              checked={displayMode === 'enriched'}
              onChange={() => setDisplayMode('enriched')}
              style={{ marginTop: 3, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: displayMode === 'enriched' ? 'var(--accent)' : 'var(--text)', marginBottom: 6 }}>
                ✨ Information enrichie
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>
                Affichage épuré avec un bouton « Plus d'informations » qui ouvre une modale détaillée.
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
                  • Synopsis (FR/EN)<br />• Tags colorés<br />• Toutes les informations du jeu<br />• Liens + invitation Discord
                </div>
              </div>
            </div>
          </label>
        </div>
      </section>
    </div>
  );
}
