// Carte principale : nouvelle version disponible ou installation en cours
import UpdateElevationToggle from './UpdateElevationToggle';

type UpdateState = 'available' | 'installing';

interface UpdateAvailableCardProps {
  state: UpdateState;
  updateVersion: string | null;
  currentVersion: string | null;
  error: string | null;
  useElevation: boolean;
  onToggleElevation: () => void;
  onInstall: () => void;
  onDismiss: () => void;
}

export default function UpdateAvailableCard({
  state,
  updateVersion,
  currentVersion,
  error,
  useElevation,
  onToggleElevation,
  onInstall,
  onDismiss,
}: UpdateAvailableCardProps) {
  const isInstalling = state === 'installing';

  return (
    <div className="update-toast">
      <div className="update-toast__row">
        <div
          className={`update-toast__icon-wrap ${isInstalling ? 'update-toast__icon-wrap--info' : 'update-toast__icon-wrap--accent'}`}
        >
          {isInstalling ? '⏳' : '🚀'}
        </div>

        <div className="update-toast__body">
          <div className="update-toast__title">
            {state === 'available' && 'Nouvelle version disponible'}
            {state === 'installing' && 'Installation en cours'}
          </div>

          {updateVersion && state === 'available' && (
            <div className="update-toast__muted">
              Version <span className="update-toast__version-accent">{updateVersion}</span> disponible
              {currentVersion && <span> (actuelle : {currentVersion})</span>}
            </div>
          )}

          {state === 'installing' && (
            <div className="update-toast__muted">
              Téléchargement et installation de la version {updateVersion}...
              {useElevation && <div style={{ marginTop: 4 }}>🔐 Mode administrateur activé</div>}
            </div>
          )}

          {error && <div className="update-toast__error">{error}</div>}

          {state === 'available' && (
            <UpdateElevationToggle useElevation={useElevation} onToggle={onToggleElevation} />
          )}

          <div className="update-toast__actions">
            {state === 'available' && (
              <>
                <button type="button" onClick={onInstall} className="form-btn form-btn--primary">
                  🚀 Installer
                </button>
                <button type="button" onClick={onDismiss} className="form-btn form-btn--ghost">
                  Plus tard
                </button>
              </>
            )}
            {state === 'installing' && (
              <div className="update-toast__installing">
                <div className="update-toast__spinner" />
                Installation...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
