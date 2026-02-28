// frontend\src\components\HelpComponents\HistoryHelp.tsx

export default function HistoryHelp() {
  return (
    <div className="help-content-inner">

      <section className="help-intro">
        <h4 className="help-section__title">📋 À quoi sert l'historique ?</h4>
        <p>
          L'historique liste toutes les publications envoyées depuis l'app. Chaque entrée affiche le <strong>titre</strong> et les <strong>boutons d'action</strong> (archiver, éditer, supprimer). Le filtre par auteur se fait via le menu déroulant en haut (Moi, Tous les auteurs, ou un utilisateur précis). Les dates de création et de modification sont disponibles au survol du titre (tooltip).
        </p>
      </section>

      <section className="help-section help-section--info">
        <h4 className="help-section__title">📂 D'où viennent les données ?</h4>
        <p>
          L'historique a une seule source de vérité : la base <strong>Supabase</strong> (table <strong>published_posts</strong>). À l'ouverture de la modale, l'app peut synchroniser avec le serveur (API) pour récupérer les publications faites depuis un autre appareil et les enregistrer dans Supabase. À chaque publication depuis l'éditeur, l'entrée est ajoutée ou mise à jour dans cette base.
        </p>
      </section>

      <section className="help-section help-section--success">
        <h4 className="help-section__title">🔍 Onglets, recherche, tri et filtres</h4>
        <ul>
          <li><strong>Onglets Actifs / Archive</strong> : afficher les publications actives ou archivées (le toggle sur chaque carte permet d'archiver ou de réactiver).</li>
          <li><strong>Filtre par auteur</strong> : menu déroulant pour limiter la liste. Par défaut <strong>Moi</strong> (utilisateur connecté) ; vous pouvez choisir Tous les auteurs ou un utilisateur précis.</li>
          <li><strong>Recherche</strong> : champ texte qui filtre par <strong>nom du jeu</strong> (titre du post), <strong>lien du jeu</strong> (URL) ou <strong>ID</strong> du post.</li>
          <li><strong>Tri</strong> : par date (plus récent ou plus ancien en premier).</li>
          <li><strong>Réinitialiser les filtres</strong> : remet recherche, tri et filtre auteur à zéro.</li>
        </ul>
        <p className="help-section__muted">Résultats paginés (15 publications par page).</p>
      </section>

      <section className="help-section help-section--info">
        <h4 className="help-section__title">✏️ Éditer un post</h4>
        <p>Le bouton <strong>Éditer</strong> (✏️) n'apparaît que si vous avez le droit de modifier ce post :</p>
        <ul>
          <li>Vous êtes l'auteur de la publication,</li>
          <li>Vous êtes master admin,</li>
          <li>L'auteur vous a autorisé dans Configuration → Mon compte → « Qui peut modifier mes posts ».</li>
        </ul>
        <p className="help-section__muted">Cliquer sur Éditer charge le post dans l'éditeur de contenu en mode édition ; vous pouvez modifier puis republier pour mettre à jour le thread Discord.</p>
      </section>

      <section className="help-section help-section--danger">
        <h4 className="help-section__title">🗑️ Supprimer définitivement</h4>
        <p>Le bouton <strong>Supprimer</strong> (🗑️) retire l'entrée de l'historique, la supprime de la base Supabase et, si un thread Discord est associé, supprime ce thread sur Discord. Une confirmation est demandée avant d'agir.</p>
        <p className="help-section__muted">Si le post n'a pas de thread Discord, seule l'entrée en base et dans l'historique est supprimée. Cette action est irréversible.</p>
      </section>

    </div>
  );
}
