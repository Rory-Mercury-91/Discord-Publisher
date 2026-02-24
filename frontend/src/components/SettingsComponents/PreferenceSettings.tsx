// frontend\src\components\SettingsComponents\PreferenceSettings.tsx
import { useEffect, useState } from 'react';

const sectionStyle: React.CSSProperties = { /* même que avant */ };
const inputStyle: React.CSSProperties = { /* même */ };
const labelStyle: React.CSSProperties = { /* même */ };
const gridStyle: React.CSSProperties = { /* même */ };
const fullWidthStyle: React.CSSProperties = { gridColumn: '1 / -1' };

type WindowState = 'normal' | 'maximized' | 'fullscreen' | 'minimized';

export default function PreferenceSettings() {
  // États (identiques)
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

  // ─── Gestion de l'état de la fenêtre Tauri ───────────────────────────────
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
    <div style={gridStyle}>
      {/* Clé API */}
      <section style={sectionStyle}>
        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>🔑 Clé API</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={labelStyle}>Clé d'accès à l'API</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Votre clé secrète"
            style={inputStyle}
          />
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            🔒 Transmise par l'administrateur. Nécessaire pour publier.
          </p>
        </div>
      </section>

      {/* Fenêtre */}
      <section style={sectionStyle}>
        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>🪟 Affichage de la fenêtre</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={labelStyle}>Mode d'affichage au démarrage</label>
          <select
            value={windowState}
            onChange={e => handleWindowStateChange(e.target.value as WindowState)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="normal">🔲 Normal</option>
            <option value="maximized">⬛ Maximisé</option>
            <option value="fullscreen">🖥️ Plein écran</option>
            <option value="minimized">➖ Minimisé</option>
          </select>
        </div>
      </section>

      {/* Labels par défaut */}
      <section style={{ ...sectionStyle, ...fullWidthStyle }}>
        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>🏷️ Labels par défaut</h4>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
          Valeurs préservées lors de la réinitialisation du formulaire.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Label de traduction</label>
            <input
              type="text"
              value={defaultTranslationLabel}
              onChange={e => setDefaultTranslationLabel(e.target.value)}
              placeholder="Traduction"
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Label de mod</label>
            <input
              type="text"
              value={defaultModLabel}
              onChange={e => setDefaultModLabel(e.target.value)}
              placeholder="Mod"
              style={inputStyle}
            />
          </div>
        </div>
      </section>

      {/* Mode d'affichage Bibliothèque */}
      <section style={{ ...sectionStyle, ...fullWidthStyle }}>
        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>📚 Préférences de la Bibliothèque</h4>
        <div style={{
          background: 'rgba(99,102,241,0.05)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 8,
          padding: 16
        }}>
          <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            Mode d'affichage
          </div>

          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
            Choisissez comment afficher les jeux dans la bibliothèque :
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Compact */}
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: 14,
              borderRadius: 8,
              background: displayMode === 'compact' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${displayMode === 'compact' ? 'rgba(99,102,241,0.4)' : 'var(--border)'}`,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}>
              <input
                type="radio"
                checked={displayMode === 'compact'}
                onChange={() => setDisplayMode('compact')}
                style={{ marginTop: 2, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: displayMode === 'compact' ? 'var(--accent)' : 'var(--text)',
                  marginBottom: 4
                }}>
                  📋 Information directe
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Affichage compact avec toutes les informations et liens visibles directement sur la carte.
                  Idéal pour un accès rapide.
                  <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
                    • Versions visibles<br />
                    • Traducteur + type de traduction<br />
                    • Date de mise à jour<br />
                    • Liens directs (jeu + traduction)
                  </div>
                </div>
              </div>
            </label>

            {/* Enriched */}
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: 14,
              borderRadius: 8,
              background: displayMode === 'enriched' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${displayMode === 'enriched' ? 'rgba(99,102,241,0.4)' : 'var(--border)'}`,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}>
              <input
                type="radio"
                checked={displayMode === 'enriched'}
                onChange={() => setDisplayMode('enriched')}
                style={{ marginTop: 2, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: displayMode === 'enriched' ? 'var(--accent)' : 'var(--text)',
                  marginBottom: 4
                }}>
                  ✨ Information enrichie
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Affichage épuré avec un bouton "Plus d'informations" qui ouvre une modale détaillée.
                  Idéal pour une vue d'ensemble claire.
                  <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
                    • Synopsis (FR/EN)<br />
                    • Tags colorés<br />
                    • Toutes les informations du jeu<br />
                    • Liens + invitation Discord
                  </div>
                </div>
              </div>
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
