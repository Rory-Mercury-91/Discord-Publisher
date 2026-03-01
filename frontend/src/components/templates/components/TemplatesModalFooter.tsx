interface TemplatesModalFooterProps {
  onCancel: () => void;
  onSave: () => void;
}

export default function TemplatesModalFooter({ onCancel, onSave }: TemplatesModalFooterProps) {
  return (
    <div className="templates-footer">
      <button type="button" onClick={onCancel} className="form-btn form-btn--ghost">
        ❌ Annuler
      </button>
      <button type="button" onClick={onSave} className="form-btn form-btn--primary">
        ✅ Enregistrer
      </button>
    </div>
  );
}
