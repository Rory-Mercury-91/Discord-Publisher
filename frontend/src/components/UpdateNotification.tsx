import { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';

export default function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessBadge, setShowSuccessBadge] = useState(false);
  const [updatedVersion, setUpdatedVersion] = useState<string | null>(null);

  useEffect(() => {
    // Vérifier si on vient de se mettre à jour
    const justUpdated = localStorage.getItem('justUpdated');
    if (justUpdated) {
      const versionInfo = JSON.parse(justUpdated);
      console.log('[Updater] 🎉 Update successful! Now running version:', versionInfo.version);
      setShowSuccessBadge(true);
      setUpdatedVersion(versionInfo.version);
      localStorage.removeItem('justUpdated');
      
      // Masquer le badge après 5 secondes
      setTimeout(() => {
        setShowSuccessBadge(false);
      }, 5000);
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
      console.log('[Updater] 📍 Endpoint:', 'https://github.com/Rory-Mercury-91/Discord-Publisher/releases/latest/download/latest.json');
      console.log('[Updater] 🔑 Public key embedded in this binary for verification:');
      console.log('[Updater] 🔑 dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDNEODU2NzIxRjBGOENGMjYKUldRbXovandJV2VGUGRqZksvMlZtelRZVnpRNGJLdTZ2ZVVMWXo0R2N4Z2JJclJESm9mSlJSVXAK');
      console.log('[Updater] 🔑 Key ID (decoded): RWQmz/jwIWeF...');
      
      const update = await check();
      
      console.log('[Updater] 🔍 Update check result:', update);
      
      if (update) {
        console.log(`[Updater] ✨ New version available: ${update.version} (current: ${update.currentVersion})`);
        console.log('[Updater] 📦 Update details:', {
          version: update.version,
          currentVersion: update.currentVersion,
          date: update.date,
          body: update.body
        });
        setUpdateAvailable(true);
        setUpdateVersion(update.version);
      } else {
        console.log('[Updater] ✅ Application is up to date');
      }
    } catch (err) {
      console.error('[Updater] ❌ Failed to check for updates:', err);
      console.error('[Updater] ❌ Error details:', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
      // Don't show error to user, just log it
      // Auto-update is not critical for the app to function
    }
  }

  async function handleUpdate() {
    try {
      setIsInstalling(true);
      setError(null);

      console.log('[Updater] 📥 Starting update download and installation...');
      
      const update = await check();
      console.log('[Updater] 🔍 Update object before download:', update);
      
      if (!update) {
        throw new Error('No update available');
      }
      
      let downloaded = 0;
      let contentLength = 0;
      
      console.log('[Updater] 🚀 Calling downloadAndInstall()...');
      
      await update.downloadAndInstall((event) => {
        console.log('[Updater] 📡 Event received:', event.event);
        
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            console.log(`[Updater] 📦 Download size: ${(contentLength / 1024 / 1024).toFixed(2)} MB`);
            console.log(`[Updater] 📦 Content length: ${contentLength} bytes`);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            const progress = contentLength > 0 ? (downloaded / contentLength) * 100 : 0;
            console.log(`[Updater] ⏳ Progress: ${Math.round(progress)}% (${downloaded}/${contentLength} bytes)`);
            break;
          case 'Finished':
            console.log('[Updater] ✅ Download complete');
            console.log(`[Updater] 📊 Total downloaded: ${(downloaded / 1024 / 1024).toFixed(2)} MB`);
            break;
        }
      });
      
      console.log('[Updater] 🔄 Update installed successfully, relaunching...');
      
      // Marquer qu'on vient de se mettre à jour pour afficher le badge de succès
      localStorage.setItem('justUpdated', JSON.stringify({ 
        version: update.version,
        timestamp: Date.now()
      }));
      
      await relaunch();
    } catch (err: any) {
      console.error('[Updater] ❌ Failed to install update:', err);
      console.error('[Updater] ❌ Error type:', typeof err);
      
      // Log complet de l'erreur
      if (typeof err === 'string') {
        console.error('[Updater] ❌ Error string:', err);
      } else if (err instanceof Error) {
        console.error('[Updater] ❌ Error object:', {
          message: err.message,
          stack: err.stack,
          name: err.name,
          cause: err.cause
        });
      } else {
        console.error('[Updater] ❌ Error (unknown type):', JSON.stringify(err));
      }
      
      const errorMessage = typeof err === 'string' ? err : (err?.message || 'Erreur inconnue');
      setError('Échec de l\'installation : ' + errorMessage);
      setIsInstalling(false);
    }
  }

  function handleDismiss() {
    setUpdateAvailable(false);
    // Check again in 24 hours
    setTimeout(checkForUpdate, 24 * 60 * 60 * 1000);
  }

  if (!updateAvailable && !showSuccessBadge) return null;

  return (
    <>
      {/* Badge de succès après mise à jour */}
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
                from {
                  transform: translateX(400px);
                  opacity: 0;
                }
                to {
                  transform: translateX(0);
                  opacity: 1;
                }
              }
              @keyframes fadeOut {
                from {
                  opacity: 1;
                  transform: translateX(0);
                }
                to {
                  opacity: 0;
                  transform: translateX(400px);
                }
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

      {/* Notification de mise à jour disponible */}
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
          <style>
            {`
              @keyframes slideIn {
                from {
                  transform: translateX(400px);
                  opacity: 0;
                }
                to {
                  transform: translateX(0);
                  opacity: 1;
                }
              }
            `}
          </style>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ fontSize: 32 }}>🚀</div>
        
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            Nouvelle version disponible !
          </div>
          
          {updateVersion && (
            <div style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.9)', marginBottom: 12 }}>
              Version {updateVersion} est prête à être installée
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
              {isInstalling ? '⏳ Installation...' : '📥 Installer'}
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
