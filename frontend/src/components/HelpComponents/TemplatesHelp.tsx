// frontend\src\components\HelpComponents\TemplatesHelp.tsx

export default function TemplatesHelp() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>

      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--accent)' }}>
          📄 À quoi servent les templates ?
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Les templates définissent la structure du message Discord (titre, corps, mise en forme). Ils contiennent des <strong>variables</strong> entre crochets (ex. <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[Game_name]</code>, <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[instruction]</code>, <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[Overview]</code>) qui sont remplacées par les valeurs du formulaire <strong>au moment de leur écriture</strong> dans l'éditeur de contenu.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '12px 0 0 0' }}>
          La fenêtre <strong>Gestion des templates & variables</strong> s'ouvre via le bouton <strong>« 📄 Templates »</strong> (dans l'en-tête). Les modifications sont synchronisées automatiquement avec Supabase.
        </p>
      </section>

      <section style={{
        background: 'rgba(99, 102, 241, 0.08)',
        border: '1px solid rgba(99, 102, 241, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#6366f1' }}>
          📚 Mes templates
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Liste de vos templates : cliquez sur un template pour l'éditer. Vous pouvez <strong>créer</strong> un nouveau (saisir le nom puis bouton « ➕ Créer ») et <strong>supprimer</strong> un template (🗑️ sur le template sélectionné). Le template par défaut (⭐) ne peut pas être supprimé.
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 222, 128, 0.08)',
        border: '1px solid rgba(74, 222, 128, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4ade80' }}>
          📄 Zone Template
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Contenu du template sélectionné, rédigé en Markdown. Le bouton <strong>?</strong> à côté du nom ouvre l'aide Markdown. Pour le template par défaut, le bouton <strong>🔄 Restaurer</strong> rétablit le contenu d'origine.
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 158, 255, 0.08)',
        border: '1px solid rgba(74, 158, 255, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4a9eff' }}>
          💡 Variables (cliquez pour copier)
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Toutes les variables disponibles sont listées sous la zone de contenu. Un clic sur une variable copie <code style={{ fontFamily: 'monospace', fontSize: 11 }}>[NomVariable]</code> dans le presse-papier pour l'insérer dans le template.
        </p>
      </section>

      <section style={{
        background: 'rgba(245, 158, 11, 0.08)',
        border: '1px solid rgba(245, 158, 11, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#f59e0b' }}>
          🔧 Variables personnalisées
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Ajoutez, modifiez ou supprimez des variables (nom, label, type texte ou textarea). Elles apparaissent dans le formulaire de l'éditeur de contenu et dans la liste des variables à copier.
        </p>
      </section>

      <section style={{
        background: 'rgba(168, 85, 247, 0.08)',
        border: '1px solid rgba(168, 85, 247, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#a855f7' }}>
          📤 Exporter / 📥 Importer
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          <strong>Exporter</strong> : enregistre les templates et les variables en fichier JSON. <strong>Importer</strong> : charge un fichier JSON exporté pour réutiliser une configuration (ex. une version adaptée à une traduction).
        </p>
      </section>

      <section style={{
        background: 'rgba(100, 116, 139, 0.12)',
        border: '1px solid rgba(100, 116, 139, 0.3)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#94a3b8' }}>
          Enregistrer ou annuler
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          <strong>Annuler</strong> ferme la fenêtre sans enregistrer. <strong>Enregistrer</strong> applique les changements (raccourci <strong>Ctrl+S</strong>).
        </p>
      </section>
    </div>
  );
}
