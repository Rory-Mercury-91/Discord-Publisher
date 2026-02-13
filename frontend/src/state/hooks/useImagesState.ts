import { useEffect, useState } from 'react';

type ImageData = {
  id: string;
  url?: string;
  name: string;
  isMain: boolean;
};

export function useImagesState() {
  const [uploadedImages, setUploadedImages] = useState<ImageData[]>(() => {
    try {
      const raw = localStorage.getItem('uploadedImages');
      if (raw) {
        const parsed = JSON.parse(raw);
        // Filtrer uniquement les images avec URLs (ignorer les anciennes avec path)
        return parsed
          .filter((img: any) => img.url && (img.url.startsWith('http://') || img.url.startsWith('https://')))
          .map((img: any) => ({
            id: img.id || Date.now().toString(),
            url: img.url,
            name: img.name || img.url?.split('/').pop() || 'image',
            isMain: img.isMain || false
          }));
      }
    } catch { }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('uploadedImages', JSON.stringify(uploadedImages));
  }, [uploadedImages]);

  function addImageFromUrl(url: string) {
    if (!url.trim()) return;

    // Valider que c'est une URL HTTP(S)
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        return;
      }
    } catch {
      return;
    }

    setUploadedImages(() => {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const fileName = pathname.split('/').pop() || 'image.jpg';

      return [{
        id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
        url: url.trim(),
        name: fileName,
        isMain: true
      }];
    });
  }

  function removeImage(idx: number) {
    setUploadedImages(prev => {
      const copy = [...prev];
      copy.splice(idx, 1);
      if (copy.length && !copy.some(i => i.isMain)) copy[0].isMain = true;
      return copy;
    });
  }

  function setMainImage(idx: number) {
    setUploadedImages(prev => prev.map((i, s) => ({ ...i, isMain: s === idx })));
  }

  function clearImages() {
    setUploadedImages([]);
  }

  return {
    uploadedImages,
    addImageFromUrl,
    removeImage,
    setMainImage,
    clearImages,
    setUploadedImages
  };
}
