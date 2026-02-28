// frontend/src/components/ContentEditorComponents/SynopsisSection.tsx
import { forwardRef } from 'react';

interface SynopsisSectionProps {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}

const SynopsisSection = forwardRef<HTMLTextAreaElement, SynopsisSectionProps>(
  ({ value, onChange, disabled }, ref) => {
    return (
      <div className="form-field form-field--fill">
        <label className="form-label">Synopsis</label>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Décrivez le jeu..."
          className={`form-textarea form-textarea--fill styled-scrollbar ${disabled ? 'form-textarea--disabled' : ''}`}
        />
      </div>
    );
  }
);

SynopsisSection.displayName = 'SynopsisSection';

export default SynopsisSection;
