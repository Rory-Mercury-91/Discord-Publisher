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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '150px' }}>
      {/* Recherche d'instruction */}
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <label style={{
          display: 'block',
          fontSize: 13,
          color: 'var(--muted)',
          marginBottom: 6,
          fontWeight: 600
        }}>
          Instructions d'installation
        </label>

        <input
          type="text"
          className="app-input"
          placeholder="Rechercher une instruction..."
          value={searchQuery}
          onChange={(e) => {
            onSearchChange(e.target.value);
            onSuggestionsToggle(true);
          }}
          onFocus={() => onSuggestionsToggle(true)}
          style={{
            width: '100%',
            opacity: disabled ? 0.6 : 1,
            cursor: disabled ? 'not-allowed' : 'text'
          }}
        />

        {/* Suggestions dropdown */}
        {showSuggestions && filteredInstructions.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1001,
            maxHeight: '200px',
            overflowY: 'auto',
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            marginTop: 4,
            boxShadow: '0 8px 20px rgba(0,0,0,0.3)'
          }}>
            {filteredInstructions.map((name, idx) => (
              <div
                key={idx}
                onClick={() => onSelectInstruction(name)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  borderBottom: idx < filteredInstructions.length - 1 ? '1px solid var(--border)' : 'none',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {savedInstructions[name]?.substring(0, 60)}{savedInstructions[name]?.length > 60 ? '...' : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Textarea principal */}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Tapez ou sélectionnez une instruction..."
        style={{
          width: '100%',
          flex: 1,
          minHeight: 0,
          borderRadius: 6,
          padding: '12px',
          fontFamily: 'monospace',
          fontSize: 13,
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
