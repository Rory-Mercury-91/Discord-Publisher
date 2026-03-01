import type { OwnerOption } from '../constants';

interface InstructionsFilterProps {
  label: string;
  value: string;
  options: OwnerOption[];
  onChange: (value: string) => void;
}

export default function InstructionsFilter({
  label,
  value,
  options,
  onChange,
}: InstructionsFilterProps) {
  return (
    <div className="instructions-filter">
      <label className="instructions-filter__label">{label}</label>
      <select
        className="instructions-filter__select"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(o => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
