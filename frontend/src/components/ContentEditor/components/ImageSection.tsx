// frontend/src/components/ContentEditorComponents/ImageSection.tsx
import { useConfirm } from '../../../hooks/useConfirm';
import { useImageLoader } from '../../../hooks/useImageLoader';
import ConfirmModal from '../../Modals/ConfirmModal';

interface ImageSectionProps {
  uploadedImages: Array<{ id: string; url?: string; name: string; isMain: boolean }>;
  removeImage: (idx: number) => void;
}

function FormImageDisplay({ imagePath, onDelete }: { imagePath: string; onDelete: () => void }) {
  const { imageUrl, isLoading, error } = useImageLoader(imagePath);

  return (
    <>
      {isLoading ? (
        <div className="image-overlay image-overlay--loading">
          <span className="image-overlay__muted">⏳</span>
        </div>
      ) : error ? (
        <div className="image-overlay image-overlay--error">
          <span className="image-overlay__error">❌ Erreur</span>
        </div>
      ) : (
        <img src={imageUrl} alt="" className="image-img" />
      )}

      <button
        type="button"
        onClick={onDelete}
        title="Supprimer"
        className="form-btn form-btn--danger image-delete-btn"
      >
        🗑️
      </button>
    </>
  );
}

export default function ImageSection({
  uploadedImages,
  removeImage,
}: ImageSectionProps) {
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  const handleDeleteImage = async (idx: number) => {
    const ok = await confirm({
      title: "Supprimer l'image",
      message: "Voulez-vous vraiment supprimer cette image ?",
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      type: 'danger'
    });
    if (ok) removeImage(idx);
  };

  const currentImage = uploadedImages[0];

  return (
    <>
      <div className={`image-preview-box ${currentImage ? 'image-preview-box--filled' : ''}`}>
        {currentImage ? (
          <FormImageDisplay
            imagePath={currentImage.url || ''}
            onDelete={() => handleDeleteImage(0)}
          />
        ) : (
          <>
            <div className="image-empty-icon">🖼️</div>
            <div className="image-empty-text">Aucune image</div>
          </>
        )}
      </div>
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        type={confirmState.type}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
}
