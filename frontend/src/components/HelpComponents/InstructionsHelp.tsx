// frontend\src\components\HelpComponents\InstructionsHelp.tsx

export default function InstructionsHelp() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>

      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--accent)' }}>
          📋 À quoi servent les instructions ?
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Les instructions sont des blocs de texte nommés (ex. « Installation Windows », « Guide Linux ») utilisés dans vos publications. Le template contient la variable <strong>[instruction]</strong> : au moment de la publication, elle est remplacée par le contenu de l'instruction que vous avez choisie ou saisie dans le formulaire.
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 158, 255, 0.08)',
        border: '1px solid rgba(74, 158, 255, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4a9eff' }}>
          📋 Gestion des instructions
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Dans la fenêtre <strong>Gestion des instructions</strong> (bouton 📋 dans l'éditeur) :
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>Ajouter</strong> : cliquez sur « ➕ Ajouter une instruction » pour ouvrir le formulaire, remplissez le nom et le contenu, puis validez avec « ➕ Ajouter ».</li>
          <li><strong>Modifier</strong> : cliquez sur ✏️ sur une instruction, modifiez le contenu dans le formulaire et validez avec « ✅ Enregistrer ».</li>
          <li><strong>Supprimer</strong> : cliquez sur 🗑️ ; une confirmation est demandée. La suppression est définitive.</li>
        </ul>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Vos instructions sont <strong>synchronisées automatiquement avec Supabase</strong> à chaque modification (voir section suivante pour le partage et la révocation).
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 222, 128, 0.08)',
        border: '1px solid rgba(74, 222, 128, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4ade80' }}>
          🔄 Synchronisation et partage (Supabase)
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Les <strong>instructions sont synchronisées automatiquement</strong> avec la base Supabase à chaque modification. Vous n'avez rien à faire !
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>✅ Création/modification</strong> : vos instructions sont envoyées automatiquement vers la base.</li>
          <li><strong>✅ Partage</strong> : si un utilisateur vous ajoute dans « Qui peut modifier mes posts » (Configuration), ses instructions apparaissent automatiquement dans votre app.</li>
          <li><strong>✅ Révocation</strong> : si votre accès est révoqué, les instructions partagées sont supprimées automatiquement de votre appareil.</li>
        </ul>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          <strong>Note :</strong> vous ne pouvez modifier que vos propres instructions sur la base. Les instructions reçues d'autres utilisateurs sont en lecture seule.
        </p>
      </section>

      <section style={{
        background: 'rgba(139, 92, 246, 0.08)',
        border: '1px solid rgba(139, 92, 246, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#8b5cf6' }}>
          🎯 Utiliser une instruction dans le formulaire
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Dans l'éditeur de contenu, le champ <strong>Instruction</strong> (visible si le template utilise <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[instruction]</code>) permet de :
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>Sélectionner</strong> une instruction enregistrée dans la liste déroulante (recherche possible). Le contenu est inséré dans le champ.</li>
          <li><strong>Saisir ou modifier</strong> le texte directement dans la zone de texte.</li>
        </ul>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Lors de la publication, le bloc <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[instruction]</code> du template est remplacé par ce contenu (formaté en liste numérotée dans le message Discord).
        </p>
      </section>
    </div>
  );
}
