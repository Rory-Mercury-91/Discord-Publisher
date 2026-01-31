import { useEffect, useState } from 'react';
import { tauriAPI } from '../../lib/tauri-api';

type ImageData = {
  id: string;
  path?: string;
  url?: string;
  name: string;
  isMain: boolean;
};

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
const JPEG_QUALITY = 0.85;

async function compressImage(file: File): Promise<File> {
  if (file.size <= MAX_SIZE_BYTES) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      // Calculer les nouvelles dimensions en gardant le ratio
      const ratio = Math.sqrt(MAX_SIZE_BYTES / file.size);
      width = Math.floor(width * ratio);
      height = Math.floor(height * ratio);

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convertir en JPEG si c'est un PNG (plus petite taille)
      const outputFormat = file.type === 'image/png' ? 'image/jpeg' : file.type;

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to compress image'));
            return;
          }

          const compressedFile = new File(
            [blob],
            file.name.replace(/\.png$/i, '.jpg'),
            { type: outputFormat, lastModified: Date.now() }
          );

          resolve(compressedFile);
        },
        outputFormat,
        JPEG_QUALITY
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function useImagesState() {
  const [uploadedImages, setUploadedImages] = useState<ImageData[]>(() => {
    try {
      const raw = localStorage.getItem('uploadedImages');
      if (raw) {
        const parsed = JSON.parse(raw);
        // Assurer que name existe pour chaque image
        return parsed.map((img: any) => ({
          ...img,
          name: img.name || img.path?.split(/[/\\]/).pop() || img.url?.split('/').pop() || 'image'
        }));
      }
    } catch { }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('uploadedImages', JSON.stringify(uploadedImages));
  }, [uploadedImages]);

  async function addImageFromPath(filePath: string) {
    try {
      const result = await tauriAPI.saveImage(filePath);
      if (result.ok && result.fileName) {
        const fileName = result.fileName.split(/[/\\]/).pop() || filePath.split(/[/\\]/).pop() || 'image';

        setUploadedImages(prev => {
          if (prev.length > 0 && prev[0].path) {
            tauriAPI.deleteImage(prev[0].path).catch(() => {});
          }

          return [{
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
            path: result.fileName,
            name: fileName,
            isMain: true
          }];
        });
      }
    } catch {
      // Erreur silencieuse
    }
  }

  async function addImages(files: FileList | File[]) {
    const fileArray = Array.from(files as any) as File[];
    const file = fileArray[0];

    if (!file || !file.type.startsWith('image/')) return;

    try {
      const processedFile = await compressImage(file);

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64Data = dataUrl.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(processedFile);
      });

      const result = await tauriAPI.saveImageFromBase64(
        base64,
        processedFile.name,
        processedFile.type
      );

      if (!result.ok) {
        throw new Error(result.error || 'Failed to save image from base64');
      }

      if (result.ok && result.fileName) {
        const fileName = result.fileName.split(/[/\\]/).pop() || file.name;

        setUploadedImages(prev => {
          if (prev.length > 0 && prev[0].path) {
            tauriAPI.deleteImage(prev[0].path).catch(() => {});
          }

          return [{
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
            path: result.fileName,
            name: fileName,
            isMain: true
          }];
        });
      }
    } catch {
      // Erreur silencieuse
    }
  }

  async function removeImage(idx: number) {
    const img = uploadedImages[idx];
    if (img?.path && !img.url) {
      try {
        await tauriAPI.deleteImage(img.path);
      } catch {
        // Erreur silencieuse
      }
    }
    setUploadedImages(prev => {
      const copy = [...prev];
      copy.splice(idx, 1);
      if (copy.length && !copy.some(i => i.isMain)) copy[0].isMain = true;
      return copy;
    });
  }

  function addImageFromUrl(url: string) {
    if (!url.trim()) return;

    try {
      new URL(url);
    } catch {
      return;
    }

    setUploadedImages(prev => {
      if (prev.length > 0) {
        const oldImg = prev[0];
        if (oldImg.path && !oldImg.url) {
          tauriAPI.deleteImage(oldImg.path).catch(() => {});
        }
      }

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

  function setMainImage(idx: number) {
    setUploadedImages(prev => prev.map((i, s) => ({ ...i, isMain: s === idx })));
  }

  function clearImages() {
    setUploadedImages([]);
  }

  return {
    uploadedImages,
    addImages,
    addImageFromPath,
    addImageFromUrl,
    removeImage,
    setMainImage,
    clearImages,
    setUploadedImages
  };
}
