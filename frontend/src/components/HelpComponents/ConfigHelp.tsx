// frontend\src\components\HelpComponents\ConfigHelp.tsx

export default function ConfigHelp() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>

      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--accent)' }}>
          ⚙️ Configuration — Nouvelle interface
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          La fenêtre Configuration a été entièrement repensée et divisée en <strong>4 onglets clairs</strong> pour une meilleure lisibilité et maintenance. Chaque onglet correspond à une catégorie précise.
        </p>
      </section>

      {/* Onglet Préférences */}
      <section style={{
        background: 'rgba(74, 158, 255, 0.08)',
        border: '1px solid rgba(74, 158, 255, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4a9eff' }}>
          ⚙️ Préférences
        </h4>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>🔑 Clé API</strong> : collez ici votre clé personnelle (obtenue avec <code>/generer-cle</code> sur le Discord).</li>
          <li><strong>🪟 État de la fenêtre au démarrage</strong> : Normal, Maximisé, Plein écran ou Minimisé.</li>
          <li><strong>🏷️ Labels par défaut</strong> : valeurs préservées pour « Traduction » et « Mod » lors de la réinitialisation du formulaire.</li>
          <li><strong>📚 Mode d'affichage Bibliothèque</strong> : Compact (toutes les infos visibles) ou Enrichi (bouton « Plus d'informations »).</li>
        </ul>
      </section>

      {/* Onglet Mon compte */}
      <section style={{
        background: 'rgba(74, 222, 128, 0.08)',
        border: '1px solid rgba(74, 222, 128, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4ade80' }}>
          👤 Mon compte
        </h4>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>👥 Qui peut modifier mes posts</strong> : gérez les droits d’édition des autres utilisateurs (vert = autorisé).</li>
          <li><strong>🔐 Sécurité du compte</strong> : changez votre mot de passe (ancien + nouveau + confirmation).</li>
          <li><strong>☠️ Zone de danger</strong> : suppression définitive du compte (profil, templates, instructions, autorisations).</li>
        </ul>
      </section>

      {/* Onglet Administration */}
      <section style={{
        background: 'rgba(255, 193, 7, 0.1)',
        border: '1px solid rgba(255, 193, 7, 0.3)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#f59e0b' }}>
          🛡️ Administration (protégée par code Master Admin)
        </h4>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>🌐 URL de l’API</strong> : modifiez l’adresse du serveur backend (propagée automatiquement à tous les utilisateurs).</li>
          <li><strong>💾 Sauvegarde et restauration</strong> : Exportez tout en JSON ou restaurez depuis un fichier.</li>
          <li><strong>🗑️ Tout supprimer</strong> : nettoyage complet et irréversible des données sur Supabase + local.</li>
        </ul>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Le code Master Admin est requis pour accéder à cet onglet. Une fois validé, il reste actif pendant la session.
        </p>
      </section>

      {/* Onglet Enrichissement */}
      <section style={{
        background: 'rgba(139, 92, 246, 0.08)',
        border: '1px solid rgba(139, 92, 246, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#8b5cf6' }}>
          🤖 Enrichissement automatique
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Lancez l’enrichissement massif des fiches jeux : récupération des synopsis anglais sur F95Zone, traduction automatique, et sauvegarde dans Supabase.
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: '8px 0 0 0', paddingLeft: 20 }}>
          <li>Bouton « Lancer l’enrichissement » avec suivi en temps réel (progression + logs).</li>
          <li>Possibilité d’arrêter à tout moment.</li>
          <li>Idéal pour mettre à jour rapidement tous les jeux sans synopsis.</li>
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
        💡 <strong>Astuce :</strong> Tous les changements sont sauvegardés automatiquement. Vous pouvez fermer la fenêtre à tout moment sans perdre vos réglages.
      </section>

    </div>
  );
}
