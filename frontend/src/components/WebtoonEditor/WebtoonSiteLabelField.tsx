import { useId, useState } from 'react';

type WebtoonSiteLabelFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  pickerEnabled: boolean;
  recentLabels: string[];
};

/** Champ « Site » avec liste des derniers libellés si l'option est activée. */
export default function WebtoonSiteLabelField({
  value,
  onChange,
  placeholder,
  pickerEnabled,
  recentLabels,
}: WebtoonSiteLabelFieldProps) {
  const listId = useId();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const canPick = pickerEnabled && recentLabels.length > 0;

  const filtered = canPick
    ? recentLabels.filter(label => {
        const q = value.trim().toLowerCase();
        if (!q) return true;
        return label.toLowerCase().includes(q);
      })
    : [];

  const openList = () => {
    if (canPick) setShowSuggestions(true);
  };

  return (
    <div className="form-field webtoon-site-label-field">
      <label className="form-label">Site</label>
      <div className="webtoon-site-label-field__row">
        <div className={`dropdown-wrap webtoon-site-label-field__input-wrap${canPick ? '' : ' webtoon-site-label-field__input-wrap--plain'}`}>
          <input
            value={value}
            onChange={e => onChange(e.target.value)}
            onFocus={openList}
            className="form-input"
            placeholder={placeholder}
            list={canPick ? listId : undefined}
            autoComplete="off"
          />
          {canPick && (
            <datalist id={listId}>
              {recentLabels.map(label => (
                <option key={label} value={label} />
              ))}
            </datalist>
          )}
          {showSuggestions && filtered.length > 0 && (
            <div className="suggestions-dropdown dropdown-panel webtoon-site-label-field__suggestions">
              {filtered.map(label => (
                <div
                  key={label}
                  className="suggestion-item"
                  role="button"
                  tabIndex={0}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    onChange(label);
                    setShowSuggestions(false);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      onChange(label);
                      setShowSuggestions(false);
                    }
                  }}
                >
                  <div className="suggestion-item__name">{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        {canPick && (
          <button
            type="button"
            className="form-btn form-btn--ghost webtoon-site-label-field__pick-btn"
            title="Choisir parmi les derniers sites renseignés"
            onClick={() => setShowSuggestions(v => !v)}
          >
            Récents
          </button>
        )}
      </div>
      {showSuggestions && filtered.length > 0 && (
        <button
          type="button"
          className="webtoon-site-label-field__backdrop"
          aria-label="Fermer la liste"
          onClick={() => setShowSuggestions(false)}
        />
      )}
    </div>
  );
}
