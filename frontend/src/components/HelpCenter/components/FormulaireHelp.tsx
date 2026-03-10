// frontend\src\components\HelpCenter\components\FormulaireHelp.tsx
export default function FormulaireHelp() {
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
        <h4 className="help-section__title">📥 Importer Data (pré-remplissage formulaire)</h4>
        <p>
          Le script Tampermonkey <strong>DiscordPublisherDataExtractor</strong> inclut une option{' '}
          <strong>📋 Copier JSON</strong> qui copie les données du jeu dans le presse-papier.
          En cliquant ensuite sur <strong>📥 Importer Data</strong> en bas à gauche du formulaire,
          l&apos;application lit ce JSON et pré-remplit automatiquement le nom du jeu, la version
          et le lien — pratique pour préparer une publication sans ressaisie.
        </p>
        <p style={{ marginTop: 8, color: 'var(--color-text-muted)', fontSize: '13px' }}>
          Note : cette fonction pré-remplit uniquement le formulaire de publication. Pour ajouter
          un jeu directement à <em>Ma collection</em>, utilisez plutôt l&apos;option{' '}
          <strong>📥 Importer</strong> du script (import direct via l&apos;application).
          Consultez la section <strong>🐒 Tampermonkey</strong> dans l&apos;aide pour le guide complet.
        </p>
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
