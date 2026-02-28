// frontend\src\components\HelpComponents\TemplatesHelp.tsx

export default function TemplatesHelp() {
  return (
    <div className="help-content-inner">

      <section className="help-intro">
        <h4 className="help-section__title">📄 À quoi servent les templates ?</h4>
        <p>
          Les templates définissent la structure du message Discord (titre, corps, mise en forme). Ils contiennent des <strong>variables</strong> entre crochets (ex. <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[Game_name]</code>, <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[instruction]</code>, <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[Overview]</code>) qui sont remplacées par les valeurs du formulaire <strong>au moment de leur écriture</strong> dans l'éditeur de contenu.
        </p>
        <p>La fenêtre <strong>Gestion des templates & variables</strong> s'ouvre via le bouton <strong>« 📄 Templates »</strong> (dans l'en-tête). Les modifications sont synchronisées automatiquement avec Supabase.</p>
      </section>

      <section className="help-section help-section--info">
        <h4 className="help-section__title">📚 Mes templates</h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Liste de vos templates : cliquez sur un template pour l'éditer. Vous pouvez <strong>créer</strong> un nouveau (saisir le nom puis bouton « ➕ Créer ») et <strong>supprimer</strong> un template (🗑️ sur le template sélectionné). Le template par défaut (⭐) ne peut pas être supprimé.
        </p>
      </section>

      <section className="help-section help-section--success">
        <h4 className="help-section__title">📄 Zone Template</h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Contenu du template sélectionné, rédigé en Markdown. Le bouton <strong>?</strong> à côté du nom ouvre l'aide Markdown. Pour le template par défaut, le bouton <strong>🔄 Restaurer</strong> rétablit le contenu d'origine.
        </p>
      </section>

      <section className="help-section help-section--info">
        <h4 className="help-section__title">💡 Variables (cliquez pour copier)</h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Toutes les variables disponibles sont listées sous la zone de contenu. Un clic sur une variable copie <code style={{ fontFamily: 'monospace', fontSize: 11 }}>[NomVariable]</code> dans le presse-papier pour l'insérer dans le template.
        </p>
      </section>

      <section className="help-section help-section--warning">
        <h4 className="help-section__title">🔧 Variables personnalisées</h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Ajoutez, modifiez ou supprimez des variables (nom, label, type texte ou textarea). Elles apparaissent dans le formulaire de l'éditeur de contenu et dans la liste des variables à copier.
        </p>
      </section>

      <section className="help-section help-section--info">
        <h4 className="help-section__title">📤 Exporter / 📥 Importer</h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          <strong>Exporter</strong> : enregistre les templates et les variables en fichier JSON. <strong>Importer</strong> : charge un fichier JSON exporté pour réutiliser une configuration (ex. une version adaptée à une traduction).
        </p>
      </section>

      <section className="help-section help-section--tip">
        <h4 className="help-section__title">Enregistrer ou annuler</h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          <strong>Annuler</strong> ferme la fenêtre sans enregistrer. <strong>Enregistrer</strong> applique les changements (raccourci <strong>Ctrl+S</strong>).
        </p>
      </section>
    </div>
  );
}
