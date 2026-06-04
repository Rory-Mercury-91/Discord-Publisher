// frontend/src/components/Settings/components/PreferenceSettings.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '../../../lib/runtime';
import CalendarTemplateSettings from './CalendarTemplateSettings';

type PreferenceSettingsProps = {
  registerFlush?: (fn: (() => Promise<void>) | null) => void;
};

type WindowState = 'normal' | 'maximized' | 'fullscreen' | 'minimized';

const VALID_WINDOW_STATES: WindowState[] = ['normal', 'maximized', 'fullscreen', 'minimized'];

function isWindowState(v: string): v is WindowState {
  return VALID_WINDOW_STATES.includes(v as WindowState);
}

export default function PreferenceSettings({ registerFlush }: PreferenceSettingsProps) {
  const [defaultTranslationLabel, setDefaultTranslationLabel] = useState(() => localStorage.getItem('default_translation_label') || 'Traduction');
  const [defaultModLabel, setDefaultModLabel] = useState(() => localStorage.getItem('default_mod_label') || 'Mod');
  const [windowState, setWindowState] = useState<WindowState>(() => (localStorage.getItem('windowState') as WindowState) || 'maximized');
  const [defaultMode, setDefaultMode] = useState<string>(() => localStorage.getItem('defaultMode') || 'translator');

  const windowStateRef = useRef(windowState);
  windowStateRef.current = windowState;

  const childFlushesRef = useRef(new Set<() => Promise<void>>());

  const registerChildFlush = useCallback((fn: (() => Promise<void>) | null) => {
    if (!fn) return undefined;
    childFlushesRef.current.add(fn);
    return () => {
      childFlushesRef.current.delete(fn);
    };
  }, []);

  useEffect(() => { localStorage.setItem('default_translation_label', defaultTranslationLabel); }, [defaultTranslationLabel]);
  useEffect(() => { localStorage.setItem('default_mod_label', defaultModLabel); }, [defaultModLabel]);
  useEffect(() => { localStorage.setItem('defaultMode', defaultMode); }, [defaultMode]);

  useEffect(() => {
    if (!isTauri) return;
    void (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const saved = await invoke<string>('get_saved_window_state');
        const normalized = (saved || '').trim().toLowerCase();
        if (isWindowState(normalized)) {
          setWindowState(normalized);
          localStorage.setItem('windowState', normalized);
        }
      } catch {
        /* ignoré */
      }
    })();
  }, []);

  const applyWindowStateLive = useCallback(async (next: WindowState) => {
    if (!isTauri) return;
    try {
      let win: { setFullscreen?: (v: boolean) => Promise<void>; isFullscreen?: () => Promise<boolean>; isMinimized?: () => Promise<boolean>; unminimize?: () => Promise<void>; unmaximize?: () => Promise<void>; maximize?: () => Promise<void>; minimize?: () => Promise<void> } | null = null;
      try {
        const wv: { getCurrentWebviewWindow?: () => typeof win } = await import('@tauri-apps/api/webviewWindow');
        win = wv.getCurrentWebviewWindow?.() ?? null;
      } catch { /* ignore */ }
      if (!win) {
        try {
          const w: { getCurrentWindow?: () => typeof win } = await import('@tauri-apps/api/window');
          win = w.getCurrentWindow?.() ?? null;
        } catch { /* ignore */ }
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
        case 'fullscreen':
          await win.unmaximize?.();
          await win.setFullscreen?.(true);
          break;
        case 'maximized':
          await win.maximize?.();
          break;
        case 'normal':
          await win.unmaximize?.();
          break;
        case 'minimized':
          await win.minimize?.();
          break;
      }
    } catch (e) {
      console.error('Erreur état fenêtre:', e);
    }
  }, []);

  const flushWindowState = useCallback(async () => {
    const state = windowStateRef.current;
    localStorage.setItem('windowState', state);
    if (!isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_window_state', { state });
      await applyWindowStateLive(state);
    } catch (e) {
      console.error('Erreur sauvegarde état fenêtre:', e);
    }
  }, [applyWindowStateLive]);

  useEffect(() => {
    if (!registerFlush) return;
    const combinedFlush = async () => {
      await flushWindowState();
      for (const fn of childFlushesRef.current) {
        await fn();
      }
    };
    registerFlush(combinedFlush);
    return () => registerFlush(null);
  }, [registerFlush, flushWindowState]);

  return (
    <div className="settings-grid">
      {/* Section 1 : démarrage | fenêtre */}
      <section className="settings-section">
        <h4 className="settings-section__title">🚀 Onglet au démarrage</h4>
        <div className="form-field">
          <label className="form-label">Vue affichée au lancement</label>
          <select
            value={defaultMode}
            onChange={e => setDefaultMode(e.target.value)}
            className="form-input settings-select-pointer"
          >
            <option value="translator">✍️ Traducteur</option>
            <option value="library">📚 Bibliothèque</option>
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h4 className="settings-section__title">🪟 Affichage de la fenêtre</h4>
        <div className="form-field">
          <label className="form-label">Mode par défaut (1er lancement)</label>
          <select
            value={windowState}
            onChange={e => setWindowState(e.target.value as WindowState)}
            className="form-input settings-select-pointer"
          >
            <option value="normal">🔲 Normal</option>
            <option value="maximized">⬛ Maximisé</option>
            <option value="fullscreen">🖥️ Plein écran</option>
            <option value="minimized">➖ Minimisé</option>
          </select>
          <p className="settings-log-description" style={{ marginTop: 8 }}>
            {isTauri
              ? 'La position et la taille de la fenêtre sont retenues automatiquement. Ce réglage ne s’utilise qu’au tout premier lancement.'
              : 'Enregistré à la fermeture de cette fenêtre.'}
          </p>
        </div>
      </section>

      {/* Section 2 : labels */}
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

      {/* Section 3 : Webtoon | salon (admin) */}
      <CalendarTemplateSettings registerFlush={registerChildFlush} />
    </div>
  );
}
