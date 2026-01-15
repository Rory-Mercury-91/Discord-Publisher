import React from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

interface MarkdownHelpModalProps {
  onClose?: () => void;
}

export default function MarkdownHelpModal({ onClose }: MarkdownHelpModalProps) {
  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  const examples = [
    {
      category: '📝 Titres',
      items: [
        { syntax: '# Titre 1', description: 'Titre principal (très grand)' },
        { syntax: '## Titre 2', description: 'Sous-titre (grand)' },
        { syntax: '### Titre 3', description: 'Sous-sous-titre (moyen)' }
      ]
    },
    {
      category: '✨ Mise en forme du texte',
      items: [
        { syntax: '**texte en gras**', description: 'Texte en gras' },
        { syntax: '*texte en italique*', description: 'Texte en italique' },
        { syntax: '***gras et italique***', description: 'Texte en gras et italique' },
        { syntax: '~~texte barré~~', description: 'Texte barré' },
        { syntax: '__souligné__', description: 'Texte souligné' },
        { syntax: '`code`', description: 'Code inline' }
      ]
    },
    {
      category: '🔗 Liens',
      items: [
        { syntax: '[Texte du lien](https://exemple.com)', description: 'Lien hypertexte' },
        { syntax: 'https://exemple.com', description: 'Lien automatique (Discord)' }
      ]
    },
    {
      category: '📋 Listes',
      items: [
        { syntax: '- Item 1\n- Item 2\n- Item 3', description: 'Liste à puces' },
        { syntax: '1. Premier\n2. Deuxième\n3. Troisième', description: 'Liste numérotée' }
      ]
    },
    {
      category: '💬 Citations',
      items: [
        { syntax: '> Citation', description: 'Citation simple' },
        { syntax: '>>> Citation\nmultiligne', description: 'Citation multiligne (Discord)' }
      ]
    },
    {
      category: '💻 Blocs de code',
      items: [
        { syntax: '```\nCode multiligne\n```', description: 'Bloc de code' },
        { syntax: '```python\nprint("Hello")\n```', description: 'Bloc de code avec syntaxe colorée' }
      ]
    },
    {
      category: '📐 Autres',
      items: [
        { syntax: '||texte caché||', description: 'Spoiler (Discord)' },
        { syntax: ':emoji:', description: 'Emoji (ex: :fire: pour 🔥)' }
      ]
    }
  ];

  return (
    <div className="modal">
      <div 
        className="panel" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          maxWidth: 1000, 
          width: '95%', 
          maxHeight: '90vh', 
          display: 'flex', 
          flexDirection: 'column' 
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>❓ Aide Markdown</h3>
          <button onClick={onClose} className="btn" style={{ padding: '4px 8px', fontSize: 14 }}>✕</button>
        </div>

        <div style={{ 
          padding: 12, 
          background: 'rgba(59, 130, 246, 0.1)', 
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 13,
          lineHeight: 1.6
        }}>
          <strong>💡 Astuce :</strong> Discord supporte une grande partie de la syntaxe Markdown. 
          Vous pouvez utiliser ces balises pour formater vos publications.
        </div>

        {/* Contenu scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', marginRight: -16, paddingRight: 16 }}>
          <div style={{ display: 'grid', gap: 20 }}>
            {examples.map((section, idx) => (
              <div key={idx}>
                <h4 style={{ 
                  fontSize: 15, 
                  marginBottom: 12, 
                  paddingBottom: 8,
                  borderBottom: '1px solid var(--border)'
                }}>
                  {section.category}
                </h4>
                <div style={{ display: 'grid', gap: 10 }}>
                  {section.items.map((item, itemIdx) => (
                    <div 
                      key={itemIdx}
                      style={{ 
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 12,
                        padding: 12,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        fontSize: 13
                      }}
                    >
                      <div>
                        <div style={{ 
                          fontSize: 11, 
                          color: 'var(--muted)', 
                          marginBottom: 4,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5
                        }}>
                          Syntaxe
                        </div>
                        <code style={{ 
                          display: 'block',
                          padding: '6px 8px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 4,
                          fontFamily: 'Monaco, Consolas, monospace',
                          fontSize: 12,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          color: '#a5d6ff'
                        }}>
                          {item.syntax}
                        </code>
                      </div>
                      <div>
                        <div style={{ 
                          fontSize: 11, 
                          color: 'var(--muted)', 
                          marginBottom: 4,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5
                        }}>
                          Description
                        </div>
                        <div style={{ 
                          padding: '6px 8px',
                          color: 'var(--text)',
                          lineHeight: 1.5
                        }}>
                          {item.description}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ 
          marginTop: 16, 
          paddingTop: 16, 
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 12,
          color: 'var(--muted)'
        }}>
          <span>
            📚 Pour plus d'infos : <a 
              href="https://support.discord.com/hc/fr/articles/210298617" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: '#5865f2', textDecoration: 'none' }}
            >
              Documentation Discord
            </a>
          </span>
          <button onClick={onClose} className="btn">
            🚪 Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
