import { useEffect, useState } from 'react';

/** État des champs du post (titre, tags sélectionnés) et options de traduction (type, intégré). */
export function usePostFormState() {
  const [postTitle, setPostTitle] = useState<string>(() => {
    try {
      const raw = localStorage.getItem('postTitle');
      return raw || '';
    } catch {
      return '';
    }
  });

  const [postTags, setPostTags] = useState<string>(() => {
    try {
      const raw = localStorage.getItem('postTags');
      return raw || '';
    } catch {
      return '';
    }
  });

  const [translationType, setTranslationType] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('translationType');
      return saved || 'Automatique';
    } catch {
      return 'Automatique';
    }
  });

  const [isIntegrated, setIsIntegrated] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('isIntegrated');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem('postTitle', postTitle);
  }, [postTitle]);

  useEffect(() => {
    localStorage.setItem('postTags', postTags);
  }, [postTags]);

  useEffect(() => {
    localStorage.setItem('translationType', translationType);
  }, [translationType]);

  useEffect(() => {
    localStorage.setItem('isIntegrated', String(isIntegrated));
  }, [isIntegrated]);

  return {
    postTitle,
    setPostTitle,
    postTags,
    setPostTags,
    translationType,
    setTranslationType,
    isIntegrated,
    setIsIntegrated,
  };
}
