interface TagsSectionTranslatorsProps {
  loading: boolean;
  translatorTags: { id: string; name: string }[];
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function TagsSectionTranslators({
  loading,
  translatorTags,
  onAdd,
  onEdit,
  onDelete,
}: TagsSectionTranslatorsProps) {
  return (
    <div className="tags-modal-section__content">
      <button type="button" onClick={onAdd} className="tags-modal-translators-add">
        ➕ Ajouter Tag Traducteur
      </button>
      {loading ? (
        <p className="tags-modal-muted">Chargement…</p>
      ) : translatorTags.length === 0 ? (
        <p className="tags-modal-muted tags-modal-muted--italic">Aucun tag translator.</p>
      ) : (
        <div className="tags-modal-translators-list">
          {translatorTags.map((tag) => (
            <div key={tag.id} className="tags-modal-translators-item">
              <span className="tags-modal-translators-item-name">{tag.name}</span>
              <button
                type="button"
                onClick={() => onEdit(tag.id)}
                className="tags-modal-translators-item-btn tags-modal-translators-item-btn--edit"
                title="Modifier le nom"
              >
                ✏️
              </button>
              <button
                type="button"
                onClick={() => onDelete(tag.id)}
                className="tags-modal-translators-item-btn tags-modal-translators-item-btn--delete"
                title="Supprimer"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
