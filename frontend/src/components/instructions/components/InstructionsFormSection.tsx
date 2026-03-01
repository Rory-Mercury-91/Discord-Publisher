import type { OwnerOption } from '../constants';

interface InstructionsFormSectionProps {
  isEditing: boolean;
  form: { name: string; content: string; ownerId: string };
  ownerOptions: OwnerOption[];
  onFormChange: (form: { name: string; content: string; ownerId: string }) => void;
  onCancel: () => void;
  onSave: () => void;
}

export default function InstructionsFormSection({
  isEditing,
  form,
  ownerOptions,
  onFormChange,
  onCancel,
  onSave,
}: InstructionsFormSectionProps) {
  return (
    <div className="instructions-form-section">
      <h4 className="instructions-form-section__title">
        {isEditing ? "✏️ Modifier l'instruction" : "➕ Ajouter une instruction"}
      </h4>
      <div className="instructions-form-section__body">
        <div className="instructions-form__row">
          <div className="instructions-form">
            <label className="form-label">Nom de l'instruction</label>
            <input
              type="text"
              placeholder="Nom de l'instruction"
              value={form.name}
              onChange={e => onFormChange({ ...form, name: e.target.value })}
              disabled={isEditing}
            />
            {isEditing && (
              <div className="instructions-form__hint">
                💡 Pour renommer, supprimez et recréez l'instruction
              </div>
            )}
          </div>
          <div className="instructions-form">
            <label className="form-label">Appartient à</label>
            <select
              value={form.ownerId}
              onChange={e => onFormChange({ ...form, ownerId: e.target.value })}
              className="instructions-filter__select instructions-filter__select--wide"
            >
              {ownerOptions.map(o => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="instructions-form">
          <label className="form-label">Contenu de l'instruction</label>
          <textarea
            placeholder="Instructions d'installation détaillées..."
            value={form.content}
            onChange={e => onFormChange({ ...form, content: e.target.value })}
            rows={8}
            spellCheck
            lang="fr-FR"
          />
          <div className="instructions-form__hint">
            💡 Cette instruction sera disponible via la variable [instruction] dans tous les templates
          </div>
        </div>

        <div className="instructions-form__actions">
          {isEditing && (
            <button type="button" onClick={onCancel} className="form-btn form-btn--ghost">
              ❌ Annuler
            </button>
          )}
          <button type="button" onClick={onSave} className="form-btn form-btn--primary">
            {isEditing ? '✅ Enregistrer' : '➕ Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
}
