import type { Template } from '../../../state/types';

interface TemplatesListSectionProps {
  templates: Template[];
  selectedTemplateIdx: number;
  onSelect: (idx: number) => void;
  newTemplateName: string;
  setNewTemplateName: (v: string) => void;
  onCreate: () => void;
  onDelete: (idx: number) => void;
}

export default function TemplatesListSection({
  templates,
  selectedTemplateIdx,
  onSelect,
  newTemplateName,
  setNewTemplateName,
  onCreate,
  onDelete,
}: TemplatesListSectionProps) {
  return (
    <div className="templates-section">
      <div className="templates-section__header">
        <h4 className="templates-section__title">📚 Mes templates ({templates.length})</h4>
      </div>
      <div className="templates-list">
        {templates.map((template, idx) => (
          <button
            key={template.id ?? idx}
            type="button"
            onClick={() => onSelect(idx)}
            className={
              selectedTemplateIdx === idx ? 'template-card template-card--selected' : 'template-card'
            }
          >
            <span className="template-card__label">
              {template.isDefault ? '⭐ ' : ''}
              {template.name || `Template ${idx + 1}`}
            </span>
            {!template.isDefault && selectedTemplateIdx === idx && (
              <button
                type="button"
                className="template-card__delete"
                onClick={e => {
                  e.stopPropagation();
                  onDelete(idx);
                }}
                title="Supprimer ce template"
              >
                🗑️
              </button>
            )}
          </button>
        ))}
      </div>
      <div className="templates-create-row">
        <input
          type="text"
          value={newTemplateName}
          onChange={e => setNewTemplateName(e.target.value)}
          placeholder="Nom du nouveau template..."
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onCreate();
            }
          }}
        />
        <button type="button" onClick={onCreate} className="form-btn form-btn--primary">
          ➕ Créer
        </button>
      </div>
    </div>
  );
}
