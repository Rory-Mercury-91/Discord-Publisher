import { useEffect, useRef, useState } from 'react';

interface PreviewProps {
  /** Contenu affiché (template + variables) en lecture seule. */
  preview: string;
  setPreviewContent: (value: string) => void;
  onCopy: () => void;
  onOpenDiscordPreview?: () => void;
  /** 🆕 Nom du template actuellement utilisé */
  templateName?: string;
  /** 🆕 Liste de tous les templates disponibles */
  availableTemplates?: Array<{ id: string; name: string; isDefault?: boolean }>;
  /** 🆕 Index du template actuel */
  currentTemplateIdx?: number;
  /** 🆕 Callback pour changer de template */
  onTemplateChange?: (index: number) => void;
}

export default function Preview({
  preview,
  setPreviewContent,
  onCopy,
  onOpenDiscordPreview,
  templateName,
  availableTemplates = [],
  currentTemplateIdx = 0,
  onTemplateChange
}: PreviewProps) {
  const characterCount = preview.length;
  const isOverLimit = characterCount > 2000;

  // État du dropdown de sélection de template
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fermer le dropdown si on clique à l'extérieur
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowTemplateDropdown(false);
      }
    };

    if (showTemplateDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTemplateDropdown]);

  return (
    <div className="preview-section" style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      height: '100%',
      minHeight: 0,
      background: 'var(--bg)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* 🆕 Sélecteur de template cliquable */}
          {templateName && availableTemplates.length > 0 && (
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 12px',
                  background: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid rgba(99, 102, 241, 0.35)',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text)',
                  height: 32,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(99, 102, 241, 0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)';
                }}
              >
                <span style={{ fontSize: 16 }}>📄</span>
                <span>{templateName}</span>
                <span style={{ fontSize: 10, opacity: 0.7 }}>
                  {showTemplateDropdown ? '▲' : '▼'}
                </span>
              </button>

              {/* Dropdown des templates */}
              {showTemplateDropdown && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: 4,
                    minWidth: 200,
                    maxWidth: 300,
                    background: 'var(--panel)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    zIndex: 1000,
                    maxHeight: 300,
                    overflowY: 'auto',
                    padding: 4
                  }}
                  className="styled-scrollbar"
                >
                  {availableTemplates.map((template, idx) => {
                    const isActive = idx === currentTemplateIdx;
                    return (
                      <button
                        key={template.id || idx}
                        type="button"
                        onClick={() => {
                          if (onTemplateChange) {
                            onTemplateChange(idx);
                          }
                          setShowTemplateDropdown(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 6,
                          border: 'none',
                          background: isActive ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                          color: 'var(--text)',
                          fontSize: 13,
                          fontWeight: isActive ? 700 : 500,
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = 'transparent';
                          }
                        }}
                      >
                        {template.isDefault && <span>⭐</span>}
                        <span style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1
                        }}>
                          {template.name}
                        </span>
                        {isActive && <span style={{ color: 'var(--accent)', fontSize: 16 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {onOpenDiscordPreview && (
            <button
              onClick={onOpenDiscordPreview}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                height: 32,
                fontWeight: 500
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(88, 101, 242, 0.1)';
                e.currentTarget.style.borderColor = '#5865f2';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              🎨 Aperçu Discord
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: isOverLimit ? 'var(--error)' : 'var(--text)',
            padding: '6px 12px',
            background: isOverLimit ? 'rgba(239, 68, 68, 0.1)' : 'rgba(74, 158, 255, 0.1)',
            border: `1px solid ${isOverLimit ? 'var(--error)' : 'rgba(74, 158, 255, 0.3)'}`,
            borderRadius: 6,
            height: 32,
            display: 'flex',
            alignItems: 'center'
          }}>
            {characterCount} / 2000
            {isOverLimit && (
              <span style={{ marginLeft: 8, fontSize: 11 }}>
                ⚠️ +{characterCount - 2000}
              </span>
            )}
          </div>
          <button
            onClick={onCopy}
            title="Copier le preview"
            style={{
              padding: '6px 12px',
              fontSize: 13,
              height: 32,
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
              background: 'transparent',
              color: 'inherit'
            }}
          >
            📋 Copier
          </button>
        </div>
      </div>

      <div className="preview-body styled-scrollbar" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <textarea
          readOnly={true}
          value={preview}
          placeholder="L'aperçu (template + variables) s'affiche ici en lecture seule."
          style={{
            width: '100%',
            height: '100%',
            minHeight: 200,
            fontFamily: 'monospace',
            padding: 12,
            borderRadius: 6,
            background: '#2b2d31',
            color: '#dbdee1',
            border: '1px solid var(--border)',
            resize: 'none',
            cursor: 'default'
          }}
        />
      </div>
    </div>
  );
}
