import React from 'react';
import { useImageLoader } from '../hooks/useImageLoader';
import { tauriAPI } from '../lib/tauri-api';

interface ImageThumbnailProps {
  imagePath: string;
  isMain: boolean;
  onSetMain: () => void;
  onCopyName: () => void;
  onDelete: () => void;
  onChange?: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export default function ImageThumbnail({ imagePath, isMain, onSetMain, onCopyName, onDelete, onChange }: ImageThumbnailProps) {
  const { imageUrl, isLoading, error } = useImageLoader(imagePath);
  const [fileSize, setFileSize] = React.useState<number | null>(null);

  // Récupérer la taille du fichier
  React.useEffect(() => {
    if (!imagePath) return;

    (async () => {
      try {
        const result = await tauriAPI.getImageSize(imagePath);
        if (result.ok && result.size) {
          setFileSize(result.size);
        }
      } catch (e) {
        console.error('Erreur lors de la récupération de la taille:', e);
      }
    })();
  }, [imagePath]);

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
      {fileSize !== null && (
        <div style={{
          padding: '2px 4px',
          fontSize: 10,
          textAlign: 'center',
          background: fileSize > 8 * 1024 * 1024 ? 'rgba(255, 0, 0, 0.1)' : 'rgba(0, 255, 0, 0.05)',
          color: fileSize > 8 * 1024 * 1024 ? 'var(--error)' : 'var(--muted)',
          borderTop: '1px solid var(--border)'
        }}>
          {formatFileSize(fileSize)} {fileSize > 8 * 1024 * 1024 ? '⚠️ >8MB' : ''}
        </div>
      )}
      <div style={{ padding: 4, display: 'flex', justifyContent: 'space-between', gap: 4, fontSize: 11 }}>
        {onChange ? (
          <div style={{ display: 'flex', gap: 2, width: '100%', justifyContent: 'space-between' }}>
            <button onClick={onChange} style={{ fontSize: 10, padding: '2px 4px', flex: 1 }}>🔄 Changer</button>
            <button onClick={onDelete} style={{ fontSize: 10, padding: '2px 4px', flex: 1 }}>🗑️ Poubelle</button>
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
