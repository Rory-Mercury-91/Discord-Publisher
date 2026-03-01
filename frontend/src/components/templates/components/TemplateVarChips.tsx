import type { VarConfig } from '../../../state/types';

interface TemplateVarChipsProps {
  vars: VarConfig[];
  copiedVar: string | null;
  onCopy: (varName: string) => void;
}

export default function TemplateVarChips({ vars, copiedVar, onCopy }: TemplateVarChipsProps) {
  if (vars.length === 0) return null;
  return (
    <div className="templates-vars-chips">
      <div className="templates-vars-chips__title">💡 Variables (cliquez pour copier)</div>
      <div className="templates-vars-chips__list styled-scrollbar">
        {vars.map((v, idx) => (
          <span
            key={idx}
            role="button"
            tabIndex={0}
            onClick={() => onCopy(v.name)}
            onKeyDown={e => e.key === 'Enter' && onCopy(v.name)}
            className={
              copiedVar === v.name ? 'template-var-chip template-var-chip--copied' : 'template-var-chip'
            }
            title={v.label}
          >
            {copiedVar === v.name && <span className="template-var-chip__check">✓</span>}
            [{v.name}]
          </span>
        ))}
      </div>
    </div>
  );
}
