// frontend\src\components\HelpComponents\StatsHelp.tsx

export default function StatsHelp() {
  return (
    <div className="help-content-inner">

      <section className="help-intro">
        <h4 className="help-section__title">📈 À quoi servent les statistiques ?</h4>
        <p>
          La fenêtre Statistiques affiche des indicateurs basés sur vos publications enregistrées dans l'historique. Les données proviennent des posts présents dans l'app (Supabase + historique local). L'interface est organisée en trois zones : filtre et total, répartition par traducteur, puis graphique des publications par mois.
        </p>
      </section>

      <section className="help-section help-section--info">
        <h4 className="help-section__title">
          📅 Ligne 1 : Période et Total
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          <strong>Colonne 1 — Période</strong> : le menu déroulant permet de restreindre toutes les statistiques à une période (toutes les périodes, 7 derniers jours, 30 derniers jours, 6 derniers mois).
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          <strong>Colonne 2 — Total</strong> : affiche le nombre total de publications correspondant à la période choisie.
        </p>
      </section>

      <section className="help-section help-section--success">
        <h4 className="help-section__title">
          👤 Répartition par traducteur
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Cette section (pleine largeur) affiche les traducteurs selon le nombre de publications auxquelles ils sont associés, avec un classement. Les cartes sont affichées en grille, <strong>4 traducteurs par ligne</strong>. Le filtre par période s'applique aussi à ces données.
        </p>
      </section>

      <section className="help-section help-section--info">
        <h4 className="help-section__title">
          📆 Publications par mois
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          <strong>Select année</strong> : en haut à droite, vous pouvez choisir une année précise ou « Toutes les années » pour afficher les mois concernés (en gardant le filtre de période global).
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Un <strong>graphique en barres verticales</strong> montre le nombre de publications par mois : l'axe horizontal = temps (mois), l'axe vertical = nombre de publications. La barre la plus haute touche toujours le haut de la zone (hauteur fixe) ; les autres sont proportionnelles. Le chiffre et le nom du mois (ex. « févr. ») s'affichent sous chaque barre.
        </p>
      </section>

    </div>
  );
}
