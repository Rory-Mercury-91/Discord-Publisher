// frontend\src\components\HelpComponents\StatsHelp.tsx

export default function StatsHelp() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>

      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--accent)' }}>
          📈 À quoi servent les statistiques ?
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          La fenêtre Statistiques affiche des indicateurs basés sur vos publications enregistrées dans l'historique : nombre total de publications, répartition par traducteurs, et répartition par mois. Les données proviennent des posts présents dans l'app (Supabase + historique local).
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 158, 255, 0.08)',
        border: '1px solid rgba(74, 158, 255, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4a9eff' }}>
          📅 Filtre par période
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Vous pouvez restreindre les statistiques à une période donnée :
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>Toutes les périodes</strong> : toutes les publications de l'historique.</li>
          <li><strong>7 derniers jours</strong> : publications des 7 derniers jours.</li>
          <li><strong>30 derniers jours</strong> : publications du dernier mois.</li>
          <li><strong>6 derniers mois</strong> : publications des 6 derniers mois.</li>
        </ul>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Le total, le classement des traducteurs et les publications par mois sont recalculés en fonction de la période choisie.
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 222, 128, 0.08)',
        border: '1px solid rgba(74, 222, 128, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4ade80' }}>
          👤 Répartition par traducteur
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Cette section affiche tous les traducteurs selon le nombre de publications auxquelles ils sont associés.
        </p>
      </section>

      <section style={{
        background: 'rgba(139, 92, 246, 0.08)',
        border: '1px solid rgba(139, 92, 246, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#8b5cf6' }}>
          📆 Publications par mois
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Un graphique en barres montre le nombre de publications par mois (sur la période filtrée). Chaque barre correspond à un mois (ex. « janv. 2026 ») et sa hauteur est proportionnelle au nombre de publications. Utile pour visualiser l'activité dans le temps.
        </p>
      </section>

    </div>
  );
}
