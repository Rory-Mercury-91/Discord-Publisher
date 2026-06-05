import Toggle from '../shared/Toggle';
import { WEEKDAY_OPTIONS } from '../../state/workTracking/registry';
import { parseReleaseWeekdays, serializeReleaseWeekdays } from '../../state/workTracking/releaseWeekdays';

type Props = {
  value: string;
  onChange: (serialized: string) => void;
  disabled?: boolean;
};

export default function ReleaseWeekdaysPicker({ value, onChange, disabled }: Props) {
  const selected = new Set(parseReleaseWeekdays(value));

  const toggleDay = (day: number, checked: boolean) => {
    if (disabled) return;
    const next = new Set(selected);
    if (checked) next.add(day);
    else next.delete(day);
    onChange(serializeReleaseWeekdays([...next]));
  };

  return (
    <div className="webtoon-editor__weekdays" role="group" aria-label="Jours de sortie">
      {WEEKDAY_OPTIONS.map(opt => (
        <Toggle
          key={opt.value}
          size="sm"
          label={opt.label}
          labelContent={
            <>
              <span className="webtoon-editor__weekday-label webtoon-editor__weekday-label--long">
                {opt.label}
              </span>
              <span className="webtoon-editor__weekday-label webtoon-editor__weekday-label--short">
                {opt.short}
              </span>
            </>
          }
          title={opt.label}
          checked={selected.has(opt.value)}
          onChange={checked => toggleDay(opt.value, checked)}
          disabled={disabled}
          className="webtoon-editor__weekday-toggle"
        />
      ))}
    </div>
  );
}
