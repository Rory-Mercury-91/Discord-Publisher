import { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export default function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkForUpdate();
  }, []);

  async function checkForUpdate() {
    try {
      const update = await check();
      
      if (update?.available) {
        console.log('[Updater] New version available:', update.version);
        setUpdateAvailable(true);
        setUpdateVersion(update.version);
      } else {
        console.log('[Updater] Application is up to date');
      }
    } catch (err) {
      console.error('[Updater] Failed to check for updates:', err);
      // Don't show error to user, just log it
      // Auto-update is not critical for the app to function
    }
  }

  async function handleUpdate() {
    try {
      setIsInstalling(true);
      setError(null);

      console.log('[Updater] Starting update installation...');
      
      const update = await check();
      if (update?.available) {
        await update.downloadAndInstall((event) => {
          console.log('[Updater] Download progress:', event);
        });
        
        console.log('[Updater] Update installed successfully, relaunching...');
        await relaunch();
      }
    } catch (err: any) {
      console.error('[Updater] Failed to install update:', err);
      setError('Échec de l\'installation : ' + err.message);
      setIsInstalling(false);
    }
  }

  function handleDismiss() {
    setUpdateAvailable(false);
    // Check again in 24 hours
    setTimeout(checkForUpdate, 24 * 60 * 60 * 1000);
  }

  if (!updateAvailable) return null;

  return (
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
  );
}
