// frontend\src\components\HelpCenter\components\FormulaireHelp.tsx
import { useState } from 'react';
import scriptTampermonkeyRaw from '../../../assets/DiscordPublisherDataExtractor.js?raw';
import { tauriAPI } from '../../../lib/tauri-api';
import { useToast } from '../../ToastProvider';

export default function FormulaireHelp() {
  const [showGuide, setShowGuide] = useState(false);
  const { showToast } = useToast();

  const handleDownloadScript = () => {
    const blob = new Blob([scriptTampermonkeyRaw], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'DiscordPublisherDataExtractor.user.js';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Script Tampermonkey téléchargé avec succès', 'success');
  };

  return (
    <div className="help-content-inner">
      <section className="help-intro">
        <h4 className="help-section__title">📝 Remplir le formulaire de publication</h4>
        <p>
          L'éditeur de contenu permet de préparer un post Discord (traduction, annonce) avant de le publier. Le contenu affiché dépend des informations saisies dans le template (modifiable depuis la modale « Gestion des templates ») : seuls les champs utilisés par ce template sont actifs ; les autres restent désactivés.
        </p>
      </section>

      <section className="help-section help-section--info">
        <h4 className="help-section__title">Ordre recommandé</h4>
        <ol>
          <li><strong>Titre du post</strong> : généré automatiquement à partir des champs « Nom du jeu » et « Version du jeu ». Champ en lecture seule.</li>
          <li><strong>Tags</strong> : cliquer sur « ➕ Ajouter » pour associer des étiquettes Discord à la publication (voir section Tags).</li>
          <li><strong>Variables du template</strong> : nom du jeu, version du jeu, version traduite, lien du jeu (F95/Lewd/Autre), synopsis (Overview), instructions d'installation, image principale, liens mod/traduction additionnels si le template les inclut.</li>
          <li><strong>Synopsis</strong> : décrire le jeu (résumé). Remplacera la variable <code>[Overview]</code> dans le template par votre résumé.</li>
          <li><strong>Instructions d'installation</strong> : saisir du texte ou choisir une instruction enregistrée (voir section Instructions).</li>
          <li><strong>Image</strong> : ajouter une image à votre publication à l'aide d'un lien URL (généralement : clic droit sur l'image → « Copier le lien de l'image ») puis en cliquant sur « Ajouter ».</li>
          <li><strong>Aperçu</strong> : la colonne de droite affiche le rendu du message tel qu'il est écrit avant publication ; en cliquant sur « Aperçu Discord », vous verrez le rendu final.</li>
          <li><strong>Publier</strong> : une fois tout renseigné, cliquer sur « Publier sur Discord » pour envoyer le post (ou « Mettre à jour » en mode édition).</li>
        </ol>
      </section>

      <section className="help-section help-section--success">
        <h4 className="help-section__title">📥 Importer Data</h4>
        <p>
          Si vous utilisez le script Tampermonkey <code>DiscordPublisherDataExtractor.js</code>, vous pouvez coller un JSON depuis le presse-papier : l'app remplit automatiquement le nom du jeu, la version et le lien du jeu. Cherchez le bouton d'import <strong>📥 Importer Data</strong> en bas à gauche du formulaire.
        </p>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setShowGuide(v => !v)}
            className="help-btn--expand"
          >
            {showGuide ? '▼' : '▶'} Installer le script Tampermonkey
          </button>

          {showGuide && (
            <div className="help-guide-block">
              <p>Guide d'installation :</p>
              <ol>
                <li>
                  <strong>Installer Tampermonkey</strong> dans votre navigateur :{' '}
                  <button
                    type="button"
                    onClick={() => tauriAPI.openUrl('https://www.tampermonkey.net/')}
                    className="help-link-inline"
                  >
                    tampermonkey.net
                  </button>
                </li>
                <li>
                  <strong>Télécharger le script</strong> : cliquez sur le bouton ci-dessous.
                  <div style={{ marginTop: 8 }}>
                    <button type="button" onClick={handleDownloadScript} className="help-btn--download">
                      📥 Télécharger le script
                    </button>
                  </div>
                </li>
                <li>
                  <strong>Dans Tampermonkey</strong> : ouvrez le tableau de bord → « Créer un nouveau script » → supprimez le contenu par défaut et collez le fichier → enregistrez.
                </li>
              </ol>
            </div>
          )}
        </div>
      </section>

      <section className="help-section help-section--info">
        <h4 className="help-section__title">✏️ Mode édition</h4>
        <p>
          Depuis l'historique, vous pouvez charger un post en mode édition. Les champs sont préremplis ; modifiez ce que vous souhaitez puis cliquez sur « ✏️ Mettre à jour le post » pour mettre à jour le thread Discord et l'historique.
        </p>
      </section>
    </div>
  );
}
