import { useEffect, useState } from 'react';

export function useImageLoader(imagePath: string) {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!imagePath) {
      setImageUrl('');
      setIsLoading(false);
      setError('No image path provided');
      return;
    }

    // Vérifier si c'est une URL HTTP(S)
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      setImageUrl(imagePath);
      setIsLoading(false);
      setError(null);
    } else {
      // Ce n'est pas une URL valide
      setImageUrl('');
      setIsLoading(false);
      setError('Invalid image URL');
    }
  }, [imagePath]);

  return { imageUrl, isLoading, error };
}
