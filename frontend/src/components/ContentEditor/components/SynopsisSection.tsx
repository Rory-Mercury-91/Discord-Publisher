// frontend/src/components/ContentEditorComponents/SynopsisSection.tsx
import { forwardRef } from 'react';

interface SynopsisSectionProps {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  onTranslate?: () => void;
  translating?: boolean;
}

const SynopsisSection = forwardRef<HTMLTextAreaElement, SynopsisSectionProps>(
  ({ value, onChange, disabled, onTranslate, translating }, ref) => {
    return (
      <div className="form-field form-field--fill">
        <div className="editor-section-header">
          <label className="form-label">Synopsis</label>
          {onTranslate && (
            <button
              type="button"
              className="editor-section-header-btn"
              onClick={onTranslate}
              disabled={disabled || translating || !value.trim()}
              title="Traduire le synopsis (EN → FR) via Google Translate"
            >
              {translating ? 'Traduction…' : 'Traduire'}
            </button>
          )}
        </div>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Décrivez le jeu..."
          className={`form-textarea form-textarea--fill form-textarea--synopsis styled-scrollbar ${disabled ? 'form-textarea--disabled' : ''}`}
        />
      </div>
    );
  }
);

SynopsisSection.displayName = 'SynopsisSection';

export default SynopsisSection;
