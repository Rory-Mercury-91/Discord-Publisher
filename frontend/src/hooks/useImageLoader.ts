import { useState, useEffect } from 'react';
import { tauriAPI } from '../lib/tauri-api';

/**
 * Hook pour charger une image depuis le filesystem via IPC
 * Convertit le buffer en ObjectURL pour l'affichage
 */
export function useImageLoader(imagePath: string | undefined) {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!imagePath) {
      setImageUrl('');
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    let objectUrl: string | null = null;

    async function loadImage() {
      if (!imagePath) return; // Guard supplémentaire pour TypeScript
      
      try {
        setIsLoading(true);
        setError(null);

        const result = await tauriAPI.readImage(imagePath);
        
        if (!result.ok || !result.buffer) {
          throw new Error(result.error || 'Failed to load image');
        }

        if (!isMounted) return;

        // Convert array back to Uint8Array
        const buffer = new Uint8Array(result.buffer);
        
        // Detect MIME type from file extension
        const ext = (imagePath || '').split('.').pop()?.toLowerCase() || 'png';
        const mimeType = 
          ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
          ext === 'png' ? 'image/png' :
          ext === 'gif' ? 'image/gif' :
          ext === 'webp' ? 'image/webp' :
          'image/' + ext;

        // Create Blob and ObjectURL
        const blob = new Blob([buffer], { type: mimeType });
        objectUrl = URL.createObjectURL(blob);
        
        setImageUrl(objectUrl);
        setIsLoading(false);
      } catch (e: any) {
        if (!isMounted) return;
        setError(String(e?.message || e));
        setIsLoading(false);
      }
    }

    loadImage();

    // Cleanup: revoke ObjectURL to free memory
    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [imagePath]);

  return { imageUrl, isLoading, error };
}
