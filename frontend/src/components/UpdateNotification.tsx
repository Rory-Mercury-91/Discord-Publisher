import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { check } from '@tauri-apps/plugin-updater';
import { useEffect, useState } from 'react';

type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'updated';

export default function UpdateNotification() {
  const [state, setState] = useState<UpdateState>('idle');
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadedPath, setDownloadedPath] = useState<string | null>(null);

  // 🆕 Lire le mode d'installation automatique
  const [autoInstall, setAutoInstall] = useState<boolean>(() => {
    return localStorage.getItem('autoInstallUpdates') === 'true';
  });

  useEffect(() => {
    // Vérifier si on vient de se mettre à jour
    const justUpdated = localStorage.getItem('justUpdated');
    if (justUpdated) {
      const versionInfo = JSON.parse(justUpdated);
      console.log('[Updater] 🎉 Mise à jour réussie ! Maintenant, on utilise la version:', versionInfo.version);
      setState('updated');
      setUpdateVersion(versionInfo.version);
      localStorage.removeItem('justUpdated');

      setTimeout(() => setState('idle'), 5000);
    }

    // Vérifier au montage après 3 secondes
    const timeout = setTimeout(async () => {
      const version = await getVersion();
      setCurrentVersion(version);
      console.log('[Updater] 📱 Version actuelle de l\'application:', version);
      checkForUpdate();
    }, 3000);

    return () => clearTimeout(timeout);
  }, []);

  async function checkForUpdate() {
    try {
      setState('checking');
      console.log('[Updater] 🔍 Vérification des mises à jour...');

      const update = await check();

      if (update) {
        console.log(`[Updater] ✨ Nouvelle version disponible: ${update.version} (actuelle: ${update.currentVersion})`);
        setState('available');
        setUpdateVersion(update.version);
        setCurrentVersion(update.currentVersion);
      } else {
        console.log('[Updater] ✅ L\'application est à jour');
        setState('idle');
      }
    } catch (err) {
      console.error('[Updater] ❌ Échec de la vérification des mises à jour:', err);
      setState('idle');
    }
  }

  async function handleDownload() {
    try {
      setState('downloading');
      setError(null);

      console.log('[Updater] 📥 Démarrage du processus de téléchargement...');

      const path = await invoke<string>('download_update');

      console.log('[Updater] ✅ Téléchargement terminé:', path);
      setDownloadedPath(path);
      setState('downloaded');

      // 🆕 Si mode auto-install activé, installer automatiquement
      if (autoInstall) {
        console.log('[Updater] ⚡ Mode auto-install activé, installation automatique...');
        // Attendre 500ms pour que l'UI se mette à jour
        await new Promise(resolve => setTimeout(resolve, 500));
        await handleInstall();
      }

    } catch (err: any) {
      console.error('[Updater] ❌ Échec du téléchargement de la mise à jour:', err);

      const errorMessage = typeof err === 'string' ? err : (err?.message || 'Erreur inconnue');
      setError('Échec du téléchargement : ' + errorMessage);
      setState('available');
    }
  }

  async function handleInstall() {
    try {
      setState('installing');
      setError(null);

      console.log('[Updater] 🚀 Démarrage du processus d\'installation...');

      // Marquer qu'on attend une mise à jour
      localStorage.setItem('pendingUpdate', JSON.stringify({
        version: updateVersion,
        timestamp: Date.now()
      }));

      // Lancer l'installation
      await invoke('install_downloaded_update');

      console.log('[Updater] ✅ Installation démarrée, l\'application va se fermer...');

    } catch (err: any) {
      console.error('[Updater] ❌ Échec de l\'installation de la mise à jour:', err);

      const errorMessage = typeof err === 'string' ? err : (err?.message || 'Erreur inconnue');
      setError('Échec de l\'installation : ' + errorMessage);
      setState('downloaded');
      localStorage.removeItem('pendingUpdate');
    }
  }

  function handleDismiss() {
    setState('idle');
    setError(null);
    // Re-vérifier dans 24h
    setTimeout(checkForUpdate, 24 * 60 * 60 * 1000);
  }

  // Ne rien afficher si idle ou checking
  if (state === 'idle' || state === 'checking') return null;

  // Badge de succès après mise à jour
  if (state === 'updated') {
    return (
      <div
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          zIndex: 10001,
          background: 'var(--panel)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          borderRadius: 8,
          padding: '16px 20px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          maxWidth: 400,
          animation: 'slideIn 0.3s ease-out, fadeOut 0.5s ease-out 4.5s forwards',
        }}
      >
        <style>
          {`
            @keyframes slideIn {
              from { transform: translateX(400px); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
            @keyframes fadeOut {
              from { opacity: 1; transform: translateX(0); }
              to { opacity: 0; transform: translateX(400px); }
            }
          `}
        </style>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            fontSize: 24,
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(34, 197, 94, 0.15)',
            borderRadius: 6,
            flexShrink: 0
          }}>
            ✅
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--text)',
              marginBottom: 4
            }}>
              Mise à jour réussie !
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Version {updateVersion} installée avec succès
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Notification principale
  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 10000,
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '16px 20px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        maxWidth: 420,
        animation: 'slideIn 0.3s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Icône */}
        <div style={{
          fontSize: 24,
          width: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: state === 'downloading' || state === 'installing'
            ? 'rgba(59, 130, 246, 0.15)'
            : 'rgba(99, 102, 241, 0.15)',
          borderRadius: 6,
          flexShrink: 0
        }}>
          {state === 'downloading' || state === 'installing' ? '⏳' : '🚀'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Titre */}
          <div style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--text)',
            marginBottom: 6
          }}>
            {state === 'available' && 'Nouvelle version disponible'}
            {state === 'downloading' && 'Téléchargement en cours'}
            {state === 'downloaded' && (autoInstall ? 'Installation automatique...' : 'Mise à jour prête')}
            {state === 'installing' && 'Installation en cours'}
          </div>

          {/* Informations de version */}
          {updateVersion && state === 'available' && (
            <div style={{
              fontSize: 13,
              color: 'var(--muted)',
              marginBottom: 12
            }}>
              Version <span style={{
                fontWeight: 600,
                color: 'var(--accent)'
              }}>{updateVersion}</span> est disponible
              {currentVersion && (
                <span> (actuelle : {currentVersion})</span>
              )}
            </div>
          )}

          {state === 'downloading' && (
            <div style={{
              fontSize: 13,
              color: 'var(--muted)',
              marginBottom: 12
            }}>
              Téléchargement de la version {updateVersion}...
              {autoInstall && (
                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--accent)' }}>
                  ⚡ Installation automatique après téléchargement
                </div>
              )}
            </div>
          )}

          {state === 'downloaded' && !autoInstall && (
            <div style={{
              fontSize: 13,
              color: 'var(--muted)',
              marginBottom: 12
            }}>
              La version {updateVersion} a été téléchargée et est prête à être installée
            </div>
          )}

          {state === 'installing' && (
            <div style={{
              fontSize: 13,
              color: 'var(--muted)',
              marginBottom: 12
            }}>
              L'installation va démarrer, l'application va se fermer...
            </div>
          )}

          {/* Message d'erreur */}
          {error && (
            <div style={{
              fontSize: 12,
              color: 'var(--error)',
              background: 'rgba(239, 68, 68, 0.1)',
              padding: '8px 12px',
              borderRadius: 6,
              marginBottom: 12,
              border: '1px solid rgba(239, 68, 68, 0.2)'
            }}>
              {error}
            </div>
          )}

          {/* Boutons d'action */}
          <div style={{ display: 'flex', gap: 8 }}>
            {state === 'available' && (
              <>
                <button
                  onClick={handleDownload}
                  style={{
                    flex: 1,
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--accent)',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    height: 36
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '0.9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                >
                  {autoInstall ? '⚡ Télécharger & Installer' : '📥 Télécharger'}
                </button>

                <button
                  onClick={handleDismiss}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text)',
                    fontWeight: 500,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    height: 36
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  Plus tard
                </button>
              </>
            )}

            {state === 'downloading' && (
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '8px 16px',
                fontSize: 13,
                color: 'var(--muted)',
                height: 36
              }}>
                <div className="spinner" style={{
                  width: 14,
                  height: 14,
                  border: '2px solid var(--border)',
                  borderTopColor: 'var(--accent)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }} />
                <style>
                  {`
                    @keyframes spin {
                      to { transform: rotate(360deg); }
                    }
                  `}
                </style>
                {autoInstall ? 'Téléchargement puis installation...' : 'Téléchargement...'}
              </div>
            )}

            {/* 🆕 Mode manuel : afficher les boutons "Installer maintenant" et "Plus tard" */}
            {state === 'downloaded' && !autoInstall && (
              <>
                <button
                  onClick={handleInstall}
                  style={{
                    flex: 1,
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--accent)',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    height: 36
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '0.9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                >
                  🚀 Installer maintenant
                </button>

                <button
                  onClick={handleDismiss}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text)',
                    fontWeight: 500,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    height: 36
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  Plus tard
                </button>
              </>
            )}

            {/* 🆕 Mode auto : pas de boutons pendant l'installation, spinner automatique */}
            {(state === 'installing' || (state === 'downloaded' && autoInstall)) && (
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '8px 16px',
                fontSize: 13,
                color: 'var(--muted)',
                height: 36
              }}>
                <div className="spinner" style={{
                  width: 14,
                  height: 14,
                  border: '2px solid var(--border)',
                  borderTopColor: 'var(--accent)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }} />
                Installation...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
