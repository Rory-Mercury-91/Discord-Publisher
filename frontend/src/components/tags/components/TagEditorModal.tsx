import { useEffect, useState } from 'react';
import { useToast } from '../../shared/ToastProvider';

interface TagEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialName?: string;
  onSave: (name: string) => void;
  title: string;
}

export default function TagEditorModal({
  isOpen,
  onClose,
  initialName = '',
  onSave,
  title,
}: TagEditorModalProps) {
  const [name, setName] = useState(initialName);
  const { showToast } = useToast();

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  const handleSave = () => {
    if (!name.trim()) {
      showToast('Le nom est requis', 'error');
      return;
    }
    onSave(name.trim());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="tags-modal-editor-backdrop">
      <div className="tags-modal-editor-panel">
        <h3 className="tags-modal-editor-title">{title}</h3>
        <input
          type="text"
          className="tags-modal-editor-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="Nom du tag"
          autoFocus
        />
        <div className="tags-modal-editor-actions">
          <button type="button" onClick={onClose} className="tags-modal-editor-btn tags-modal-editor-btn--cancel">
            Annuler
          </button>
          <button type="button" onClick={handleSave} className="tags-modal-editor-btn tags-modal-editor-btn--save">
            Sauvegarder
          </button>
        </div>
      </div>
    </div>
  );
}
