// frontend\src\components\HelpComponents\TagsHelp.tsx

export default function TagsHelp() {
  return (
    <div className="help-content-inner">

      <section className="help-intro">
        <h4 className="help-section__title">🏷️ À quoi servent les tags ?</h4>
        <p>
          Les tags sont des étiquettes affichées sur vos publications Discord (site, type de traduction, statut du jeu, etc.). Ils permettent d’identifier et de filtrer les traductions. Certains sont gérés automatiquement, d’autres sont optionnels et s’ajoutent depuis la modale.
        </p>
      </section>

      {/* Tags gérés automatiquement */}
      <section className="help-section help-section--success">
        <h4 className="help-section__title">
          <span>✅</span>
          <span>Tags gérés automatiquement</span>
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Trois types de tags sont <strong>toujours présents</strong> et ne peuvent pas être retirés (pas de croix ✕ sur leur badge) :
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: '8px 0 0 0', paddingLeft: 20 }}>
          <li><strong>Traducteur</strong> — affiché pour information uniquement ; il n'est <strong>pas envoyé à Discord</strong> et ne compte pas dans la limite de 5 tags.</li>
          <li><strong>Site</strong> — déduit du lien collé (F95, LewdCorner ou Autres sites), parmi les tags du traducteur actif. Vous ne le choisissez pas dans la modale.</li>
          <li><strong>Type de traduction</strong> — un seul à la fois (Automatique, Semi-automatique, Manuelle). Par défaut « Automatique ». Modifiable via les boutons du formulaire ou la modale.</li>
        </ul>
      </section>

      {/* Tags optionnels et limite */}
      <section className="help-section help-section--warning">
        <h4 className="help-section__title">
          <span>⚠️</span>
          <span>Tags optionnels et limite</span>
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Dans la modale vous pouvez ajouter des tags <strong>Statut du jeu</strong> (un seul) et <strong>Autres</strong> (plusieurs). <strong>Discord</strong> limite les publications à <strong>5 tags au total</strong> (Site, Type de traduction, Statut du jeu, Autres — le tag Traducteur est uniquement visuel et n'est pas compté).
        </p>
      </section>

      {/* Utiliser les tags dans le formulaire */}
      <section className="help-section help-section--info">
        <h4 className="help-section__title help-section__title--large">
          🏷️ Utiliser les tags dans le formulaire
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 16px 0' }}>
          Le champ <strong>Tags</strong> affiche les badges (Traducteur, Site, Type de traduction + ceux que vous ajoutez). Comportement :
        </p>

        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
              1. Tags automatiques
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)', margin: 0 }}>
              Traducteur, Site et Type de traduction sont ajoutés ou mis à jour automatiquement. Leurs badges n'ont <strong>pas de croix ✕</strong> : on ne peut pas les retirer, seulement changer le type de traduction (boutons ou modale) ou le site (en modifiant le lien).
            </p>
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
              2. Ouvrir le sélecteur
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)', margin: 0 }}>
              Cliquez sur <strong>➕ Ajouter</strong> pour ouvrir la modale. Vous y voyez les tags secondaires du traducteur (Statut du jeu, Autres) et vous pouvez aussi changer le <strong>Type de traduction</strong>.
            </p>
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
              3. Retirer un tag
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)', margin: 0 }}>
              Seuls les tags <strong>optionnels</strong> (Statut du jeu, Autres) ont une croix <strong>✕</strong> sur leur badge. Cliquez dessus pour les retirer. Traducteur, Site et Type de traduction restent toujours présents.
            </p>
          </div>

          <div className="help-section help-section--tip" style={{ padding: 12, margin: 0 }}>
            💡 Fermeture : <strong>Échap</strong> ou bouton Fermer.
          </div>
        </div>
      </section>
    </div>
  );
}
