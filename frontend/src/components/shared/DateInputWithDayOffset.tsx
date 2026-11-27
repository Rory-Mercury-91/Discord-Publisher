import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addDaysFromTodayIso,
  formatDateForDisplay,
  isoDateToDaysFromToday,
  parseDaysOffsetInput,
  resolveStoredDateValue,
} from '../../state/logic/formatVar';

type DateInputWithDayOffsetProps = {
  label: string;
  value: string;
  onChange: (isoOrEmpty: string) => void;
  disabled?: boolean;
  id?: string;
};

/** Date picker + délai en jours, synchronisés dans les deux sens. */
export default function DateInputWithDayOffset({
  label,
  value,
  onChange,
  disabled = false,
  id,
}: DateInputWithDayOffsetProps) {
  const [offsetDraft, setOffsetDraft] = useState('');
  const offsetFocusedRef = useRef(false);
  const skipOffsetSyncRef = useRef(false);

  const isoValue = resolveStoredDateValue(value);
  const showIso = /^\d{4}-\d{2}-\d{2}$/.test(isoValue);

  const syncOffsetDisplayFromIso = useCallback((iso: string) => {
    if (!iso) {
      setOffsetDraft('');
      return;
    }
    const days = isoDateToDaysFromToday(iso);
    if (days !== null) setOffsetDraft(String(days));
  }, []);

  useEffect(() => {
    if (offsetFocusedRef.current || skipOffsetSyncRef.current) return;
    if (!showIso) {
      setOffsetDraft('');
      return;
    }
    syncOffsetDisplayFromIso(isoValue);
  }, [isoValue, showIso, syncOffsetDisplayFromIso]);

  const applyOffset = useCallback(
    (raw: string) => {
      const days = parseDaysOffsetInput(raw);
      if (days === null) return false;
      skipOffsetSyncRef.current = true;
      onChange(addDaysFromTodayIso(days));
      setOffsetDraft(String(days));
      skipOffsetSyncRef.current = false;
      return true;
    },
    [onChange]
  );

  const handleDateChange = useCallback(
    (iso: string) => {
      skipOffsetSyncRef.current = true;
      onChange(iso);
      if (!offsetFocusedRef.current) {
        syncOffsetDisplayFromIso(iso);
      }
      skipOffsetSyncRef.current = false;
    },
    [onChange, syncOffsetDisplayFromIso]
  );

  const handleOffsetKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyOffset(offsetDraft);
    }
  };

  const handleOffsetBlur = () => {
    offsetFocusedRef.current = false;
    const trimmed = offsetDraft.trim();
    if (!trimmed) {
      onChange('');
      setOffsetDraft('');
      return;
    }
    applyOffset(trimmed);
  };

  return (
    <div className="form-field date-input-offset">
      {label ? (
        <label className="form-label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <input
        id={id}
        type="date"
        value={showIso ? isoValue : ''}
        onChange={e => handleDateChange(e.target.value)}
        disabled={disabled}
        className={`form-input ${disabled ? 'form-input--disabled' : ''}`}
      />
      <div className="date-input-offset__row">
        <span className="date-input-offset__label">ou dans</span>
        <input
          id={id ? `${id}-offset` : undefined}
          type="text"
          value={offsetDraft}
          onChange={e => setOffsetDraft(e.target.value)}
          onFocus={() => {
            offsetFocusedRef.current = true;
          }}
          onKeyDown={handleOffsetKeyDown}
          onBlur={handleOffsetBlur}
          disabled={disabled}
          className={`form-input date-input-offset__days ${disabled ? 'form-input--disabled' : ''}`}
          placeholder="468"
          inputMode="numeric"
          aria-label={label ? `${label} — délai en jours` : 'Délai en jours'}
        />
      </div>
      {showIso && (
        <p className="date-input-offset__hint settings-log-description">
          {formatDateForDisplay(isoValue)}
        </p>
      )}
    </div>
  );
}
