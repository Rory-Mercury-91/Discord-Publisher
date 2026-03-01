import type { AppMode } from '../constants';

interface ModeOption {
  id: AppMode;
  label: string;
  title: string;
}

interface HeaderModeSwitchProps {
  mode: AppMode;
  options: ModeOption[];
  onModeChange: (m: AppMode) => void;
}

export default function HeaderModeSwitch({
  mode,
  options,
  onModeChange,
}: HeaderModeSwitchProps) {
  return (
    <div className="app-header-mode-switch">
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          className={
            mode === opt.id
              ? 'app-header-mode-switch__btn app-header-mode-switch__btn--active'
              : 'app-header-mode-switch__btn'
          }
          onClick={() => onModeChange(opt.id)}
          title={opt.title}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
