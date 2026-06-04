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
    <div className="preview-toolbar">
      <div className="preview-toolbar__start">
        {templateName && availableTemplates.length > 0 && (
          <div ref={dropdownRef} className="preview-toolbar__template-wrap">
            <button
              type="button"
              className="preview-toolbar__template-btn"
              onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
              title={templateName}
            >
              <span className="preview-toolbar__template-icon" aria-hidden>
                📄
              </span>
              <span className="preview-toolbar__template-name">{templateName}</span>
              <span className="preview-toolbar__template-caret" aria-hidden>
                {showTemplateDropdown ? '▲' : '▼'}
              </span>
            </button>

            {showTemplateDropdown && (
              <div className="preview-toolbar__template-menu styled-scrollbar">
                {availableTemplates.map((template, idx) => {
                  const isActive = idx === currentTemplateIdx;
                  return (
                    <button
                      key={template.id || idx}
                      type="button"
                      className={`preview-toolbar__template-item${isActive ? ' preview-toolbar__template-item--active' : ''}`}
                      onClick={() => {
                        onTemplateChange?.(idx);
                        setShowTemplateDropdown(false);
                      }}
                    >
                      {template.isDefault && <span aria-hidden>⭐</span>}
                      <span className="preview-toolbar__template-item-name">{template.name}</span>
                      {isActive && (
                        <span style={{ color: 'var(--accent)', fontSize: 16 }} aria-hidden>
                          ✓
                        </span>
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
            className="preview-toolbar__discord-btn"
            onClick={onOpenDiscordPreview}
            title="Aperçu Discord"
          >
            <img src={DiscordIcon} alt="" />
            <span className="preview-toolbar__discord-label">Aperçu Discord</span>
          </button>
        )}
      </div>

      <div className="preview-toolbar__end">
        <div
          className={`preview-toolbar__count${isOverLimit ? ' preview-toolbar__count--over' : ''}`}
          title="Nombre de caractères du message"
        >
          {characterCount} / 2000
          {isOverLimit && (
            <span className="preview-toolbar__count-warn" aria-hidden>
              ⚠️ +{characterCount - 2000}
            </span>
          )}
        </div>
        <button
          type="button"
          className="preview-toolbar__copy-btn"
          onClick={onCopy}
          title="Copier le preview"
        >
          <span aria-hidden>📋</span>
          <span className="preview-toolbar__copy-label">Copier</span>
        </button>
      </div>
    </div>
  );
}
