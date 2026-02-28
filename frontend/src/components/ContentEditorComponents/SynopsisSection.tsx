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
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '150px' }}>
        <label style={{
          display: 'block',
          fontSize: 13,
          color: 'var(--muted)',
          marginBottom: 6,
          fontWeight: 600
        }}>
          Synopsis
        </label>

        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Décrivez le jeu..."
          style={{
            width: '100%',
            flex: 1,
            minHeight: 0,
            borderRadius: 6,
            padding: '12px',
            fontFamily: 'inherit',
            fontSize: 14,
            lineHeight: 1.5,
            resize: 'none',
            overflowY: 'auto',
            opacity: disabled ? 0.6 : 1,
            cursor: disabled ? 'not-allowed' : 'text',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            color: 'var(--text)'
          }}
          className="styled-scrollbar"
        />
      </div>
    );
  }
);

SynopsisSection.displayName = 'SynopsisSection';

export default SynopsisSection;
