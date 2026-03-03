interface TemplatesModalFooterProps {
  hasChanges: boolean;
  onPrimaryAction: () => void;
}

export default function TemplatesModalFooter({ hasChanges, onPrimaryAction }: TemplatesModalFooterProps) {
  return (
    <div className="templates-footer templates-footer--single">
      <button type="button" onClick={onPrimaryAction} className="form-btn form-btn--primary">
        {hasChanges ? '↩✅ Enregistrer et Fermer' : '↩️ Fermer'}
      </button>
    </div>
  );
}
