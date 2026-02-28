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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {visibleVars.map((v) => {
        const isUsed = varsUsedInTemplate.has(v.name);
        const isTextarea = v.type === 'textarea';

        return (
          <div key={v.name} style={isTextarea ? { gridColumn: '1 / -1' } : undefined}>
            <label style={{
              display: 'block',
              fontSize: 13,
              color: isUsed ? 'var(--muted)' : 'var(--muted)',
              marginBottom: 6,
              fontWeight: 600,
              opacity: isUsed ? 1 : 0.7
            }}>
              {v.label || v.name}
            </label>

            {isTextarea ? (
              <textarea
                value={inputs[v.name] || ''}
                onChange={(e) => setInput(v.name, e.target.value)}
                disabled={!isUsed}
                placeholder={v.placeholder || ''}
                style={{
                  width: '100%',
                  minHeight: 100,
                  borderRadius: 6,
                  padding: 12,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  lineHeight: 1.5,
                  resize: 'vertical',
                  opacity: isUsed ? 1 : 0.6,
                  cursor: isUsed ? 'text' : 'not-allowed'
                }}
                className="styled-scrollbar"
              />
            ) : (
              <input
                value={inputs[v.name] || ''}
                onChange={(e) => setInput(v.name, e.target.value)}
                disabled={!isUsed}
                style={{
                  width: '100%',
                  height: '40px',
                  borderRadius: 6,
                  padding: '0 12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  opacity: isUsed ? 1 : 0.6,
                  cursor: isUsed ? 'text' : 'not-allowed'
                }}
                placeholder={v.placeholder || ''}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
