// frontend\src\components\HelpComponents\LibraryHelp.tsx

export default function LibraryHelp() {
  return (
    <div className="help-content-inner">

      <section className="help-intro">
        <h4 className="help-section__title">
          📚 La Bibliothèque — Vue d’ensemble
        </h4>
        <p>
          La Bibliothèque affiche tous les jeux traduits suivis par le serveur.
          C’est ici que vous pouvez consulter l’état de vos traductions, voir les mises à jour, et accéder rapidement aux liens du jeu et de la traduction.
        </p>
      </section>

      {/* Modes d’affichage */}
      <section className="help-section help-section--info">
        <h4 className="help-section__title">
          📋 Modes d’affichage
        </h4>
        <p>
          Vous pouvez choisir entre deux modes dans <strong>Configuration → Préférences</strong> :
        </p>
        <ul>
          <li><strong>📋 Information directe (Compact)</strong> : toutes les infos visibles directement sur la carte (versions, traducteur, date, liens directs).</li>
          <li><strong>✨ Information enrichie</strong> : vue plus épurée avec un bouton « Plus d’informations » qui ouvre une modale détaillée (synopsis, tags, liens, etc.).</li>
        </ul>
        <p className="help-section__muted">
          Le changement s’applique immédiatement à toute la bibliothèque.
        </p>
      </section>

      {/* Outils de recherche et filtres */}
      <section className="help-section help-section--success">
        <h4 className="help-section__title">
          🔍 Recherche et filtres
        </h4>
        <ul>
          <li><strong>Barre de recherche</strong> : tapez le nom du jeu ou du traducteur.</li>
          <li><strong>Filtres déroulants</strong> : Statut, Traducteur, Type de jeu, Type de traduction, Statut de synchro (À jour / Non à jour / Inconnu).</li>
          <li><strong>Tri par date</strong> : bouton 📅 pour trier par date de mise à jour (le plus récent en premier).</li>
          <li><strong>Vue Grille / Liste</strong> : boutons en haut à droite pour changer l’affichage.</li>
        </ul>
        <p className="help-section__muted">
          Le compteur en haut indique <strong>X/Y</strong> jeux affichés après filtrage.
        </p>
      </section>

      {/* Statut de synchro */}
      <section className="help-section help-section--warning">
        <h4 className="help-section__title">
          🔄 Statut de synchro
        </h4>
        <p>
          Chaque carte affiche un badge de synchro :
        </p>
        <ul>
          <li><span className="help-badge--success">✅ À jour</span> → version traduite = version officielle</li>
          <li><span className="help-badge--danger">⚠️ Non à jour</span> → version traduite inférieure</li>
          <li><span className="help-badge--muted">❓ Inconnu</span> → impossible de comparer</li>
        </ul>
      </section>

      {/* Actions sur les jeux */}
      <section className="help-section help-section--info">
        <h4 className="help-section__title">
          🎮 Actions sur les jeux
        </h4>
        <ul>
          <li>Cliquez sur une carte en mode <strong>Enrichi</strong> → ouvre la modale détaillée (synopsis, tags, liens…).</li>
          <li>En mode <strong>Compact</strong> → les liens directs sont cliquables (Jeu + Traduction).</li>
          <li>Bouton ✏️ (quand visible) → charge le post en mode édition (uniquement si vous avez les droits).</li>
          <li>Bouton ↻ en haut à droite → force le rafraîchissement de la bibliothèque.</li>
        </ul>
      </section>

      <section className="help-section help-section--tip help-section--compact">
        💡 <strong>Astuce :</strong> La bibliothèque se met à jour automatiquement toutes les 2 heures grâce au bot. Vous pouvez forcer la mise à jour avec le bouton ↻.
      </section>

    </div>
  );
}
