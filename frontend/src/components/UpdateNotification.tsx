import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { useEffect, useState } from 'react';

export default function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessBadge, setShowSuccessBadge] = useState(false);
  const [updatedVersion, setUpdatedVersion] = useState<string | null>(null);
  const [isNonStandardInstall, setIsNonStandardInstall] = useState(false);

  useEffect(() => {
    const checkInstallLocation = async () => {
      try {
        const appPath = await invoke<string>('get_app_path');
        console.log('[Updater] 📍 Install path:', appPath);

        // Vérifier si l'installation est dans un emplacement non-standard
        const isStandard = appPath.toLowerCase().includes('\\appdata\\') ||
          appPath.toLowerCase().includes('\\program files');

        setIsNonStandardInstall(!isStandard);

        if (!isStandard) {
          console.warn('[Updater] ⚠️ Application installée dans un emplacement non-standard');
          console.warn('[Updater] ⚠️ Les mises à jour automatiques peuvent ne pas fonctionner');
        }

        // Sauvegarder le chemin
        await invoke('save_install_path', { path: appPath });
        console.log('[Updater] ✅ Install path saved');

      } catch (err) {
        console.error('[Updater] ❌ Failed to check install location:', err);
      }
    };

    checkInstallLocation();

    // Vérifier si on vient de se mettre à jour
    const justUpdated = localStorage.getItem('justUpdated');
    if (justUpdated) {
      const versionInfo = JSON.parse(justUpdated);
      console.log('[Updater] 🎉 Update successful! Now running version:', versionInfo.version);
      setShowSuccessBadge(true);
      setUpdatedVersion(versionInfo.version);
      localStorage.removeItem('justUpdated');

      setTimeout(() => setShowSuccessBadge(false), 5000);
    }

    // Vérifier au montage après 3 secondes
    const timeout = setTimeout(async () => {
      const version = await getVersion();
      console.log('[Updater] 📱 Current app version:', version);
      checkForUpdate();
    }, 3000);

    return () => clearTimeout(timeout);
  }, []);

  async function checkForUpdate() {
    try {
      console.log('[Updater] 🔍 Checking for updates...');

      const update = await check();

      if (update) {
        console.log(`[Updater] ✨ New version available: ${update.version} (current: ${update.currentVersion})`);
        setUpdateAvailable(true);
        setUpdateVersion(update.version);
      } else {
        console.log('[Updater] ✅ Application is up to date');
      }
    } catch (err) {
      console.error('[Updater] ❌ Failed to check for updates:', err);
    }
  }

  async function handleUpdate() {
    if (isNonStandardInstall) {
      // Pour les installations non-standard, proposer le téléchargement manuel
      handleManualDownload();
      return;
    }

    try {
      setIsInstalling(true);
      setError(null);

      console.log('[Updater] 📥 Starting automatic update...');

      const update = await check();

      if (!update) {
        throw new Error('No update available');
      }

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            console.log(`[Updater] 📦 Download size: ${(contentLength / 1024 / 1024).toFixed(2)} MB`);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            const progress = contentLength > 0 ? (downloaded / contentLength) * 100 : 0;
            console.log(`[Updater] ⏳ Progress: ${Math.round(progress)}%`);
            break;
          case 'Finished':
            console.log('[Updater] ✅ Download complete');
            break;
        }
      });

      console.log('[Updater] 🔄 Update installed successfully, relaunching...');

      localStorage.setItem('justUpdated', JSON.stringify({
        version: update.version,
        timestamp: Date.now()
      }));

      await relaunch();
    } catch (err: any) {
      console.error('[Updater] ❌ Failed to install update:', err);

      const errorMessage = typeof err === 'string' ? err : (err?.message || 'Erreur inconnue');
      setError('Échec de l\'installation automatique : ' + errorMessage);
      setIsInstalling(false);
    }
  }

  function handleManualDownload() {
    const downloadUrl = 'https://github.com/Rory-Mercury-91/Discord-Publisher/releases/latest';

    // Ouvrir la page de téléchargement
    invoke('open_url', { url: downloadUrl }).catch(console.error);

    setError(null);
    setUpdateAvailable(false);

    // Afficher un message d'information
    console.log('[Updater] 📥 Téléchargement manuel requis - ouverture de la page GitHub');
  }

  function handleDismiss() {
    setUpdateAvailable(false);
    setTimeout(checkForUpdate, 24 * 60 * 60 * 1000);
  }

  if (!updateAvailable && !showSuccessBadge) return null;

  return (
    <>
      {showSuccessBadge && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 10001,
            background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
            borderRadius: 12,
            padding: 20,
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
            <div style={{ fontSize: 32 }}>✅</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                Mise à jour réussie !
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.95)' }}>
                Version {updatedVersion} installée avec succès
              </div>
            </div>
          </div>
        </div>
      )}

      {updateAvailable && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 10000,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: 12,
            padding: 20,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            maxWidth: 400,
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ fontSize: 32 }}>🚀</div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
                Nouvelle version disponible !
              </div>

              {updateVersion && (
                <div style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.9)', marginBottom: 12 }}>
                  Version {updateVersion} est disponible
                  {isNonStandardInstall && (
                    <div style={{
                      marginTop: 8,
                      fontSize: 12,
                      background: 'rgba(255, 255, 255, 0.15)',
                      padding: '6px 10px',
                      borderRadius: 6
                    }}>
                      ⚠️ Installation personnalisée détectée<br />
                      Téléchargement manuel recommandé
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div style={{
                  fontSize: 12,
                  color: '#ff6b6b',
                  background: 'rgba(255, 107, 107, 0.1)',
                  padding: '8px 12px',
                  borderRadius: 6,
                  marginBottom: 12
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleUpdate}
                  disabled={isInstalling}
                  style={{
                    flex: 1,
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#fff',
                    color: '#667eea',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: isInstalling ? 'not-allowed' : 'pointer',
                    opacity: isInstalling ? 0.6 : 1,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {isInstalling
                    ? '⏳ Installation...'
                    : isNonStandardInstall
                      ? '📥 Télécharger'
                      : '📥 Installer'}
                </button>

                {!isInstalling && (
                  <button
                    onClick={handleDismiss}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      background: 'transparent',
                      color: '#fff',
                      fontWeight: 500,
                      fontSize: 13,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    Plus tard
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
