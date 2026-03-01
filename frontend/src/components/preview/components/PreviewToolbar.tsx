import { useEffect, useRef, useState } from 'react';
import DiscordIcon from '../../../assets/discord-icon.svg';

interface TemplateOption {
  id: string;
  name: string;
  isDefault?: boolean;
}

interface PreviewToolbarProps {
  templateName?: string;
  availableTemplates?: TemplateOption[];
  currentTemplateIdx?: number;
  onTemplateChange?: (index: number) => void;
  onOpenDiscordPreview?: () => void;
  characterCount: number;
  isOverLimit: boolean;
  onCopy: () => void;
}

export default function PreviewToolbar({
  templateName,
  availableTemplates = [],
  currentTemplateIdx = 0,
  onTemplateChange,
  onOpenDiscordPreview,
  characterCount,
  isOverLimit,
  onCopy,
}: PreviewToolbarProps) {
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowTemplateDropdown(false);
      }
    };

    if (showTemplateDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTemplateDropdown]);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
        flexWrap: 'nowrap',
        gap: 8,
        height: 32,
        minHeight: 32,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap' }}>
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
                background: 'var(--accent-bg-subtle)',
                border: '1px solid var(--accent-border)',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
                height: 32,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--accent-bg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--accent-bg-subtle)';
              }}
            >
              <span style={{ fontSize: 16 }}>📄</span>
              <span>{templateName}</span>
              <span style={{ fontSize: 10, opacity: 0.7 }}>
                {showTemplateDropdown ? '▲' : '▼'}
              </span>
            </button>

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
                  padding: 4,
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
                        onTemplateChange?.(idx);
                        setShowTemplateDropdown(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 6,
                        border: 'none',
                        background: isActive ? 'var(--accent-bg)' : 'transparent',
                        color: 'var(--text)',
                        fontSize: 13,
                        fontWeight: isActive ? 700 : 500,
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {template.isDefault && <span>⭐</span>}
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                      >
                        {template.name}
                      </span>
                      {isActive && (
                        <span style={{ color: 'var(--accent)', fontSize: 16 }}>✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {onOpenDiscordPreview && (
          <button
            type="button"
            onClick={onOpenDiscordPreview}
            style={{
              padding: '0 12px',
              background: 'transparent',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              height: 32,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--link-preview-bg)';
              e.currentTarget.style.borderColor = 'var(--link-preview)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <img src={DiscordIcon} alt="" style={{ width: 18, height: 18, marginRight: 6 }} />
            Aperçu Discord
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: isOverLimit ? 'var(--error)' : 'var(--text)',
            padding: '0 12px',
            background: isOverLimit ? 'var(--error-bg)' : 'var(--accent-bg-subtle)',
            border: `1px solid ${isOverLimit ? 'var(--error)' : 'var(--accent-border)'}`,
            borderRadius: 6,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          {characterCount} / 2000
          {isOverLimit && (
            <span style={{ marginLeft: 8, fontSize: 11 }}>⚠️ +{characterCount - 2000}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onCopy}
          title="Copier le preview"
          style={{
            padding: '0 12px',
            fontSize: 13,
            height: 32,
            border: '1px solid var(--border)',
            borderRadius: 6,
            cursor: 'pointer',
            background: 'transparent',
            color: 'inherit',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          📋 Copier
        </button>
      </div>
    </div>
  );
}
