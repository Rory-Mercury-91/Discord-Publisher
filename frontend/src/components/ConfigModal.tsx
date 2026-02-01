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
}

type ProfilePublic = Pick<Profile, 'id' | 'pseudo' | 'discord_id'>;

export default function ConfigModal({ onClose, adminMode = false }: ConfigModalProps) {
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
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('apiUrl') || localStorage.getItem('apiBase') || '');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('apiKey') || '');

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
      console.error('Erreur application état fenêtre:', e);
    }
  };

  const handleSave = async () => {
    localStorage.setItem('apiKey', apiKey);
    if (adminMode) {
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
    }

    // ✅ NOUVEAU : Sauvegarder l'état de fenêtre via Tauri
    try {
      // @ts-ignore - Tauri API
      if (window.__TAURI__) {
        const { invoke } = window.__TAURI__.core;
        await invoke('save_window_state', { state: windowState });
        showToast("Configuration enregistrée !", "success");
      } else {
        // Fallback pour développement web
        localStorage.setItem('windowState', windowState);
        showToast("Configuration enregistrée !", "success");
      }
    } catch (e) {
      console.error('Erreur sauvegarde état fenêtre:', e);
      showToast("Configuration enregistrée (erreur état fenêtre)", "warning");
    }
    onClose?.();
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
        windowState, // ✅ Inclure l'état de fenêtre dans l'export
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

      setApiUrl(localStorage.getItem('apiUrl') || localStorage.getItem('apiBase') || '');
      setApiKey(localStorage.getItem('apiKey') || '');

      // ✅ Restaurer l'état de fenêtre si présent
      if (data.windowState) {
        setWindowState(data.windowState);
        localStorage.setItem('windowState', data.windowState);
        void applyWindowStateLive(data.windowState);
      }

      showToast('Sauvegarde importée avec succès !', 'success');
    } catch (err: any) {
      console.error(err?.message || err);
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
          // ✅ Même gabarit que InstructionsManagerModal
          maxWidth: '920px',
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
          {/* Colonne gauche : API + Droits d'édition */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Section API — toujours visible */}
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
              <h4 style={{ margin: 0, fontSize: '1rem' }}>🌐 Configuration</h4>

              {adminMode && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'block', fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>
                    URL de l'API (admin)
                  </label>
                  <input
                    type="text"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="https://votre-app.koyeb.app"
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
                    💡 URL de base du service (sans /api). Réservée à l'admin ; les utilisateurs utilisent l'URL définie ici.
                  </p>
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
                  🔒 Clé de sécurité pour publier (chaque utilisateur saisit la sienne).
                </p>
              </div>
            </section>

            {/* Section Droits d'édition (section utilisateur) : qui peut modifier mes posts */}
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
                  Autorisez ou révoquez le droit d'édition de vos publications pour les autres utilisateurs.
                </p>
                {editorsLoading ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Chargement…</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                    {allProfiles
                      .filter(p => p.id !== profile.id)
                      .map(p => {
                        const allowed = allowedEditorIds.has(p.id);
                        return (
                          <div
                            key={p.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 12,
                              padding: '10px 12px',
                              background: 'rgba(255,255,255,0.03)',
                              borderRadius: 10,
                              border: '1px solid var(--border)',
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{p.pseudo || '—'}</div>
                              <div style={{ fontSize: 12, color: 'var(--muted)' }}>ID Discord : {p.discord_id || '—'}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleEditor(p.id, allowed)}
                              title={allowed ? 'Révoquer' : 'Autoriser'}
                              style={{
                                padding: '6px 14px',
                                borderRadius: 8,
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 600,
                                background: allowed ? 'rgba(239, 68, 68, 0.2)' : 'var(--accent)',
                                color: allowed ? 'var(--error, #ef4444)' : '#fff',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {allowed ? 'Révoquer' : 'Autoriser'}
                            </button>
                          </div>
                        );
                      })}
                    {allProfiles.filter(p => p.id !== profile.id).length === 0 && (
                      <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>
                        Aucun autre utilisateur en base.
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            </div>

          {/* Colonne droite : Fenêtre (tous les utilisateurs) + Sauvegarde (mode admin uniquement) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* État de la fenêtre : visible pour tous les utilisateurs */}
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
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <h4 style={{ margin: 0, fontSize: '1rem' }}>🪟 État de la fenêtre</h4>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>Appliqué immédiatement et au prochain démarrage</span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 10,
                }}
              >
                {(['normal', 'maximized', 'fullscreen', 'minimized'] as WindowState[]).map((state) => {
                  const labels = {
                    normal: '📐 Normal',
                    maximized: '⬜ Maximisé',
                    fullscreen: '🖥️ Plein écran',
                    minimized: '➖ Minimisé',
                  };
                  const active = windowState === state;
                  return (
                    <button
                      key={state}
                      type="button"
                      onClick={async () => {
                        setWindowState(state);
                        await applyWindowStateLive(state);
                        localStorage.setItem('windowState', state);
                        try {
                          if (window.__TAURI__) {
                            const { invoke } = window.__TAURI__.core;
                            await invoke('save_window_state', { state });
                          }
                        } catch (_e) { /* ignorer */ }
                      }}
                      style={{
                        padding: '14px 12px',
                        borderRadius: 10,
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                        cursor: 'pointer',
                        background: active ? 'var(--accent)' : 'rgba(255,255,255,0.03)',
                        color: active ? '#fff' : 'var(--text)',
                        fontSize: 13,
                        fontWeight: active ? 700 : 500,
                        transition: 'all 0.15s',
                      }}
                    >
                      {labels[state]}
                    </button>
                  );
                })}
              </div>
            </section>

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
                  <button
                    onClick={handleExportConfig}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      background: 'rgba(74, 158, 255, 0.15)',
                      border: '1px solid rgba(74, 158, 255, 0.35)',
                      color: 'var(--text)',
                      borderRadius: 10,
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 600,
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 20 }}>📤</span>
                    <div>
                      <div style={{ fontWeight: 600 }}>Exporter une copie</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>Télécharge un fichier JSON avec tout : config, templates, tags, instructions, historique.</div>
                    </div>
                  </button>
                  <button
                    onClick={handleImportClick}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      background: 'rgba(74, 255, 158, 0.1)',
                      border: '1px solid rgba(74, 255, 158, 0.3)',
                      color: 'var(--text)',
                      borderRadius: 10,
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 600,
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 20 }}>📥</span>
                    <div>
                      <div style={{ fontWeight: 600 }}>Restaurer depuis un fichier</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>Remplace tes données par le contenu d’un fichier de sauvegarde (export précédent).</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={handleCleanupAllData}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      color: 'var(--error, #ef4444)',
                      borderRadius: 10,
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 600,
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 20 }}>🗑️</span>
                    <div>
                      <div style={{ fontWeight: 600 }}>Tout supprimer</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>Supprime toutes les données (Supabase + local). Irréversible.</div>
                    </div>
                  </button>
                </div>
              </section>
            )}
          </div>

          {/* Actions principales (pleine largeur) */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
              paddingTop: 8,
              borderTop: '1px solid var(--border)',
              gridColumn: '1 / -1',
            }}
          >
            <button
              type="button"
              onClick={handleSave}
              style={{
                padding: '12px 24px',
                borderRadius: 10,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              💾 Enregistrer
            </button>
          </div>
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
