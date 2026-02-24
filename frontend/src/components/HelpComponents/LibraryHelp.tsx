// frontend\src\components\HelpComponents\LibraryHelp.tsx

export default function LibraryHelp() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>

      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--accent)' }}>
          📚 La Bibliothèque — Vue d’ensemble
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          La Bibliothèque affiche tous les jeux traduits suivis par le serveur.
          C’est ici que vous pouvez consulter l’état de vos traductions, voir les mises à jour, et accéder rapidement aux liens du jeu et de la traduction.
        </p>
      </section>

      {/* Modes d’affichage */}
      <section style={{
        background: 'rgba(99, 102, 241, 0.08)',
        border: '1px solid rgba(99, 102, 241, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#6366f1' }}>
          📋 Modes d’affichage
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Vous pouvez choisir entre deux modes dans <strong>Configuration → Préférences</strong> :
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>📋 Information directe (Compact)</strong> : toutes les infos visibles directement sur la carte (versions, traducteur, date, liens directs).</li>
          <li><strong>✨ Information enrichie</strong> : vue plus épurée avec un bouton « Plus d’informations » qui ouvre une modale détaillée (synopsis, tags, liens, etc.).</li>
        </ul>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Le changement s’applique immédiatement à toute la bibliothèque.
        </p>
      </section>

      {/* Outils de recherche et filtres */}
      <section style={{
        background: 'rgba(74, 222, 128, 0.08)',
        border: '1px solid rgba(74, 222, 128, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4ade80' }}>
          🔍 Recherche et filtres
        </h4>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>Barre de recherche</strong> : tapez le nom du jeu ou du traducteur.</li>
          <li><strong>Filtres déroulants</strong> : Statut, Traducteur, Type de jeu, Type de traduction, Statut de synchro (À jour / Non à jour / Inconnu).</li>
          <li><strong>Tri par date</strong> : bouton 📅 pour trier par date de mise à jour (le plus récent en premier).</li>
          <li><strong>Vue Grille / Liste</strong> : boutons en haut à droite pour changer l’affichage.</li>
        </ul>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Le compteur en haut indique <strong>X/Y</strong> jeux affichés après filtrage.
        </p>
      </section>

      {/* Statut de synchro */}
      <section style={{
        background: 'rgba(249, 115, 22, 0.08)',
        border: '1px solid rgba(249, 115, 22, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#fb923c' }}>
          🔄 Statut de synchro
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Chaque carte affiche un badge de synchro :
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><span style={{ color: '#22c55e' }}>✅ À jour</span> → version traduite = version officielle</li>
          <li><span style={{ color: '#ef4444' }}>⚠️ Non à jour</span> → version traduite inférieure</li>
          <li><span style={{ color: '#78716c' }}>❓ Inconnu</span> → impossible de comparer</li>
        </ul>
      </section>

      {/* Actions sur les cartes */}
      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: 'var(--accent)' }}>
          🎮 Actions sur les jeux
        </h4>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li>Cliquez sur une carte en mode <strong>Enrichi</strong> → ouvre la modale détaillée (synopsis, tags, liens…).</li>
          <li>En mode <strong>Compact</strong> → les liens directs sont cliquables (Jeu + Traduction).</li>
          <li>Bouton ✏️ (quand visible) → charge le post en mode édition (uniquement si vous avez les droits).</li>
          <li>Bouton ↻ en haut à droite → force le rafraîchissement de la bibliothèque.</li>
        </ul>
      </section>

      <section style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 16,
        fontSize: 13,
        color: 'var(--muted)'
      }}>
        💡 <strong>Astuce :</strong> La bibliothèque se met à jour automatiquement toutes les 2 heures grâce au bot. Vous pouvez forcer la mise à jour avec le bouton ↻.
      </section>

    </div>
  );
}
