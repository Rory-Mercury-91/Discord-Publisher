// frontend\src\components\HelpComponents\TemplatesHelp.tsx

export default function TemplatesHelp() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>

      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--accent)' }}>
          📄 À quoi servent les templates ?
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Les templates définissent la structure du message Discord (titre, corps, mise en forme). Ils contiennent des <strong>variables</strong> entre crochets (ex. <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[Game_name]</code>, <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[instruction]</code>, <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[Overview]</code>) qui sont remplacées par les valeurs du formulaire au moment de la publication.
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 222, 128, 0.08)',
        border: '1px solid rgba(74, 222, 128, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4ade80' }}>
          Gérer le template
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          La fenêtre <strong>Gestion du template</strong> (bouton « Gérer le Template ») permet de modifier le template, de restaurer le template par défaut, ou d'exporter/importer un template. Les modifications sont <strong>synchronisées automatiquement avec Supabase</strong>.
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: '8px 0 0 0', paddingLeft: 20 }}>
          <li><strong>📤 Exporter</strong> : enregistre le template (et les variables) en fichier JSON, utile pour sauvegarder une version adaptée à une traduction et la recharger plus tard.</li>
          <li><strong>📥 Importer</strong> : charge un template depuis un fichier JSON exporté.</li>
          <li><strong>🔄 Restaurer</strong> : rétablit le template par défaut. Utilisez cette option si vous souhaitez revenir au template standard.</li>
        </ul>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Les variables disponibles (ex. <code style={{ fontFamily: 'monospace', fontSize: 11 }}>[Game_name]</code>, <code style={{ fontFamily: 'monospace', fontSize: 11 }}>[Game_version]</code>, <code style={{ fontFamily: 'monospace', fontSize: 11 }}>[instruction]</code>, <code style={{ fontFamily: 'monospace', fontSize: 11 }}>[Overview]</code>) sont documentées dans la modale Templates ou dans le Markdown d'aide du champ contenu.
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 158, 255, 0.08)',
        border: '1px solid rgba(74, 158, 255, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4a9eff' }}>
          👁️ Zone Aperçu
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          La zone d'aperçu (à droite) affiche le <strong>résultat final</strong> du template avec toutes les variables remplies. Cette zone est en <strong>lecture seule</strong> et montre exactement ce qui sera publié sur Discord. Utilisez le bouton <strong>🎨 Aperçu Discord</strong> pour voir le rendu avec la mise en forme Markdown.
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 8px 0' }}>
          Pour personnaliser le contenu, modifiez les <strong>variables du formulaire</strong> ou le <strong>template</strong> via la Gestion des templates.
        </p>
      </section>
    </div>
  );
}
