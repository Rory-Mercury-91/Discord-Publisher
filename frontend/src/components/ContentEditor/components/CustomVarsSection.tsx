// frontend/src/components/ContentEditorComponents/CustomVarsSection.tsx

interface CustomVar {
  name: string;
  label: string;
  type?: 'text' | 'textarea';
  placeholder?: string;
}

interface CustomVarsSectionProps {
  visibleVars: CustomVar[];
  inputs: Record<string, string>;
  setInput: (name: string, value: string) => void;
  varsUsedInTemplate: Set<string>;
}

export default function CustomVarsSection({
  visibleVars,
  inputs,
  setInput,
  varsUsedInTemplate,
}: CustomVarsSectionProps) {
  if (visibleVars.length === 0) return null;

  return (
    <div className="form-grid form-grid--2col">
      {visibleVars.map((v) => {
        const isUsed = varsUsedInTemplate.has(v.name);
        const isTextarea = v.type === 'textarea';

        return (
          <div key={v.name} className={isTextarea ? 'form-field form-field--fullwidth' : 'form-field'}>
            <label className="form-label" style={{ opacity: isUsed ? 1 : 0.7 }}>
              {v.label || v.name}
            </label>

            {isTextarea ? (
              <textarea
                value={inputs[v.name] || ''}
                onChange={(e) => setInput(v.name, e.target.value)}
                disabled={!isUsed}
                placeholder={v.placeholder || ''}
                className={`form-textarea styled-scrollbar ${!isUsed ? 'form-textarea--disabled' : ''}`}
              />
            ) : (
              <input
                value={inputs[v.name] || ''}
                onChange={(e) => setInput(v.name, e.target.value)}
                disabled={!isUsed}
                className={`form-input ${!isUsed ? 'form-input--disabled' : ''}`}
                placeholder={v.placeholder || ''}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
