import type { Template } from '../../../state/types';

export type TemplateOwnerFilter = {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
};

interface TemplatesListSectionProps {
  templates: Template[];
  selectedTemplateIdx: number;
  onSelect: (idx: number) => void;
  onOpenCreateModal: () => void;
  onDelete: (idx: number) => void;
  ownerFilter?: TemplateOwnerFilter | null;
}

export default function TemplatesListSection({
  templates,
  selectedTemplateIdx,
  onSelect,
  onOpenCreateModal,
  onDelete,
  ownerFilter,
}: TemplatesListSectionProps) {
  return (
    <div className="templates-section">
      <div className="templates-section__header">
        <h4 className="templates-section__title">📚 Templates ({templates.length})</h4>
        <button
          type="button"
          className="form-btn form-btn--primary templates-section__btn-add"
          onClick={onOpenCreateModal}
        >
          ➕ Ajouter
        </button>
      </div>
      {ownerFilter && (
        <div className="templates-section__owner-row">
          <label className="templates-section__owner-label">{ownerFilter.label}</label>
          <select
            className="templates-section__owner-select"
            value={ownerFilter.value}
            onChange={e => ownerFilter.onChange(e.target.value)}
          >
            {ownerFilter.options.map(o => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
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
    </div>
  );
}
