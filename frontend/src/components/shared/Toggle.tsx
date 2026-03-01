// Composant toggle partagé (label à gauche, piste arrondie, pastille)
// Styles via variables CSS dans global.css : --accent, --border, --muted, --toggle-knob

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
  const handleClick = () => {
    if (!disabled) onChange(!checked);
  };

  const labelClasses = [
    'toggle__label',
    labelUppercase ? 'toggle__label--uppercase' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <label
      className={[
        'toggle',
        `toggle--${size}`,
        disabled ? 'toggle--disabled' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={title}
    >
      <span className={labelClasses}>{label}</span>
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
        className={`toggle__track ${checked ? 'toggle__track--checked' : ''}`}
      >
        <div className="toggle__knob" />
      </div>
    </label>
  );
}
