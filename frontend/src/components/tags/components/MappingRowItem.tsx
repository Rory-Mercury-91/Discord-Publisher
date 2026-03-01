import type { EditRow } from '../tags-modal-constants';

interface MappingRowItemProps {
  label: string;
  hasMapping: boolean;
  edit: EditRow;
  tags: { id?: string; name: string }[];
  traducteurOptions: string[];
  onEditChange: (field: 'tag_id' | 'forum_channel_id' | 'list_form_traducteur', val: string) => void;
  onSave: () => void;
  onDelete: () => void;
  isExternal?: boolean;
}

export default function MappingRowItem({
  label,
  hasMapping,
  edit,
  tags,
  traducteurOptions,
  onEditChange,
  onSave,
  onDelete,
  isExternal,
}: MappingRowItemProps) {
  return (
    <div
      className={`tags-modal-mapping-row ${hasMapping ? 'tags-modal-mapping-row--has-mapping' : ''} ${isExternal ? 'tags-modal-mapping-row--external' : ''}`}
    >
      <div className="tags-modal-mapping-row__label">
        <span className="tags-modal-mapping-row__icon">
          {isExternal ? '🔧' : hasMapping ? '🔗' : '⬜'}
        </span>
        {label}
      </div>
      <select
        className="tags-modal-mapping-input"
        value={edit.tag_id}
        onChange={(e) => onEditChange('tag_id', e.target.value)}
      >
        <option value="">— Tag —</option>
        {tags.map((t) => (
          <option key={t.id ?? t.name} value={t.id ?? ''}>
            {t.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        className="tags-modal-mapping-input"
        value={edit.forum_channel_id}
        onChange={(e) => onEditChange('forum_channel_id', e.target.value)}
        placeholder="ID salon forum"
      />
      <select
        className="tags-modal-mapping-input"
        value={edit.list_form_traducteur ?? ''}
        onChange={(e) => onEditChange('list_form_traducteur', e.target.value)}
        title="Valeur du champ traducteur à l'export (liste issue de f95_jeux.traducteur)"
      >
        <option value="">— Aucune concordance —</option>
        {traducteurOptions.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <button type="button" className="tags-modal-mapping-btn tags-modal-mapping-btn--save" onClick={onSave}>
        💾 Sauver
      </button>
      <button
        type="button"
        className="tags-modal-mapping-btn tags-modal-mapping-btn--delete"
        onClick={onDelete}
        title="Supprimer"
      >
        🗑️
      </button>
    </div>
  );
}
