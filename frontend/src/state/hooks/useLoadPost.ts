import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AdditionalTranslationLink, PublishedPost } from '../types';
import type { LinkConfigs } from './useLinkConfigState';

type LoadPostDeps = {
  setEditingPostId: (id: string | null) => void;
  setEditingPostData: (post: PublishedPost | null) => void;
  setPostTitle: (s: string) => void;
  setPostTags: (s: string) => void;
  setTranslationType: (s: string) => void;
  setIsIntegrated: (v: boolean) => void;
  templates: { id?: string; name: string }[];
  allVarsConfig: { name: string }[];
  setInput: (name: string, value: string) => void;
  setLinkConfigs: Dispatch<SetStateAction<LinkConfigs>>;
  setAdditionalTranslationLinks: Dispatch<SetStateAction<AdditionalTranslationLink[]>>;
  setAdditionalModLinks: Dispatch<SetStateAction<AdditionalTranslationLink[]>>;
  setUploadedImages: (images: Array<{ id: string; url?: string; name: string; isMain: boolean }>) => void;
  setPreviewOverride: (value: string | null) => void;
};

/** Retourne loadPostForEditing et loadPostForDuplication pour restaurer un post dans le formulaire. */
export function useLoadPost(deps: LoadPostDeps) {
  const {
    setEditingPostId,
    setEditingPostData,
    setPostTitle,
    setPostTags,
    setTranslationType,
    setIsIntegrated,
    templates,
    allVarsConfig,
    setInput,
    setLinkConfigs,
    setAdditionalTranslationLinks,
    setAdditionalModLinks,
    setUploadedImages,
    setPreviewOverride,
  } = deps;

  const loadPostForEditing = useCallback(
    (post: PublishedPost) => {
      setEditingPostId(post.id);
      setEditingPostData(post);
      setPostTitle(post.title);
      setPostTags(post.tags);

      if (post.translationType) setTranslationType(post.translationType);
      if (post.isIntegrated !== undefined) setIsIntegrated(post.isIntegrated);

      if (post.templateId) {
        const templateIdx = templates.findIndex(t => t.id === post.templateId);
        if (templateIdx !== -1) {
          console.log(`[Edit] Post créé avec le template: ${templates[templateIdx].name}`);
        } else {
          console.log(`[Edit] Template original (${post.templateId}) introuvable, utilisation du template actuel`);
        }
      }

      if (post.savedInputs) {
        const cleanInputs: Record<string, string> = {};
        allVarsConfig.forEach(v => (cleanInputs[v.name] = ''));
        cleanInputs['instruction'] = '';
        cleanInputs['selected_instruction_key'] = '';
        cleanInputs['is_modded_game'] = 'false';
        cleanInputs['Mod_link'] = '';
        cleanInputs['use_additional_links'] = 'false';
        cleanInputs['main_translation_label'] = 'Traduction';
        cleanInputs['main_mod_label'] = 'Mod';

        Object.keys(cleanInputs).forEach(key => setInput(key, cleanInputs[key]));
        Object.keys(post.savedInputs).forEach(key => setInput(key, post.savedInputs![key] || ''));
      }

      if (post.savedLinkConfigs) {
        setLinkConfigs(JSON.parse(JSON.stringify(post.savedLinkConfigs)));
      } else if (post.savedInputs) {
        setLinkConfigs({
          Game_link: { source: 'F95', value: post.savedInputs.Game_link || '' },
          Translate_link: { source: 'Autre', value: post.savedInputs.Translate_link || '' },
          Mod_link: { source: 'Autre', value: post.savedInputs.Mod_link || '' },
        });
      }

      if (post.savedAdditionalTranslationLinks) {
        setAdditionalTranslationLinks(JSON.parse(JSON.stringify(post.savedAdditionalTranslationLinks)));
      } else {
        setAdditionalTranslationLinks([]);
      }
      if (post.savedAdditionalModLinks) {
        setAdditionalModLinks(JSON.parse(JSON.stringify(post.savedAdditionalModLinks)));
      } else {
        setAdditionalModLinks([]);
      }

      if (post.savedInputs?.['main_translation_label']) {
        setInput('main_translation_label', post.savedInputs.main_translation_label);
      }
      if (post.savedInputs?.['main_mod_label']) {
        setInput('main_mod_label', post.savedInputs.main_mod_label);
      }

      if (post.imagePath && (post.imagePath.startsWith('http://') || post.imagePath.startsWith('https://'))) {
        const fileName = new URL(post.imagePath).pathname.split('/').pop() || 'image.jpg';
        setUploadedImages([
          { id: Date.now().toString(), url: post.imagePath, name: fileName, isMain: true },
        ]);
      }

      setPreviewOverride(post.content ?? '');
    },
    [
      setEditingPostId,
      setEditingPostData,
      setPostTitle,
      setPostTags,
      setTranslationType,
      setIsIntegrated,
      templates,
      allVarsConfig,
      setInput,
      setLinkConfigs,
      setAdditionalTranslationLinks,
      setAdditionalModLinks,
      setUploadedImages,
      setPreviewOverride,
    ]
  );

  const loadPostForDuplication = useCallback(
    (post: PublishedPost) => {
      setEditingPostId(null);
      setEditingPostData(null);
      setPreviewOverride(null);
      setPostTitle(post.title);
      setPostTags(post.tags);

      if (post.translationType) setTranslationType(post.translationType);
      if (post.isIntegrated !== undefined) setIsIntegrated(post.isIntegrated);

      if (post.savedInputs) {
        Object.keys(post.savedInputs).forEach(key => setInput(key, post.savedInputs![key] ?? ''));
      }

      if (post.savedLinkConfigs) {
        setLinkConfigs(JSON.parse(JSON.stringify(post.savedLinkConfigs)));
      } else if (post.savedInputs) {
        setLinkConfigs({
          Game_link: { source: 'F95', value: post.savedInputs.Game_link || '' },
          Translate_link: { source: 'Autre', value: post.savedInputs.Translate_link || '' },
          Mod_link: { source: 'Autre', value: post.savedInputs.Mod_link || '' },
        });
      }
      if (post.savedAdditionalTranslationLinks) {
        setAdditionalTranslationLinks(JSON.parse(JSON.stringify(post.savedAdditionalTranslationLinks)));
      } else {
        setAdditionalTranslationLinks([]);
      }
      if (post.savedAdditionalModLinks) {
        setAdditionalModLinks(JSON.parse(JSON.stringify(post.savedAdditionalModLinks)));
      } else {
        setAdditionalModLinks([]);
      }
      if (post.savedInputs?.['main_translation_label']) {
        setInput('main_translation_label', post.savedInputs.main_translation_label);
      }
      if (post.savedInputs?.['main_mod_label']) {
        setInput('main_mod_label', post.savedInputs.main_mod_label);
      }
    },
    [
      setEditingPostId,
      setEditingPostData,
      setPreviewOverride,
      setPostTitle,
      setPostTags,
      setTranslationType,
      setIsIntegrated,
      setInput,
      setLinkConfigs,
      setAdditionalTranslationLinks,
      setAdditionalModLinks,
    ]
  );

  return { loadPostForEditing, loadPostForDuplication };
}
