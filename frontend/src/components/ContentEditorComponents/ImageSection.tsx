// frontend/src/components/ContentEditorComponents/ImageSection.tsx
import { useConfirm } from '../../hooks/useConfirm';
import { useImageLoader } from '../../hooks/useImageLoader';

interface ImageSectionProps {
  uploadedImages: Array<{ id: string; url?: string; name: string; isMain: boolean }>;
  removeImage: (idx: number) => void;
}

function FormImageDisplay({ imagePath, onDelete }: { imagePath: string; onDelete: () => void }) {
  const { imageUrl, isLoading, error } = useImageLoader(imagePath);

  return (
    <>
      {isLoading ? (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.05)'
        }}>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>⏳</span>
        </div>
      ) : error ? (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,0,0,0.1)'
        }}>
          <span style={{ fontSize: 12, color: 'var(--error)' }}>❌ Erreur</span>
        </div>
      ) : (
        <img
          src={imageUrl}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block'
          }}
        />
      )}

      <button
        type="button"
        onClick={onDelete}
        title="Supprimer"
        style={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          padding: '6px 14px',
          borderRadius: 6,
          border: 'none',
          background: 'rgba(239, 68, 68, 0.65)',
          color: '#fff',
          fontSize: 12,
          cursor: 'pointer'
        }}
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
  const { confirm } = useConfirm();

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
    <div style={{
      width: '100%',
      minHeight: '160px',
      border: `2px ${currentImage ? 'solid' : 'dashed'} var(--border)`,
      borderRadius: 6,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(255,255,255,0.02)',
      color: 'var(--muted)',
      padding: '12px',
      gap: '8px',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {currentImage ? (
        <FormImageDisplay
          imagePath={currentImage.url || ''}
          onDelete={() => handleDeleteImage(0)}
        />
      ) : (
        <>
          <div style={{ fontSize: 32 }}>🖼️</div>
          <div style={{ fontSize: 11, textAlign: 'center' }}>Aucune image</div>
        </>
      )}
    </div>
  );
}
