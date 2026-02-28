// frontend/src/components/Toggle.tsx
// Composant toggle unique (style : label à gauche, piste arrondie violette, pastille blanche)

export interface ToggleProps {
  /** État activé/désactivé */
  checked: boolean;
  /** Appelé au clic avec la nouvelle valeur */
  onChange: (checked: boolean) => void;
  /** Libellé affiché à gauche du switch */
  label: string;
  /** Désactive le toggle */
  disabled?: boolean;
  /** Texte au survol (title) */
  title?: string;
  /** Taille : md (défaut) ou sm */
  size?: 'sm' | 'md';
  /** Classe CSS optionnelle pour le conteneur */
  className?: string;
  /** Afficher le libellé en majuscules (style "SUIVI") */
  labelUppercase?: boolean;
}

const TRACK_WIDTH = { sm: 36, md: 44 };
const TRACK_HEIGHT = { sm: 20, md: 24 };
const KNOB_SIZE = { sm: 14, md: 18 };
const KNOB_OFFSET = 3;

export default function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  title,
  size = 'md',
  className,
  labelUppercase = false,
}: ToggleProps) {
  const w = TRACK_WIDTH[size];
  const h = TRACK_HEIGHT[size];
  const d = KNOB_SIZE[size];
  const knobLeft = checked ? w - d - KNOB_OFFSET : KNOB_OFFSET;

  const handleClick = () => {
    if (!disabled) onChange(!checked);
  };

  return (
    <label
      className={className}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        style={{
          fontSize: size === 'sm' ? 12 : 13,
          fontWeight: 600,
          color: 'var(--muted)',
          textTransform: labelUppercase ? 'uppercase' : 'none',
          letterSpacing: labelUppercase ? 0.5 : 0,
        }}
      >
        {label}
      </span>
      <div
        role="switch"
        aria-checked={checked}
        aria-label={label}
        tabIndex={disabled ? -1 : 0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (!disabled) onChange(!checked);
          }
        }}
        style={{
          position: 'relative',
          width: w,
          height: h,
          flexShrink: 0,
          borderRadius: h / 2,
          background: checked ? 'var(--accent)' : 'var(--border)',
          transition: 'background 0.2s ease',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: (h - d) / 2,
            left: knobLeft,
            width: d,
            height: d,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s ease',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}
        />
      </div>
    </label>
  );
}
