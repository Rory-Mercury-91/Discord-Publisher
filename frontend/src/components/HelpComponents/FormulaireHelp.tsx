// frontend\src\components\HelpComponents\FormulaireHelp.tsx
import { useState } from 'react';
import scriptTampermonkeyRaw from '../../assets/DiscordPublisherDataExtractor.js?raw';
import { tauriAPI } from '../../lib/tauri-api';
import { useToast } from '../ToastProvider';

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
    <div style={{ display: 'grid', gap: 24 }}>
      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--accent)' }}>
          📝 Remplir le formulaire de publication
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          L'éditeur de contenu permet de préparer un post Discord (traduction, annonce) avant de le publier. Le contenu affiché dépend des informations saisies dans le template (modifiable depuis la modale « Gestion des templates ») : seuls les champs utilisés par ce template sont actifs ; les autres restent désactivés.
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 158, 255, 0.08)',
        border: '1px solid rgba(74, 158, 255, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4a9eff' }}>
          Ordre recommandé
        </h4>
        <ol style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>Titre du post</strong> : généré automatiquement à partir des champs « Nom du jeu » et « Version du jeu ». Champ en lecture seule.</li>
          <li><strong>Tags</strong> : cliquer sur « ➕ Ajouter » pour associer des étiquettes Discord à la publication (voir section Tags).</li>
          <li><strong>Variables du template</strong> : nom du jeu, version du jeu, version traduite, lien du jeu (F95/Lewd/Autre), synopsis (Overview), instructions d'installation, image principale, liens mod/traduction additionnels si le template les inclut.</li>
          <li><strong>Synopsis</strong> : décrire le jeu (résumé). Remplacera la variable <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[Overview]</code> dans le template par votre résumé.</li>
          <li><strong>Instructions d'installation</strong> : saisir du texte ou choisir une instruction enregistrée (voir section Instructions).</li>
          <li><strong>Image</strong> : ajouter une image à votre publication à l'aide d'un lien URL (généralement : clic droit sur l'image → « Copier le lien de l'image ») puis en cliquant sur « Ajouter ».</li>
          <li><strong>Aperçu</strong> : la colonne de droite affiche le rendu du message tel qu’il est écrit avant publication ; en cliquant sur « Aperçu Discord », vous verrez le rendu final.</li>
          <li><strong>Publier</strong> : une fois tout renseigné, cliquer sur « Publier sur Discord » pour envoyer le post (ou « Mettre à jour » en mode édition).</li>
        </ol>
      </section>

      <section style={{
        background: 'rgba(74, 222, 128, 0.08)',
        border: '1px solid rgba(74, 222, 128, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4ade80' }}>
          📥 Importer Data
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Si vous utilisez le script Tampermonkey <code style={{ fontFamily: 'monospace', fontSize: 12 }}>DiscordPublisherDataExtractor.js</code>, vous pouvez coller un JSON depuis le presse-papier : l'app remplit automatiquement le nom du jeu, la version et le lien du jeu. Cherchez le bouton d'import <strong>📥 Importer Data</strong> en bas à gauche du formulaire.
        </p>

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setShowGuide(v => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'opacity 0.2s'
            }}
            onMouseOver={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseOut={e => (e.currentTarget.style.opacity = '1')}
          >
            {showGuide ? '▼' : '▶'} Installer le script Tampermonkey
          </button>

          {showGuide && (
            <div style={{
              marginTop: 12,
              padding: 16,
              background: 'rgba(0,0,0,0.15)',
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.7,
              color: 'var(--text)'
            }}>
              <p style={{ margin: '0 0 12px 0', fontWeight: 600 }}>Guide d'installation :</p>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                <li style={{ marginBottom: 8 }}>
                  <strong>Installer Tampermonkey</strong> dans votre navigateur :{' '}
                  <button
                    type="button"
                    onClick={() => tauriAPI.openUrl('https://www.tampermonkey.net/')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'var(--accent)',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      fontSize: 'inherit',
                      fontFamily: 'inherit'
                    }}
                  >
                    tampermonkey.net
                  </button>
                </li>
                <li style={{ marginBottom: 8 }}>
                  <strong>Télécharger le script</strong> : cliquez sur le bouton ci-dessous.
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={handleDownloadScript}
                      style={{
                        padding: '8px 14px',
                        background: '#4ade80',
                        color: '#0f172a',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
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

      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: 'var(--accent)' }}>
          ✏️ Mode édition
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Depuis l'historique, vous pouvez charger un post en mode édition. Les champs sont préremplis ; modifiez ce que vous souhaitez puis cliquez sur « ✏️ Mettre à jour le post » pour mettre à jour le thread Discord et l'historique.
        </p>
      </section>
    </div>
  );
}
