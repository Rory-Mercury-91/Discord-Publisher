// Section 1 : titre, tags, œuvre, lien image, aperçu image
import TagsSection from '../ContentEditor/components/TagsSection';
import ImageSection from '../ContentEditor/components/ImageSection';

type WebtoonIdentitySectionProps = {
  postTitle: string;
  gameName: string;
  onGameNameChange: (value: string) => void;
  imageUrlInput: string;
  onImageUrlInputChange: (value: string) => void;
  onAddImage: () => void;
  selectedTagIds: string[];
  savedTags: any[];
  onOpenTagSelector: () => void;
  onRemoveTag: (tagId: string) => void;
  uploadedImages: Array<{ id: string; url?: string; name: string; isMain: boolean }>;
  removeImage: (idx: number) => void;
};

export default function WebtoonIdentitySection({
  postTitle,
  gameName,
  onGameNameChange,
  imageUrlInput,
  onImageUrlInputChange,
  onAddImage,
  selectedTagIds,
  savedTags,
  onOpenTagSelector,
  onRemoveTag,
  uploadedImages,
  removeImage,
}: WebtoonIdentitySectionProps) {
  return (
    <div className="form-grid form-grid--3col webtoon-editor__identity-grid">
      <div className="form-field">
        <label className="form-label">Titre du post</label>
        <input readOnly value={postTitle} className="form-input form-input--readonly" />
      </div>

      <TagsSection
        selectedTagIds={selectedTagIds}
        savedTags={savedTags}
        onOpenTagSelector={onOpenTagSelector}
        onRemoveTag={onRemoveTag}
        allowRemoveAll
        tagButtonClassName="webtoon-editor__tags-btn"
      />

      <div className="grid-cell--col3-row2 webtoon-editor__image-cell">
        <ImageSection uploadedImages={uploadedImages} removeImage={removeImage} />
      </div>

      <div className="form-field">
        <label className="form-label">Nom de l&apos;œuvre</label>
        <input
          value={gameName}
          onChange={e => onGameNameChange(e.target.value)}
          className="form-input"
          placeholder="Titre de la série"
        />
      </div>

      <div className="form-field">
        <label className="form-label">Lien de l&apos;image</label>
        <div className="form-field form-field--row form-field--row-h40">
          <input
            type="text"
            value={imageUrlInput}
            onChange={e => onImageUrlInputChange(e.target.value)}
            onKeyDown={e => {
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
