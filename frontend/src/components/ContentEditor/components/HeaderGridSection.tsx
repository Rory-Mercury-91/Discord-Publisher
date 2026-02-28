// Grille principale : Titre du post, Tags, Image, Nom du jeu, Lien de l'image.
import TagsSection from './TagsSection';
import ImageSection from './ImageSection';

interface HeaderGridSectionProps {
  postTitle: string;
  gameName: string;
  onGameNameChange: (value: string) => void;
  gameNameDisabled: boolean;
  imageUrlInput: string;
  onImageUrlInputChange: (value: string) => void;
  onAddImage: () => void;
  selectedTagIds: string[];
  savedTags: any[];
  onOpenTagSelector: () => void;
  onRemoveTag: (tagId: string) => void;
  uploadedImages: Array<{ id: string; url?: string; name: string; isMain: boolean }>;
  removeImage: (idx: number) => void;
}

export default function HeaderGridSection({
  postTitle,
  gameName,
  onGameNameChange,
  gameNameDisabled,
  imageUrlInput,
  onImageUrlInputChange,
  onAddImage,
  selectedTagIds,
  savedTags,
  onOpenTagSelector,
  onRemoveTag,
  uploadedImages,
  removeImage,
}: HeaderGridSectionProps) {
  return (
    <div className="form-grid form-grid--3col">
      <div className="form-field">
        <label className="form-label">Titre du post</label>
        <input
          readOnly
          value={postTitle}
          className="form-input form-input--readonly"
        />
      </div>

      <TagsSection
        selectedTagIds={selectedTagIds}
        savedTags={savedTags}
        onOpenTagSelector={onOpenTagSelector}
        onRemoveTag={onRemoveTag}
      />

      <div className="grid-cell--col3-row2">
        <ImageSection uploadedImages={uploadedImages} removeImage={removeImage} />
      </div>

      <div className="form-field">
        <label className="form-label">Nom du jeu</label>
        <input
          value={gameName}
          onChange={(e) => onGameNameChange(e.target.value)}
          disabled={gameNameDisabled}
          className={`form-input ${gameNameDisabled ? 'form-input--disabled' : ''}`}
          placeholder="Nom du jeu"
        />
      </div>

      <div className="form-field">
        <label className="form-label">Lien de l'image</label>
        <div className="form-field form-field--row form-field--row-h40">
          <input
            type="text"
            value={imageUrlInput}
            onChange={(e) => onImageUrlInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onAddImage();
            }}
            placeholder="https://..."
            className="form-input form-input--flex"
          />
          <button
            type="button"
            onClick={onAddImage}
            disabled={!imageUrlInput.trim()}
            className="form-btn form-btn--primary"
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
