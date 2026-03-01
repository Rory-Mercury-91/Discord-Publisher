import { isTauri } from '../constants';

interface ListFormGoogleStepsProps {
  onOpenConnectWindow: () => void;
  onOpenInBrowser: () => void;
  onShowIframe: () => void;
}

export default function ListFormGoogleSteps({
  onOpenConnectWindow,
  onOpenInBrowser,
  onShowIframe,
}: ListFormGoogleStepsProps) {
  return (
    <div className="list-form-steps">
      <h2 className="list-form-steps__title">
        Première utilisation (formulaire Google)
      </h2>
      <div className="list-form-steps__cards">
        <section className="list-form-steps__card">
          <h3 className="list-form-steps__card-title">
            Étape 1 — Connectez-vous !
          </h3>
          <p className="list-form-steps__card-desc">
            Ouvrez la page de connexion Google dans une fenêtre de l'app pour
            vous connecter et récupérer les cookies. Une fois connecté,
            revenez ici et passez à l'étape 2.
          </p>
          {isTauri ? (
            <button
              type="button"
              className="list-form-steps__btn"
              onClick={onOpenConnectWindow}
            >
              Ouvrir la page de connexion Google
            </button>
          ) : (
            <button
              type="button"
              className="list-form-steps__btn"
              onClick={onOpenInBrowser}
            >
              Ouvrir dans le navigateur (connexion)
            </button>
          )}
        </section>
        <section className="list-form-steps__card">
          <h3 className="list-form-steps__card-title">
            Étape 2 — Ouvrir le formulaire en iframe
          </h3>
          <p className="list-form-steps__card-desc">
            Une fois connecté, affichez le formulaire dans cette page. Vous
            pourrez aussi utiliser la barre ci-dessus pour l'ouvrir dans une
            fenêtre ou dans le navigateur.
          </p>
          <button
            type="button"
            className="list-form-steps__btn"
            onClick={onShowIframe}
          >
            Afficher le formulaire dans la page
          </button>
        </section>
      </div>
    </div>
  );
}
