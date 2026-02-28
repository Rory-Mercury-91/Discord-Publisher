// frontend\src\components\HelpCenter\components\ShortcutsHelp.tsx

export default function ShortcutsHelp() {
  const shortcuts = [
    {
      category: 'Navigation générale',
      items: [
        { keys: 'Ctrl + H', description: "Ouvrir l'historique des publications" },
        { keys: 'Ctrl + T', description: 'Basculer entre thème clair et sombre' },
        { keys: 'Échap', description: 'Fermer la modale active (Configuration, Aide, etc.)' },
      ]
    },
    {
      category: 'Éditeur de contenu',
      items: [
        { keys: 'Ctrl + Z', description: 'Annuler (Undo) dans les champs de texte' },
        { keys: 'Ctrl + Y', description: 'Refaire (Redo) dans les champs de texte' },
        { keys: 'Ctrl + S', description: 'Sauvegarder le template actif (dans la modale Templates)' },
      ]
    },
    {
      category: 'Bibliothèque',
      items: [
        { keys: 'Ctrl + R', description: 'Rafraîchir la bibliothèque (bouton ↻)' },
      ]
    }
  ];

  return (
    <div className="help-content-inner">
      <section className="help-intro">
        <h4 className="help-section__title">⌨️ Raccourcis clavier disponibles</h4>
        <p>
          L'application dispose de plusieurs raccourcis clavier pour gagner en rapidité. Voici la liste complète :
        </p>
      </section>

      {shortcuts.map((section, idx) => (
        <section key={idx} className="help-section help-section--info">
          <h5 className="help-shortcuts-category__title">{section.category}</h5>
          <div className="help-shortcut-list">
            {section.items.map((item, itemIdx) => (
              <div key={itemIdx} className="help-shortcut-row">
                <kbd>{item.keys}</kbd>
                <span>{item.description}</span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="help-section help-section--tip">
        <span>💡 <strong>Astuce :</strong> La plupart des champs de texte supportent les raccourcis classiques du navigateur (Ctrl+Z, Ctrl+Y, etc.).</span>
      </section>
    </div>
  );
}
