// frontend\src\components\HelpComponents\HistoryHelp.tsx

export default function HistoryHelp() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>

      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--accent)' }}>
          📋 À quoi sert l'historique ?
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          L'historique liste toutes les publications envoyées depuis l'app. Chaque entrée affiche le <strong>titre</strong> et les <strong>boutons d'action</strong> (archiver, éditer, supprimer). Le filtre par auteur se fait via le menu déroulant en haut (Moi, Tous les auteurs, ou un utilisateur précis). Les dates de création et de modification sont disponibles au survol du titre (tooltip).
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 158, 255, 0.08)',
        border: '1px solid rgba(74, 158, 255, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4a9eff' }}>
          📂 D'où viennent les données ?
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          L'historique a une seule source de vérité : la base <strong>Supabase</strong> (table <strong>published_posts</strong>). À l'ouverture de la modale, l'app peut synchroniser avec le serveur (API) pour récupérer les publications faites depuis un autre appareil et les enregistrer dans Supabase. À chaque publication depuis l'éditeur, l'entrée est ajoutée ou mise à jour dans cette base.
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 222, 128, 0.08)',
        border: '1px solid rgba(74, 222, 128, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4ade80' }}>
          🔍 Onglets, recherche, tri et filtres
        </h4>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>Onglets Actifs / Archive</strong> : afficher les publications actives ou archivées (le toggle sur chaque carte permet d'archiver ou de réactiver).</li>
          <li><strong>Filtre par auteur</strong> : menu déroulant pour limiter la liste. Par défaut <strong>Moi</strong> (utilisateur connecté) ; vous pouvez choisir Tous les auteurs ou un utilisateur précis.</li>
          <li><strong>Recherche</strong> : champ texte qui filtre par <strong>nom du jeu</strong> (titre du post), <strong>lien du jeu</strong> (URL) ou <strong>ID</strong> du post.</li>
          <li><strong>Tri</strong> : par date (plus récent ou plus ancien en premier).</li>
          <li><strong>Réinitialiser les filtres</strong> : remet recherche, tri et filtre auteur à zéro.</li>
        </ul>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Résultats paginés (15 publications par page).
        </p>
      </section>

      <section className="help-section help-section--info">
        <h4 className="help-section__title">
          ✏️ Éditer un post
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Le bouton <strong>Éditer</strong> (✏️) n'apparaît que si vous avez le droit de modifier ce post :
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li>Vous êtes l'auteur de la publication,</li>
          <li>Vous êtes master admin,</li>
          <li>L'auteur vous a autorisé dans Configuration → Mon compte → « Qui peut modifier mes posts ».</li>
        </ul>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Cliquer sur Éditer charge le post dans l'éditeur de contenu en mode édition ; vous pouvez modifier puis republier pour mettre à jour le thread Discord.
        </p>
      </section>

      <section style={{
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#ef4444' }}>
          🗑️ Supprimer définitivement
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Le bouton <strong>Supprimer</strong> (🗑️) retire l'entrée de l'historique, la supprime de la base Supabase et, si un thread Discord est associé, supprime ce thread sur Discord. Une confirmation est demandée avant d'agir.
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Si le post n'a pas de thread Discord, seule l'entrée en base et dans l'historique est supprimée. Cette action est irréversible.
        </p>
      </section>

    </div>
  );
}
