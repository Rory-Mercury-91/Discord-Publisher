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

    const isValid =
      imagePath.startsWith('http://')
      || imagePath.startsWith('https://')
      || imagePath.startsWith('data:image/')
      || imagePath.startsWith('blob:');

    if (isValid) {
      setImageUrl(imagePath);
      setIsLoading(false);
      setError(null);
    } else {
      setImageUrl('');
      setIsLoading(false);
      setError('Invalid image URL');
    }
  }, [imagePath]);

  return { imageUrl, isLoading, error };
}
