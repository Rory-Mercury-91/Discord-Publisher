// frontend\src\components\HelpComponents\TagsHelp.tsx

export default function TagsHelp() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>

      {/* Tags requis pour publier */}
      <section style={{
        background: 'rgba(34, 197, 94, 0.1)',
        border: '1px solid rgba(34, 197, 94, 0.3)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: 16, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>✅</span>
          <span>Tags requis pour publier</span>
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Pour pouvoir publier, vous devez sélectionner <strong>au moins un tag dans chacune de ces catégories</strong> :
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: '8px 0 0 0', paddingLeft: 20 }}>
          <li><strong>Site</strong> (ex. F95, Lewd)</li>
          <li><strong>Type de traduction</strong> (Manuelle, Semi-automatique, Automatique)</li>
          <li><strong>Traducteur</strong> (votre nom ou celui du traducteur)</li>
        </ul>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0 0' }}>
          Les tags <strong>Autres</strong> et <strong>Statut du jeu</strong> sont optionnels.
        </p>
      </section>

      {/* Limite de tags */}
      <section style={{
        background: 'rgba(255, 193, 7, 0.1)',
        border: '1px solid rgba(255, 193, 7, 0.3)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: 16, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>⚠️</span>
          <span>Limite de tags</span>
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Vous pouvez sélectionner <strong>maximum 5 tags</strong> par publication. Cette limite permet de maintenir une catégorisation claire et efficace de vos posts.
        </p>
      </section>

      {/* Ajouter des tags dans le formulaire */}
      <section style={{
        background: 'rgba(139, 92, 246, 0.1)',
        border: '1px solid rgba(139, 92, 246, 0.3)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: '#8b5cf6' }}>
          🏷️ Ajouter des tags dans le formulaire
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 16px 0' }}>
          Dans l'éditeur de contenu, le champ <strong>Tags</strong> permet d'associer des étiquettes à votre publication. Voici comment les utiliser :
        </p>

        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
              1. Ouvrir le sélecteur
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)', margin: 0 }}>
              Cliquez sur le bouton <strong>➕ Ajouter</strong> dans le champ Tags pour ouvrir la modale de sélection.
            </p>
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
              2. Choisir un tag
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)', margin: 0 }}>
              Dans la modale, cliquez sur un tag (générique ou traducteur) pour l'ajouter à la publication. Il apparaît alors sous forme de badge dans le formulaire.
            </p>
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
              3. Retirer un tag
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)', margin: 0 }}>
              Cliquez sur le <strong>✕</strong> d'un badge pour le retirer de la publication. Vous pouvez rouvrir la modale pour en ajouter d'autres.
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, marginBottom: 0 }}>Exemple de badge :</p>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 999,
              background: 'rgba(99, 102, 241, 0.14)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              fontSize: 13,
              lineHeight: 1.2,
              fontWeight: 600,
              marginTop: 6
            }}>
              <span style={{ color: 'var(--text)' }}>Rory Mercury 91</span>
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>✕</span>
            </div>
          </div>

          <div style={{
            padding: 12,
            background: 'rgba(74, 158, 255, 0.08)',
            border: '1px solid rgba(74, 158, 255, 0.25)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--muted)'
          }}>
            💡 Fermeture : <strong>Échap</strong>, bouton Fermer ou clic en dehors de la modale.
          </div>
        </div>
      </section>
    </div>
  );
}
