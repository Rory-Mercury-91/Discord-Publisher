// frontend\src\components\HelpComponents\HistoryHelp.tsx

export default function HistoryHelp() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>

      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--accent)' }}>
          📋 À quoi sert l'historique ?
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          L'historique des publications liste toutes les traductions publiées (ou mises à jour) depuis l'app. Chaque entrée affiche le titre, la date, l'auteur et permet d'éditer le post sur Discord, d'ouvrir le thread, ou de supprimer définitivement la publication.
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
          Les publications sont enregistrées dans la base Supabase (<strong>published_posts</strong>) et, à l'ouverture de l'historique, l'app peut fusionner les posts venant de l'API (<strong>/api/history</strong>) pour inclure les publications faites depuis un autre appareil. L'historique affiché est donc la réunion de vos données locales/Supabase et de celles du serveur de publication.
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          À chaque publication ou mise à jour depuis l'éditeur, l'entrée est ajoutée ou mise à jour dans l'historique et synchronisée avec Supabase.
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 222, 128, 0.08)',
        border: '1px solid rgba(74, 222, 128, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4ade80' }}>
          🔍 Recherche, tri et filtres
        </h4>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>Recherche</strong> : le champ texte filtre les posts par titre, contenu ou tags.</li>
          <li><strong>Tri</strong> : par date (plus récent en premier ou plus ancien en premier).</li>
          <li><strong>Filtre par auteur</strong> : afficher uniquement « Mes publications » ou les publications d'un utilisateur précis (si vous avez les droits).</li>
          <li><strong>Réinitialiser</strong> : remet recherche, tri et filtre à zéro.</li>
        </ul>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Les résultats sont paginés (15 publications par page).
        </p>
      </section>

      <section style={{
        background: 'rgba(139, 92, 246, 0.08)',
        border: '1px solid rgba(139, 92, 246, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#8b5cf6' }}>
          ✏️ Éditer un post
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Le bouton <strong>Éditer</strong> n'apparaît que si vous avez le droit de modifier ce post :
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li>Vous êtes l'auteur de la publication (votre Discord est enregistré comme auteur),</li>
          <li>Vous êtes master admin, ou</li>
          <li>L'auteur vous a autorisé dans Configuration → « Qui peut modifier mes posts ».</li>
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
          La suppression retire l'entrée de l'historique, la supprime de la base Supabase et, si un thread Discord est associé, supprime ce thread (et tout son contenu) sur Discord. Une confirmation est demandée avant d'agir.
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Si le post n'a pas de thread Discord (ancienne donnée ou erreur), seule l'entrée en base et dans l'historique est supprimée. Cette action est irréversible.
        </p>
      </section>

    </div>
  );
}
