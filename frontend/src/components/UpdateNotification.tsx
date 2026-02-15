import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { check } from '@tauri-apps/plugin-updater';
import { useEffect, useState } from 'react';

type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'installing'
  | 'updated';

export default function UpdateNotification() {
  const [state, setState] = useState<UpdateState>('idle');
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useElevation, setUseElevation] = useState<boolean>(false);

  useEffect(() => {
    // Vérifier si on vient de se mettre à jour
    const justUpdated = localStorage.getItem('justUpdated');
    if (justUpdated) {
      const versionInfo = JSON.parse(justUpdated);
      console.log("[Updater] 🎉 Mise à jour réussie !", versionInfo.version);
      setState('updated');
      setUpdateVersion(versionInfo.version);
      localStorage.removeItem('justUpdated');
      setTimeout(() => setState('idle'), 5000);
    }

    // Vérifier au montage après 3 secondes
    const timeout = setTimeout(async () => {
      const version = await getVersion();
      setCurrentVersion(version);
      console.log("[Updater] 📱 Version actuelle:", version);
      checkForUpdate();
    }, 3000);

    return () => clearTimeout(timeout);
  }, []);

  async function checkForUpdate() {
    try {
      setState('checking');
      console.log("[Updater] 🔍 Vérification des mises à jour...");

      const update = await check();

      if (update) {
        console.log(`[Updater] ✨ Nouvelle version: ${update.version}`);
        setState('available');
        setUpdateVersion(update.version);
        setCurrentVersion(update.currentVersion);
      } else {
        console.log("[Updater] ✅ Application à jour");
        setState('idle');
      }
    } catch (err: any) {
      console.error("[Updater] ❌ Erreur vérification:", err);

      // Messages d'erreur plus explicites
      if (err.message?.includes('error sending request')) {
        setError('Impossible de vérifier les mises à jour. Vérifiez votre connexion Internet.');
      } else if (err.message?.includes('signature')) {
        setError('Erreur de signature de la mise à jour. Contactez le support.');
      } else {
        setError(`Erreur: ${err.message || err}`);
      }

      setState('idle');
    }
  }

  async function handleInstall() {
    try {
      setState('installing');
      setError(null);

      console.log("[Updater] 🚀 Installation...");
      console.log("[Updater] 🔐 Mode:", useElevation ? "AVEC UAC" : "SANS UAC");

      // Marquer la mise à jour en attente
      localStorage.setItem('pendingUpdate', JSON.stringify({
        version: updateVersion,
        timestamp: Date.now()
      }));

      // Appeler la nouvelle commande unifiée
      await invoke('download_and_install_update', { useElevation });

      console.log("[Updater] ✅ Installation lancée");

    } catch (err: any) {
      console.error("[Updater] ❌ Erreur installation:", err);

      const errorMessage = typeof err === 'string' ? err : (err?.message || 'Erreur inconnue');
      setError(errorMessage);
      setState('available');
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

  // Badge de succès
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
              from { opacity: 1; }
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
              Version {updateVersion} installée
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
        <div style={{
          fontSize: 24,
          width: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: state === 'installing'
            ? 'rgba(59, 130, 246, 0.15)'
            : 'rgba(99, 102, 241, 0.15)',
          borderRadius: 6,
          flexShrink: 0
        }}>
          {state === 'installing' ? '⏳' : '🚀'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--text)',
            marginBottom: 6
          }}>
            {state === 'available' && 'Nouvelle version disponible'}
            {state === 'installing' && 'Installation en cours'}
          </div>

          {updateVersion && state === 'available' && (
            <div style={{
              fontSize: 13,
              color: 'var(--muted)',
              marginBottom: 12
            }}>
              Version <span style={{
                fontWeight: 600,
                color: 'var(--accent)'
              }}>{updateVersion}</span> disponible
              {currentVersion && <span> (actuelle : {currentVersion})</span>}
            </div>
          )}

          {state === 'installing' && (
            <div style={{
              fontSize: 13,
              color: 'var(--muted)',
              marginBottom: 12
            }}>
              Téléchargement et installation de la version {updateVersion}...
              {useElevation && <div style={{ marginTop: 4 }}>🔐 Mode administrateur activé</div>}
            </div>
          )}

          {error && (
            <div style={{
              fontSize: 12,
              color: 'var(--error)',
              background: 'rgba(239, 68, 68, 0.1)',
              padding: '8px 12px',
              borderRadius: 6,
              marginBottom: 12,
              border: '1px solid rgba(239, 68, 68, 0.2)',
              wordBreak: 'break-word'
            }}>
              {error}
            </div>
          )}

          {/* Toggle élévation (uniquement en mode 'available') */}
          {state === 'available' && (
            <div style={{
              padding: '10px 12px',
              background: useElevation ? 'rgba(99, 102, 241, 0.08)' : 'rgba(100, 116, 139, 0.08)',
              borderRadius: 6,
              marginBottom: 12,
              border: useElevation ? '1px solid rgba(99, 102, 241, 0.15)' : '1px solid rgba(100, 116, 139, 0.15)'
            }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: 40,
                    height: 22,
                    borderRadius: 11,
                    background: useElevation ? 'var(--accent)' : 'var(--border)',
                    transition: 'background 0.2s ease',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                  onClick={() => setUseElevation(v => !v)}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 3,
                      left: useElevation ? 21 : 3,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text)',
                    marginBottom: 2,
                  }}>
                    🔐 Mode administrateur (UAC)
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--muted)',
                    lineHeight: 1.3,
                  }}>
                    {useElevation
                      ? '⚠️ Installation avec droits admin'
                      : '✅ Installation standard (recommandé)'}
                  </div>
                </div>
              </label>

              <div style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid var(--border)',
                fontSize: 11,
                color: 'var(--muted)',
                lineHeight: 1.4
              }}>
                💡 <strong>Quand activer ?</strong><br />
                • Compte restreint : laissez désactivé<br />
                • Installation système : activez
              </div>
            </div>
          )}

          {/* Boutons d'action */}
          <div style={{ display: 'flex', gap: 8 }}>
            {state === 'available' && (
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
                    transition: 'opacity 0.2s',
                    height: 36
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                  🚀 Installer
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
                    transition: 'background 0.2s',
                    height: 36
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  Plus tard
                </button>
              </>
            )}

            {state === 'installing' && (
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
                <div style={{
                  width: 14,
                  height: 14,
                  border: '2px solid var(--border)',
                  borderTopColor: 'var(--accent)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }} />
                <style>
                  {`@keyframes spin { to { transform: rotate(360deg); } }`}
                </style>
                Installation...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
