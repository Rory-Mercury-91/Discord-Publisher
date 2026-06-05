import { useCallback, useEffect, useState } from 'react';

export type ImageData = {
  id: string;
  /** URL de publication (http/https) — envoyée à Discord. */
  url?: string;
  /** URL d'aperçu local (blob/data) quand l'URL distante est anti-hotlink. */
  previewUrl?: string;
  name: string;
  isMain: boolean;
};

export type AddImageOptions = {
  previewUrl?: string;
};

export function useImagesState() {
  const [uploadedImages, setUploadedImages] = useState<ImageData[]>(() => {
    try {
      const raw = localStorage.getItem('uploadedImages');
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed
          .filter((img: ImageData) => img.url && (img.url.startsWith('http://') || img.url.startsWith('https://')))
          .map((img: ImageData) => ({
            id: img.id || Date.now().toString(),
            url: img.url,
            previewUrl: img.previewUrl,
            name: img.name || img.url?.split('/').pop() || 'image',
            isMain: img.isMain || false,
          }));
      }
    } catch { /* ignore */ }
    return [];
  });

  useEffect(() => {
    const toPersist = uploadedImages.filter(
      img => img.url && (img.url.startsWith('http://') || img.url.startsWith('https://')),
    );
    localStorage.setItem('uploadedImages', JSON.stringify(toPersist));
  }, [uploadedImages]);

  function addImageFromUrl(url: string, options?: AddImageOptions) {
    const trimmed = url.trim();
    if (!trimmed) return;

    const isHttp = trimmed.startsWith('http://') || trimmed.startsWith('https://');
    const isData = trimmed.startsWith('data:image/');
    if (!isHttp && !isData) return;

    if (isHttp) {
      try {
        const urlObj = new URL(trimmed);
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') return;
      } catch {
        return;
      }
    }

    setUploadedImages(() => {
      const fileName = isHttp
        ? (() => {
            try {
              return new URL(trimmed).pathname.split('/').pop() || 'image.jpg';
            } catch {
              return 'image.jpg';
            }
          })()
        : 'image-import.jpg';

      const preview = options?.previewUrl?.trim() || trimmed;

      return [{
        id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
        url: isHttp ? trimmed : undefined,
        previewUrl: preview,
        name: fileName,
        isMain: true,
      }];
    });
  }

  const removeImage = useCallback((idx: number) => {
    setUploadedImages(prev => {
      const copy = [...prev];
      const removed = copy[idx];
      if (removed?.previewUrl?.startsWith('blob:')) {
        try { URL.revokeObjectURL(removed.previewUrl); } catch { /* ignore */ }
      }
      copy.splice(idx, 1);
      if (copy.length && !copy.some(i => i.isMain)) copy[0].isMain = true;
      return copy;
    });
  }, []);

  function setMainImage(idx: number) {
    setUploadedImages(prev => prev.map((i, s) => ({ ...i, isMain: s === idx })));
  }

  function clearImages() {
    setUploadedImages(prev => {
      prev.forEach(img => {
        if (img.previewUrl?.startsWith('blob:')) {
          try { URL.revokeObjectURL(img.previewUrl); } catch { /* ignore */ }
        }
      });
      return [];
    });
  }

  return {
    uploadedImages,
    addImageFromUrl,
    removeImage,
    setMainImage,
    clearImages,
    setUploadedImages,
  };
}

/** URL affichée dans l'aperçu (blob si anti-hotlink, sinon URL distante). */
export function getImageDisplayUrl(img: ImageData | undefined): string {
  if (!img) return '';
  return img.previewUrl || img.url || '';
}

/** URL envoyée à Discord (toujours http/https si disponible). */
export function getImagePublishUrl(img: ImageData | undefined): string {
  if (!img?.url) return '';
  if (img.url.startsWith('http://') || img.url.startsWith('https://')) return img.url;
  return '';
}
