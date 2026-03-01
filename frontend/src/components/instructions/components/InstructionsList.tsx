import InstructionCard from './InstructionCard';

interface InstructionsListProps {
  entries: [string, string][];
  editingKey: string | null;
  onEdit: (key: string) => void;
  onDelete: (key: string) => void;
}

export default function InstructionsList({
  entries,
  editingKey,
  onEdit,
  onDelete,
}: InstructionsListProps) {
  return (
    <div className="instructions-list">
      <h4 className="instructions-list__title">
        Instructions enregistrées ({entries.length})
      </h4>
      {entries.length === 0 ? (
        <div className="instructions-list__empty">
          Aucune instruction enregistrée. Cliquez sur « Ajouter une instruction » pour en créer.
        </div>
      ) : (
        <div className="instructions-list__grid">
          {entries.map(([key, content]) => (
            <InstructionCard
              key={key}
              instructionKey={key}
              content={content}
              isEditing={editingKey === key}
              onEdit={() => onEdit(key)}
              onDelete={() => onDelete(key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
