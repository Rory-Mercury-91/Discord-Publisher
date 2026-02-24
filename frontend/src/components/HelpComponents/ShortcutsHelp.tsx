// frontend\src\components\HelpComponents\ShortcutsHelp.tsx

export default function ShortcutsHelp() {
  const shortcuts = [
    {
      category: 'Navigation générale',
      items: [
        { keys: 'Ctrl + H', description: 'Ouvrir l’historique des publications' },
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
        { keys: 'Ctrl + F', description: 'Mettre le focus sur la barre de recherche' },
        { keys: 'Ctrl + R', description: 'Rafraîchir la bibliothèque (bouton ↻)' },
      ]
    }
  ];

  return (
    <div style={{ display: 'grid', gap: 24 }}>

      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--accent)' }}>
          ⌨️ Raccourcis clavier disponibles
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          L’application dispose de plusieurs raccourcis clavier pour gagner en rapidité. Voici la liste complète :
        </p>
      </section>

      {shortcuts.map((section, idx) => (
        <section key={idx}>
          <h5 style={{
            margin: '0 0 12px 0',
            fontSize: 15,
            color: '#4a9eff',
            borderBottom: '1px solid var(--border)',
            paddingBottom: 8
          }}>
            {section.category}
          </h5>

          <div style={{ display: 'grid', gap: 8 }}>
            {section.items.map((item, itemIdx) => (
              <div
                key={itemIdx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 1fr',
                  gap: 16,
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 6
                }}
              >
                <kbd style={{
                  display: 'inline-block',
                  padding: '6px 12px',
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  fontSize: 13,
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}>
                  {item.keys}
                </kbd>
                <span style={{ fontSize: 14, color: 'var(--text)' }}>
                  {item.description}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 16,
        fontSize: 13,
        color: 'var(--muted)'
      }}>
        💡 <strong>Astuce :</strong> La plupart des champs de texte supportent les raccourcis classiques du navigateur (Ctrl+Z, Ctrl+Y, etc.).
      </section>

    </div>
  );
}
