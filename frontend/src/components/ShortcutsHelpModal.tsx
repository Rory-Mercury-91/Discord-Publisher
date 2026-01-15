import React from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

interface ShortcutsHelpModalProps {
  onClose?: () => void;
}

export default function ShortcutsHelpModal({ onClose }: ShortcutsHelpModalProps) {
  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  const shortcuts = [
    {
      category: 'Navigation',
      items: [
        { keys: 'Ctrl + H', description: 'Ouvrir l\'historique des publications' },
        { keys: 'Ctrl + T', description: 'Basculer entre thème clair/sombre' },
      ]
    },
    {
      category: 'Édition',
      items: [
        { keys: 'Ctrl + Z', description: 'Annuler (Undo) dans le champ Synopsis' },
        { keys: 'Ctrl + Y', description: 'Refaire (Redo) dans le champ Synopsis' },
        { keys: 'Ctrl + S', description: 'Sauvegarder le template (modale Templates)' },
      ]
    },
    {
      category: 'Interface',
      items: [
        { keys: 'Échap', description: 'Fermer la modale active' },
      ]
    }
  ];

  return (
    <div className="modal">
      <div className="panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 1000, width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <h3>⌨️ Raccourcis clavier</h3>

        <div style={{ display: 'grid', gap: 24, marginTop: 16, overflowY: 'auto', flex: 1 }}>
          {shortcuts.map((section, idx) => (
            <div key={idx}>
              <h4 style={{ 
                margin: '0 0 12px 0', 
                fontSize: 15, 
                color: 'var(--accent)',
                borderBottom: '1px solid var(--border)',
                paddingBottom: 8
              }}>
                {section.category}
              </h4>
              <div style={{ display: 'grid', gap: 8 }}>
                {section.items.map((item, itemIdx) => (
                  <div 
                    key={itemIdx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '150px 1fr',
                      gap: 16,
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 6
                    }}
                  >
                    <kbd style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      background: 'var(--bg-secondary)',
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
            </div>
          ))}
        </div>

        <div style={{ 
          marginTop: 24, 
          padding: 12, 
          background: 'rgba(74, 158, 255, 0.1)',
          border: '1px solid rgba(74, 158, 255, 0.3)',
          borderRadius: 6,
          fontSize: 13,
          color: 'var(--muted)'
        }}>
          💡 <strong>Astuce :</strong> Vous pouvez aussi cliquer sur le bouton <strong>?</strong> à côté du bouton de thème pour afficher cette aide.
        </div>

        <div style={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          marginTop: 16,
          paddingTop: 16,
          borderTop: '1px solid var(--border)'
        }}>
          <button onClick={onClose}>🚪 Fermer</button>
        </div>
      </div>
    </div>
  );
}
