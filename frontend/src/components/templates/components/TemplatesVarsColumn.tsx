import type { VarConfig } from '../../../state/types';

interface TemplatesVarsColumnProps {
  customVars: { v: VarConfig; idx: number }[];
  editingVarIdx: number | null;
  varForm: { name: string; label: string; type: 'text' | 'textarea' };
  setVarForm: (f: { name: string; label: string; type: 'text' | 'textarea' }) => void;
  onStartEdit: (idx: number) => void;
  onCancelEdit: () => void;
  onSaveVar: () => void;
  onDeleteVar: (idx: number) => void;
}

export default function TemplatesVarsColumn({
  customVars,
  editingVarIdx,
  varForm,
  setVarForm,
  onStartEdit,
  onCancelEdit,
  onSaveVar,
  onDeleteVar,
}: TemplatesVarsColumnProps) {
  return (
    <div className="templates-vars-column">
      <h4 className="templates-vars-column__title">🔧 Variables personnalisées</h4>
      <div className="templates-vars-list styled-scrollbar">
        <div className="templates-vars-form">
          <h5 className="templates-vars-form__title">
            {editingVarIdx !== null ? '✏️ Modifier la variable' : '➕ Ajouter une variable'}
          </h5>
          <div className="templates-vars-form__grid">
            <div>
              <label className="form-label">Nom *</label>
              <input
                placeholder="ex: ma_var"
                value={varForm.name}
                onChange={e => setVarForm({ ...varForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Label *</label>
              <input
                placeholder="ex: Ma variable"
                value={varForm.label}
                onChange={e => setVarForm({ ...varForm, label: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Type</label>
              <select
                value={varForm.type}
                onChange={e => setVarForm({ ...varForm, type: e.target.value as 'text' | 'textarea' })}
              >
                <option value="text">Texte</option>
                <option value="textarea">Textarea</option>
              </select>
            </div>
            <div className="templates-vars-form__actions">
              {editingVarIdx !== null && (
                <button type="button" onClick={onCancelEdit} className="form-btn form-btn--ghost">
                  ❌ Annuler
                </button>
              )}
              <button type="button" onClick={onSaveVar} className="form-btn form-btn--primary">
                {editingVarIdx !== null ? '✅ Enregistrer' : '➕ Ajouter'}
              </button>
            </div>
          </div>
        </div>
        {customVars.length > 0 && (
          <div className="templates-vars-existing">
            <div className="templates-vars-existing__title">Variables existantes</div>
            <div className="templates-vars-existing__list">
              {customVars.map(({ v, idx }) => (
                <div
                  key={idx}
                  className={
                    editingVarIdx === idx
                      ? 'template-var-row template-var-row--editing'
                      : 'template-var-row'
                  }
                >
                  {editingVarIdx === idx ? (
                    <div className="template-var-row__edit-label">✏️ En édition</div>
                  ) : (
                    <>
                      <div className="template-var-row__cell">
                        <strong className="template-var-row__name">[{v.name}]</strong>
                        <div className="template-var-row__label">{v.label}</div>
                      </div>
                      <button type="button" className="template-var-row__btn" onClick={() => onStartEdit(idx)} title="Éditer">
                        ✏️
                      </button>
                      <button type="button" className="template-var-row__btn" onClick={() => onDeleteVar(idx)} title="Supprimer">
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
