// Déclaration globale pour éviter l'erreur TS sur window.__TAURI__
declare global {
  interface Window {
    __TAURI__?: any;
  }
}
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConfirm } from '../hooks/useConfirm';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { getSupabase } from '../lib/supabase';
import { useApp } from '../state/appContext';
import type { Profile } from '../state/authContext';
import { useAuth } from '../state/authContext';
import ConfirmModal from './ConfirmModal';
import { useToast } from './ToastProvider';

// Type pour l'état de la fenêtre
type WindowState = 'normal' | 'maximized' | 'fullscreen' | 'minimized';

interface ConfigModalProps {
  onClose?: () => void;
  /** true = accès admin (fenêtre, export/import) ; false = uniquement API */
  adminMode?: boolean;
  /** Callback pour ouvrir la modale des logs (permet l'accès depuis le badge API) */
  onOpenLogs?: () => void;
}

type ProfilePublic = Pick<Profile, 'id' | 'pseudo' | 'discord_id'>;

export default function ConfigModal({ onClose, adminMode = false, onOpenLogs }: ConfigModalProps) {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const {
    templates,
    savedTags,
    savedInstructions,
    allVarsConfig,
    publishedPosts,
    importFullConfig,
    setApiBaseFromSupabase,
    clearAllAppData
  } = useApp();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('apiUrl') || localStorage.getItem('apiBase') || 'http://138.2.182.125:8080');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('apiKey') || '');

  // Labels par défaut personnalisés
  const [defaultTranslationLabel, setDefaultTranslationLabel] = useState(() => localStorage.getItem('default_translation_label') || 'Traduction');
  const [defaultModLabel, setDefaultModLabel] = useState(() => localStorage.getItem('default_mod_label') || 'Mod');

  // Droits d'édition : liste des profils et des éditeurs autorisés par l'utilisateur connecté
  const [allProfiles, setAllProfiles] = useState<ProfilePublic[]>([]);
  const [allowedEditorIds, setAllowedEditorIds] = useState<Set<string>>(new Set());
  const [editorsLoading, setEditorsLoading] = useState(false);

  // État de la fenêtre
  const [windowState, setWindowState] = useState<WindowState>(() => {
    const saved = localStorage.getItem('windowState') as WindowState;
    return saved || 'maximized';
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  // Charger les profils et les éditeurs autorisés (section utilisateur)
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !profile?.id) return;
    setEditorsLoading(true);
    (async () => {
      try {
        const { data: profilesData } = await sb.from('profiles').select('id, pseudo, discord_id');
        const list = (profilesData ?? []) as ProfilePublic[];
        setAllProfiles(list);
        const { data: allowedData } = await sb.from('allowed_editors').select('editor_id').eq('owner_id', profile.id);
        const ids = new Set((allowedData ?? []).map((r: { editor_id: string }) => r.editor_id));
        setAllowedEditorIds(ids);
      } catch (_e) {
        setAllProfiles([]);
        setAllowedEditorIds(new Set());
      } finally {
        setEditorsLoading(false);
      }
    })();
  }, [profile?.id]);

  // ✅ Sauvegarde automatique de l'URL API
  useEffect(() => {
    if (!adminMode) return;
    localStorage.setItem('apiUrl', apiUrl);
    localStorage.setItem('apiBase', apiUrl);
    const baseUrl = (apiUrl || '').trim().replace(/\/+$/, '');
    if (baseUrl) {
      setApiBaseFromSupabase(baseUrl);
      const sb = getSupabase();
      if (sb) {
        sb.from('app_config')
          .upsert(
            { key: 'api_base_url', value: baseUrl, updated_at: new Date().toISOString() },
            { onConflict: 'key' }
          )
          .then((res) => {
            if (res?.error) console.warn('⚠️ Supabase app_config:', (res.error as { message?: string })?.message);
          });
      }
    }
  }, [apiUrl, adminMode, setApiBaseFromSupabase]);

  // ✅ Sauvegarde automatique de la clé API
  useEffect(() => {
    localStorage.setItem('apiKey', apiKey);
  }, [apiKey]);

  // ✅ Sauvegarde automatique des labels par défaut
  useEffect(() => {
    localStorage.setItem('default_translation_label', defaultTranslationLabel);
  }, [defaultTranslationLabel]);

  useEffect(() => {
    localStorage.setItem('default_mod_label', defaultModLabel);
  }, [defaultModLabel]);

  const toggleEditor = async (editorId: string, currentlyAllowed: boolean) => {
    const sb = getSupabase();
    if (!sb || !profile?.id) return;
    if (currentlyAllowed) {
      const { error } = await sb.from('allowed_editors').delete().eq('owner_id', profile.id).eq('editor_id', editorId);
      if (error) {
        showToast('Erreur lors de la révocation', 'error');
        return;
      }
      setAllowedEditorIds(prev => { const n = new Set(prev); n.delete(editorId); return n; });
      showToast('Autorisation révoquée', 'success');
    } else {
      const { error } = await sb.from('allowed_editors').insert({ owner_id: profile.id, editor_id: editorId });
      if (error) {
        showToast('Erreur lors de l\'autorisation', 'error');
        return;
      }
      setAllowedEditorIds(prev => new Set(prev).add(editorId));
      showToast('Utilisateur autorisé à modifier vos posts', 'success');
    }
  };

  const applyWindowStateLive = async (next: WindowState) => {
    try {
      // Uniquement en contexte Tauri
      if (!window.__TAURI__) return;

      let win: any = null;

      // Tauri v2 (WebviewWindow)
      try {
        const wv: any = await import('@tauri-apps/api/webviewWindow');
        if (typeof wv.getCurrentWebviewWindow === 'function') win = wv.getCurrentWebviewWindow();
        else if (wv.appWindow) win = wv.appWindow;
      } catch { }

      // Tauri v1 (Window/appWindow)
      if (!win) {
        try {
          const w: any = await import('@tauri-apps/api/window');
          if (typeof w.getCurrentWindow === 'function') win = w.getCurrentWindow();
          else if (w.appWindow) win = w.appWindow;
        } catch { }
      }

      if (!win) return;

      // Sortir du fullscreen si la cible n'est pas fullscreen
      if (next !== 'fullscreen' && typeof win.setFullscreen === 'function') {
        const isFs = typeof win.isFullscreen === 'function' ? await win.isFullscreen() : false;
        if (isFs) await win.setFullscreen(false);
      }

      // Sortir du minimized si besoin
      if (next !== 'minimized') {
        if (typeof win.isMinimized === 'function') {
          const isMin = await win.isMinimized();
          if (isMin && typeof win.unminimize === 'function') await win.unminimize();
        } else if (typeof win.unminimize === 'function') {
          await win.unminimize();
        }
      }

      switch (next) {
        case 'fullscreen':
          // éviter les conflits fullscreen/maximize
          if (typeof win.isMaximized === 'function' && typeof win.unmaximize === 'function') {
            const isMax = await win.isMaximized();
            if (isMax) await win.unmaximize();
          } else if (typeof win.unmaximize === 'function') {
            await win.unmaximize();
          }
          if (typeof win.setFullscreen === 'function') await win.setFullscreen(true);
          break;
        case 'maximized':
          if (typeof win.maximize === 'function') await win.maximize();
          break;
        case 'normal':
          if (typeof win.unmaximize === 'function') await win.unmaximize();
          break;
        case 'minimized':
          if (typeof win.minimize === 'function') await win.minimize();
          break;
      }
    } catch (e) {
      console.error('❌ Erreur application état fenêtre:', e);
    }
  };

  // ✅ Gestion du changement d'état de fenêtre avec sauvegarde instantanée
  const handleWindowStateChange = async (state: WindowState) => {
    setWindowState(state);
    await applyWindowStateLive(state);
    localStorage.setItem('windowState', state);
    try {
      if (window.__TAURI__) {
        const { invoke } = window.__TAURI__.core;
        await invoke('save_window_state', { state });
      }
    } catch (_e) { /* ignorer */ }
  };

  const handleCleanupAllData = async () => {
    const ok = await confirm({
      title: 'Nettoyage complet des données',
      message: 'Supprimer toutes les données applicatives (publications, tags, config, autorisations) sur Supabase et vider l\'historique local. Cette action est irréversible. Continuer ?',
      confirmText: 'Tout supprimer',
      type: 'danger'
    });
    if (!ok) return;
    const { ok: success, error } = await clearAllAppData(profile?.id);
    if (success) {
      showToast('Données nettoyées avec succès', 'success');
      onClose?.();
    } else {
      showToast('Erreur lors du nettoyage: ' + (error ?? 'inconnue'), 'error');
    }
  };

  const handleExportConfig = () => {
    try {
      const fullConfig = {
        apiUrl,
        apiBase: apiUrl,
        apiKey,
        templates,
        allVarsConfig,
        savedTags,
        savedInstructions,
        publishedPosts,
        windowState,
        defaultTranslationLabel,
        defaultModLabel,
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
      console.error(err?.message || "❌ Erreur export");
      showToast("Erreur lors de l'export", "error");
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';

    const ok = await confirm({
      title: '⚠️ Importer une sauvegarde',
      message:
        "Importer une sauvegarde va écraser tes données actuelles (templates, variables, tags, instructions, historique). Continuer ?",
      confirmText: 'Importer',
      cancelText: 'Annuler',
      type: 'danger'
    });
    if (!ok) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      importFullConfig(data);

      setApiUrl(localStorage.getItem('apiUrl') || localStorage.getItem('apiBase') || 'http://138.2.182.125:8080');
      setApiKey(localStorage.getItem('apiKey') || '');

      // ✅ Restaurer l'état de fenêtre si présent
      if (data.windowState) {
        setWindowState(data.windowState);
        localStorage.setItem('windowState', data.windowState);
        void applyWindowStateLive(data.windowState);
      }

      // ✅ Restaurer les labels par défaut si présents
      if (data.defaultTranslationLabel) {
        setDefaultTranslationLabel(data.defaultTranslationLabel);
        localStorage.setItem('default_translation_label', data.defaultTranslationLabel);
      }
      if (data.defaultModLabel) {
        setDefaultModLabel(data.defaultModLabel);
        localStorage.setItem('default_mod_label', data.defaultModLabel);
      }

      showToast('Sauvegarde importée avec succès !', 'success');
    } catch (err: any) {
      console.error(err?.message || "❌ Erreur lors de l'import (fichier invalide ?)", err);
      showToast("Erreur lors de l'import (fichier invalide ?)", 'error');
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
          maxWidth: '1100px',
          maxHeight: '90vh',
          overflowY: 'auto',
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

        <div
          className="modal-body"
          style={{
            padding: '24px 28px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 24,
            minWidth: 0,
            alignItems: 'start',
          }}
        >
          {/* Colonne gauche */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Section Configuration API */}
            <section
              style={{
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 20,
                background: 'rgba(255,255,255,0.02)',
                display: 'flex',
                flexDirection: 'column',
                gap: 18,
              }}
            >
              <h4 style={{ margin: 0, fontSize: '1rem' }}>🌐 Configuration API</h4>

              {adminMode && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'block', fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>
                    URL de l'API
                  </label>
                  <input
                    type="text"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="http://138.2.182.125:8080"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--text)',
                      fontSize: 14,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'block', fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>
                  Clé API
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Votre clé secrète"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text)',
                    fontSize: 14,
                    boxSizing: 'border-box',
                  }}
                />
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
                  🔒 Clé de sécurité pour publier. Cette clé doit être transmise par l'administrateur.
                </p>
              </div>
            </section>

            {/* Section État de la fenêtre */}
            <section
              style={{
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 20,
                background: 'rgba(255,255,255,0.02)',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <h4 style={{ margin: 0, fontSize: '1rem' }}>🪟 État de la fenêtre</h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'block', fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>
                  Mode d'affichage
                </label>
                <select
                  value={windowState}
                  onChange={(e) => handleWindowStateChange(e.target.value as WindowState)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text)',
                    fontSize: 14,
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                  }}
                >
                  <option value="normal">🔲 Normal</option>
                  <option value="maximized">⬜ Maximisé</option>
                  <option value="fullscreen">🖥️ Plein écran</option>
                  <option value="minimized">➖ Minimisé</option>
                </select>
              </div>
            </section>

            {/* Section Labels par défaut */}
            <section
              style={{
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 20,
                background: 'rgba(255,255,255,0.02)',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <h4 style={{ margin: 0, fontSize: '1rem' }}>🏷️ Labels par défaut</h4>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                Personnalisez les labels par défaut. Ces valeurs seront préservées lors du vidage du formulaire.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'block', fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>
                    Label de traduction
                  </label>
                  <input
                    type="text"
                    value={defaultTranslationLabel}
                    onChange={(e) => setDefaultTranslationLabel(e.target.value)}
                    placeholder="Traduction"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--text)',
                      fontSize: 14,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'block', fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>
                    Label de mod
                  </label>
                  <input
                    type="text"
                    value={defaultModLabel}
                    onChange={(e) => setDefaultModLabel(e.target.value)}
                    placeholder="Mod"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--text)',
                      fontSize: 14,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            </section>
          </div>

          {/* Colonne droite */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Section Droits d'édition */}
            {profile?.id && (
              <section
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: 20,
                  background: 'rgba(255,255,255,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                <h4 style={{ margin: 0, fontSize: '1rem' }}>👥 Qui peut modifier mes posts</h4>
                <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                  💡 Autorisez ou révoquez le droit d'édition de vos publications.
                  <br />
                  🎨 <strong>Code couleur :</strong> <span style={{ color: '#9ca3af' }}>Gris</span> = Non autorisé • <span style={{ color: '#ef4444' }}>Rouge</span> = Autorisé
                </p>
                {editorsLoading ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Chargement…</div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 10,
                    maxHeight: 280,
                    overflowY: 'auto'
                  }}>
                    {allProfiles
                      .filter(p => p.id !== profile.id)
                      .map(p => {
                        const allowed = allowedEditorIds.has(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => toggleEditor(p.id, allowed)}
                            style={{
                              padding: '12px 14px',
                              borderRadius: 10,
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 13,
                              fontWeight: 600,
                              background: allowed
                                ? 'rgba(239, 68, 68, 0.15)'      // 🔴 Rouge = Autorisé
                                : 'rgba(156, 163, 175, 0.15)',   // ⚪ Gris = Non autorisé
                              color: allowed
                                ? '#ef4444'                       // 🔴 Rouge = Autorisé
                                : '#9ca3af',                      // ⚪ Gris = Non autorisé
                              transition: 'all 0.2s',
                              textAlign: 'center',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'scale(1.02)';
                              e.currentTarget.style.boxShadow = allowed
                                ? '0 0 0 2px rgba(239, 68, 68, 0.3)'
                                : '0 0 0 2px rgba(156, 163, 175, 0.3)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)';
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                          >
                            {allowed ? '🔓 ' : '🔒 '}
                            {p.pseudo || '—'}
                          </button>
                        );
                      })}
                    {allProfiles.filter(p => p.id !== profile.id).length === 0 && (
                      <div style={{
                        fontSize: 13,
                        color: 'var(--muted)',
                        fontStyle: 'italic',
                        gridColumn: '1 / -1',
                        textAlign: 'center',
                        padding: '20px 0'
                      }}>
                        Aucun autre utilisateur en base.
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Section Sauvegarde et restauration (admin uniquement) */}
            {!adminMode && (
              <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', padding: 16 }}>
                Débloquez le mode admin pour gérer les sauvegardes complètes et le nettoyage des données.
              </div>
            )}
            {adminMode && (
              <section
                style={{
                  padding: 20,
                  background: 'rgba(74, 158, 255, 0.08)',
                  border: '1px solid rgba(74, 158, 255, 0.25)',
                  borderRadius: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 20,
                }}
              >
                <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text)' }}>💾 Sauvegarde et restauration</h4>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportFile}
                  style={{ display: 'none' }}
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Export */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      onClick={handleExportConfig}
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        background: 'rgba(74, 158, 255, 0.2)',
                        border: '1px solid rgba(74, 158, 255, 0.4)',
                        color: '#4a9eff',
                        borderRadius: 10,
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      <span style={{ fontSize: 18 }}>📤</span>
                      Exporter une copie
                    </button>
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, paddingLeft: 4 }}>
                      Télécharge un fichier JSON avec toute votre configuration.
                    </p>
                  </div>

                  {/* Import */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      onClick={handleImportClick}
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        background: 'rgba(74, 255, 158, 0.15)',
                        border: '1px solid rgba(74, 255, 158, 0.35)',
                        color: '#4aff9e',
                        borderRadius: 10,
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      <span style={{ fontSize: 18 }}>📥</span>
                      Restaurer depuis un fichier
                    </button>
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, paddingLeft: 4 }}>
                      Remplace vos données par le contenu d'une sauvegarde.
                    </p>
                  </div>

                  {/* Tout supprimer */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={handleCleanupAllData}
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        color: '#ef4444',
                        borderRadius: 10,
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      <span style={{ fontSize: 18 }}>🗑️</span>
                      Tout supprimer
                    </button>
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, paddingLeft: 4 }}>
                      Supprime toutes vos données (Supabase + local). Irréversible.
                    </p>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Footer avec bouton Fermer */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'flex-end',
            padding: '16px 28px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '12px 24px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Fermer
          </button>
        </div>

        <ConfirmModal
          isOpen={confirmState.isOpen}
          title={confirmState.title}
          message={confirmState.message}
          confirmText={confirmState.confirmText}
          cancelText={confirmState.cancelText}
          type={confirmState.type}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
