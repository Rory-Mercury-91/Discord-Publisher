interface TagsModalFooterProps {
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}

export default function TagsModalFooter({ onClose, onSave, saving }: TagsModalFooterProps) {
  return (
    <div className="tags-modal__footer">
      <button type="button" onClick={onClose} className="form-btn form-btn--ghost">
        ↩️ Fermer
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="tags-modal__footer-save"
      >
        {saving ? '⏳ Sauvegarde…' : '💾 Sauvegarder'}
      </button>
    </div>
  );
}
