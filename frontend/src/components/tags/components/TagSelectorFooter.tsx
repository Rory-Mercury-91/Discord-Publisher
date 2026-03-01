interface TagSelectorFooterProps {
  onClose: () => void;
}

export default function TagSelectorFooter({ onClose }: TagSelectorFooterProps) {
  return (
    <div className="tag-selector__footer">
      <button type="button" onClick={onClose} className="form-btn form-btn--ghost">
        ↩️ Fermer
      </button>
    </div>
  );
}
