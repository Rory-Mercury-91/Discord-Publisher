import { useCallback, useEffect, useState } from 'react';
import { cleanGameLinkUrl } from '../logic/links';
import type { AdditionalTranslationLink, LinkConfig } from '../types';

export type LinkConfigs = {
  Game_link: LinkConfig;
  Translate_link: LinkConfig;
  Mod_link: LinkConfig;
};

const DEFAULT_LINK_CONFIGS: LinkConfigs = {
  Game_link: { source: 'F95', value: '' },
  Translate_link: { source: 'Autre', value: '' },
  Mod_link: { source: 'Autre', value: '' }
};

export function useLinkConfigState() {
  const [linkConfigs, setLinkConfigs] = useState<LinkConfigs>(() => {
    try {
      const raw = localStorage.getItem('linkConfigs');
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return DEFAULT_LINK_CONFIGS;
  });

  const [additionalTranslationLinks, setAdditionalTranslationLinks] = useState<AdditionalTranslationLink[]>(() => {
    try {
      const raw = localStorage.getItem('additionalTranslationLinks');
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return [];
  });

  const [additionalModLinks, setAdditionalModLinks] = useState<AdditionalTranslationLink[]>(() => {
    try {
      const raw = localStorage.getItem('additionalModLinks');
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('linkConfigs', JSON.stringify(linkConfigs));
  }, [linkConfigs]);

  useEffect(() => {
    localStorage.setItem('additionalTranslationLinks', JSON.stringify(additionalTranslationLinks));
  }, [additionalTranslationLinks]);

  useEffect(() => {
    localStorage.setItem('additionalModLinks', JSON.stringify(additionalModLinks));
  }, [additionalModLinks]);

  const addAdditionalTranslationLink = useCallback(() => {
    setAdditionalTranslationLinks(prev => [...prev, { label: '', link: '' }]);
  }, []);

  const updateAdditionalTranslationLink = useCallback((index: number, link: AdditionalTranslationLink) => {
    setAdditionalTranslationLinks(prev => {
      const next = [...prev];
      next[index] = { ...link, link: cleanGameLinkUrl(link.link) };
      return next;
    });
  }, []);

  const deleteAdditionalTranslationLink = useCallback((index: number) => {
    setAdditionalTranslationLinks(prev => prev.filter((_, i) => i !== index));
  }, []);

  const addAdditionalModLink = useCallback(() => {
    setAdditionalModLinks(prev => [...prev, { label: '', link: '' }]);
  }, []);

  const updateAdditionalModLink = useCallback((index: number, link: AdditionalTranslationLink) => {
    setAdditionalModLinks(prev => {
      const next = [...prev];
      next[index] = { ...link, link: cleanGameLinkUrl(link.link) };
      return next;
    });
  }, []);

  const deleteAdditionalModLink = useCallback((index: number) => {
    setAdditionalModLinks(prev => prev.filter((_, i) => i !== index));
  }, []);

  const setLinkConfig = useCallback(
    (linkName: 'Game_link' | 'Translate_link' | 'Mod_link', source: 'F95' | 'Lewd' | 'Autre', value: string) => {
      setLinkConfigs(prev => {
        let processedValue = value;
        if ((source === 'F95' || source === 'Lewd') && value.trim().toLowerCase().includes('threads/')) {
          processedValue = cleanGameLinkUrl(value);
        }
        return { ...prev, [linkName]: { source, value: processedValue } };
      });
    },
    []
  );

  return {
    linkConfigs,
    setLinkConfigs,
    setLinkConfig,
    additionalTranslationLinks,
    setAdditionalTranslationLinks,
    addAdditionalTranslationLink,
    updateAdditionalTranslationLink,
    deleteAdditionalTranslationLink,
    additionalModLinks,
    setAdditionalModLinks,
    addAdditionalModLink,
    updateAdditionalModLink,
    deleteAdditionalModLink
  };
}
