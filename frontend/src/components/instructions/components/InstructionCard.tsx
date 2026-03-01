interface InstructionCardProps {
  instructionKey: string;
  content: string;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export default function InstructionCard({
  instructionKey,
  content,
  isEditing,
  onEdit,
  onDelete,
}: InstructionCardProps) {
  return (
    <div
      className={isEditing ? 'instruction-card instruction-card--editing' : 'instruction-card'}
    >
      {isEditing ? (
        <div className="instruction-card__edit-label">✏️ Mode édition : {instructionKey}</div>
      ) : (
        <>
          <div className="instruction-card__label" title={content}>
            {instructionKey} :
          </div>
          <span className="instruction-card__sep">|</span>
          <button
            type="button"
            className="instruction-card__btn"
            onClick={onEdit}
            title="Éditer"
          >
            ✏️
          </button>
          <span className="instruction-card__sep">|</span>
          <button
            type="button"
            className="instruction-card__btn"
            onClick={onDelete}
            title="Supprimer"
          >
            🗑️
          </button>
        </>
      )}
    </div>
  );
}
