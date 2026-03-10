// frontend\src\components\HelpCenter\components\TampermonkeyHelp.tsx
import { tauriAPI } from '../../../lib/tauri-api';

export default function TampermonkeyHelp() {
  return (
    <div className="help-content-inner">
      <section className="help-intro">
        <h4 className="help-section__title">🐒 Script Tampermonkey — Discord Publisher</h4>
        <p>
          Le script <strong>DiscordPublisherDataExtractor</strong> s&apos;installe dans l&apos;extension Tampermonkey
          de votre navigateur. Il ajoute un bouton <strong>🎮 Publisher</strong> sur chaque page de jeu F95Zone
          ou LewdCorner, permettant d&apos;importer directement le jeu dans votre collection Discord Publisher
          en un seul clic.
        </p>
      </section>

      <section className="help-section help-section--info">
        <h4 className="help-section__title">📦 Installation</h4>
        <ol>
          <li>
            <strong>Installer l&apos;extension Tampermonkey</strong> dans votre navigateur (Chrome, Firefox, Edge…) :{' '}
            <button
              type="button"
              onClick={() => tauriAPI.openUrl('https://www.tampermonkey.net/')}
              className="help-link-inline"
            >
              tampermonkey.net
            </button>
          </li>
          <li>
            <strong>Télécharger le script</strong> depuis{' '}
            <em>Paramètres → Mon compte → 🐒 Script Tampermonkey → 📥 Télécharger le script</em>.
          </li>
          <li>
            <strong>Installer dans Tampermonkey</strong> : ouvrez le tableau de bord Tampermonkey →
            cliquez sur <em>« + »</em> ou <em>« Créer un nouveau script »</em> → supprimez le contenu
            par défaut → collez l&apos;intégralité du fichier téléchargé → <em>Enregistrer</em>{' '}
            (<kbd>Ctrl</kbd>+<kbd>S</kbd>).
          </li>
          <li>
            <strong>Vérifier l&apos;activation</strong> : le script doit apparaître dans la liste des scripts
            avec le statut « Activé ».
          </li>
        </ol>
      </section>

      <section className="help-section help-section--success">
        <h4 className="help-section__title">🗂️ Deux usages du script</h4>
        <p>Le script propose deux fonctionnalités distinctes accessibles depuis le menu <strong>🎮</strong> :</p>

        <div style={{ marginTop: 12 }}>
          <p><strong>📥 Importer — ajout à Ma collection</strong></p>
          <ol>
            <li><strong>Ouvrez Discord Publisher</strong> — le serveur local (<code>localhost:7832</code>) démarre automatiquement avec l&apos;application.</li>
            <li><strong>Naviguez</strong> sur une page de jeu F95Zone ou LewdCorner.</li>
            <li>Cliquez sur <strong>🎮</strong> puis <strong>« 📥 Importer »</strong>.</li>
            <li>Le jeu est ajouté directement dans l&apos;onglet <strong>Ma collection</strong> de l&apos;application.</li>
          </ol>
        </div>

        <div style={{ marginTop: 16 }}>
          <p><strong>📋 Copier JSON — pré-remplissage du formulaire de traduction</strong></p>
          <ol>
            <li>Depuis la page du jeu, cliquez sur <strong>🎮</strong> puis <strong>« 📋 Copier JSON »</strong>.</li>
            <li>Ouvrez le <strong>formulaire de publication</strong> dans Discord Publisher.</li>
            <li>Cliquez sur <strong>📥 Importer Data</strong> (en bas à gauche du formulaire).</li>
            <li>Le nom du jeu, la version et le lien sont pré-remplis automatiquement.</li>
          </ol>
          <p style={{ marginTop: 6, fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Utile pour les traducteurs qui préparent une publication Discord sans avoir à ressaisir les informations.
          </p>
        </div>
      </section>

      <section className="help-section help-section--info">
        <h4 className="help-section__title">📋 Données extraites automatiquement</h4>
        <p>Dans les deux cas, le script récupère les informations suivantes depuis la page du jeu :</p>
        <ul>
          <li><strong>Nom du jeu</strong> et <strong>version</strong></li>
          <li><strong>Statut</strong> (En cours, Abandonné, Terminé…)</li>
          <li><strong>Type / moteur</strong> (RenPy, Unity, HTML…)</li>
          <li><strong>Tags</strong> du fil de discussion</li>
          <li><strong>Image de couverture</strong> (bannière)</li>
          <li><strong>Synopsis</strong> (Overview)</li>
          <li><strong>Lien direct</strong> vers la page du jeu</li>
        </ul>
      </section>

      <section className="help-section help-section--warning">
        <h4 className="help-section__title">⚠️ Prérequis et dépannage</h4>
        <ul>
          <li>
            <strong>L&apos;application Discord Publisher doit être ouverte</strong> lors de l&apos;import.
            Sans elle, la connexion à <code>localhost:7832</code> échoue.
          </li>
          <li>
            Si un jeu est <strong>déjà présent dans votre collection</strong>, l&apos;import est ignoré
            pour éviter les doublons.
          </li>
          <li>
            Le script fonctionne sur <strong>f95zone.to</strong> et <strong>lewdcorner.com</strong>.
            D&apos;autres sites ne sont pas pris en charge.
          </li>
          <li>
            En cas de problème de connexion : vérifiez que l&apos;application est bien ouverte et
            relancez-la si nécessaire.
          </li>
          <li>
            <strong>Aucune configuration requise</strong> — le script se connecte automatiquement
            à l&apos;application. Pas besoin de clé API ni d&apos;URL.
          </li>
        </ul>
      </section>
    </div>
  );
}
