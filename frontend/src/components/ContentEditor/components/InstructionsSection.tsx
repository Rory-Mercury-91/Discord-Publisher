// frontend/src/components/ContentEditorComponents/InstructionsSection.tsx

interface InstructionsSectionProps {
  value: string;
  onChange: (value: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showSuggestions: boolean;
  onSuggestionsToggle: (show: boolean) => void;
  filteredInstructions: string[];
  onSelectInstruction: (name: string) => void;
  disabled: boolean;
  savedInstructions: Record<string, string>;
}

export default function InstructionsSection({
  value,
  onChange,
  searchQuery,
  onSearchChange,
  showSuggestions,
  onSuggestionsToggle,
  filteredInstructions,
  onSelectInstruction,
  disabled,
  savedInstructions,
}: InstructionsSectionProps) {
  return (
    <div className="form-field form-field--fill">
      <div className="dropdown-wrap">
        <label className="form-label">Instructions d'installation</label>
        <input
          type="text"
          className={`form-input app-input ${disabled ? 'form-input--disabled' : ''}`}
          placeholder="Rechercher une instruction..."
          value={searchQuery}
          onChange={(e) => {
            onSearchChange(e.target.value);
            onSuggestionsToggle(true);
          }}
          onFocus={() => onSuggestionsToggle(true)}
        />

        {showSuggestions && filteredInstructions.length > 0 && (
          <div className="suggestions-dropdown dropdown-panel">
            {filteredInstructions.map((name, idx) => (
              <div
                key={idx}
                className="suggestion-item"
                onClick={() => onSelectInstruction(name)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onSelectInstruction(name)}
              >
                <div className="suggestion-item__name">{name}</div>
                <div className="suggestion-item__preview">
                  {savedInstructions[name]?.substring(0, 60)}{savedInstructions[name]?.length > 60 ? '...' : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Tapez ou sélectionnez une instruction..."
        className={`form-textarea form-textarea--fill form-textarea--mono styled-scrollbar ${disabled ? 'form-textarea--disabled' : ''}`}
      />
    </div>
  );
}
