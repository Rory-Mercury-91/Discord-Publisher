import { useImageLoader } from '../hooks/useImageLoader';

interface ImageThumbnailProps {
  imagePath: string;
  isMain: boolean;
  onSetMain: () => void;
  onCopyName: () => void;
  onDelete: () => void;
  onChange?: () => void;
}

export default function ImageThumbnail({ imagePath, isMain, onSetMain, onCopyName, onDelete, onChange }: ImageThumbnailProps) {
  const { imageUrl, isLoading, error } = useImageLoader(imagePath);

  return (
    <div style={{ width: 120, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
      {isLoading ? (
        <div style={{ width: '100%', height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>⏳</div>
        </div>
      ) : error ? (
        <div style={{ width: '100%', height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,0,0,0.1)' }}>
          <div style={{ fontSize: 10, color: 'var(--error)' }}>❌</div>
        </div>
      ) : (
        <img src={imageUrl} style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block' }} alt="Thumbnail" />
      )}
      <div style={{ padding: 4, display: 'flex', justifyContent: 'space-between', gap: 4, fontSize: 11 }}>
        {onChange ? (
          <div style={{ display: 'flex', gap: 2, width: '100%', justifyContent: 'space-between' }}>
            <button onClick={onDelete} style={{ fontSize: 10, padding: '2px 4px', flex: 1 }}>🗑️</button>
          </div>
        ) : (
          <>
            <button onClick={onSetMain} style={{ fontSize: 10, padding: '2px 4px' }}>
              {isMain ? '⭐ Principale' : 'Définir'}
            </button>
            <div style={{ display: 'flex', gap: 2 }}>
              <button onClick={onCopyName} style={{ fontSize: 10, padding: '2px 4px' }}>📋</button>
              <button onClick={onDelete} style={{ fontSize: 10, padding: '2px 4px' }}>🗑️</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
