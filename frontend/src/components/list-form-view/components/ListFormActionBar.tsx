import { isTauri } from '../constants';

interface ListFormActionBarProps {
  onCollapse: () => void;
  isGoogle: boolean;
  tryIframeForGoogle: boolean;
  onConnectWindow: () => void;
  onToggleIframe: () => void;
  onOpenInAppWindow: () => void;
  onOpenInBrowser: () => void;
}

export default function ListFormActionBar({
  onCollapse,
  isGoogle,
  tryIframeForGoogle,
  onConnectWindow,
  onToggleIframe,
  onOpenInAppWindow,
  onOpenInBrowser,
}: ListFormActionBarProps) {
  const hintText = isGoogle
    ? tryIframeForGoogle
      ? "Si vous voyez une erreur 403, cliquez sur « Connectez-vous (si nécessaire) » ou « Ouvrir dans une fenêtre de l'app » pour ouvrir la page de connexion Google."
      : "Étape 1 : connectez-vous dans une fenêtre, puis Étape 2 : affichez le formulaire dans la page. Vous pouvez aussi ouvrir dans une fenêtre ou le navigateur."
    : "Si la page ne s'affiche pas correctement, ouvrez le formulaire dans votre navigateur.";

  return (
    <div className={`list-form-bar ${isGoogle ? 'list-form-bar--google' : ''}`}>
      <div className="list-form-bar__content">
        <span className="list-form-bar__hint">{hintText}</span>
        <div className="list-form-bar__actions">
          {isGoogle && tryIframeForGoogle && isTauri && (
            <button
              type="button"
              className="list-form-bar__btn list-form-bar__btn--secondary"
              onClick={onConnectWindow}
            >
              🔐 Connectez-vous (si nécessaire)
            </button>
          )}
          {isGoogle && (
            <button
              type="button"
              className={`list-form-bar__btn list-form-bar__btn--secondary ${tryIframeForGoogle ? 'list-form-bar__btn--active' : ''}`}
              onClick={onToggleIframe}
            >
              {tryIframeForGoogle ? "↩ Masquer l'iframe" : "📄 Afficher dans la page (iframe)"}
            </button>
          )}
          {isTauri && (
            <button
              type="button"
              className="list-form-bar__btn list-form-bar__btn--primary"
              onClick={onOpenInAppWindow}
            >
              📋 Ouvrir dans une fenêtre de l'app
            </button>
          )}
          <button
            type="button"
            className="list-form-bar__btn list-form-bar__btn--accent"
            onClick={onOpenInBrowser}
          >
            🔗 Ouvrir dans le navigateur
          </button>
        </div>
      </div>
      <div className="list-form-bar__toggle-strip">
        <button
          type="button"
          className="list-form-bar__toggle-btn"
          onClick={onCollapse}
          title="Masquer la barre d'outils"
        >
          ▼ Masquer la barre d'outils
        </button>
      </div>
    </div>
  );
}
