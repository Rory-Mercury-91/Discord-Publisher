import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  isCalendarPublishedPost,
  migrateCalendarInputs,
  migrateLegacyBookFields,
} from '../calendarTemplate';
import { SKIP_VERSION_CHECK_INPUT_KEY } from '../logic/postPublishFlags';
import type { AdditionalTranslationLink, PublishedPost, Tag } from '../types';
import {
  applyWorkTrackingInputs,
  catchUpWorkTrackingInputs,
} from '../workTracking/catchUpWorkTrackingInputs';
import { fetchPublishedPostById } from '../workTracking/fetchPublishedPost';
import type { ImageData } from './useImagesState';
import type { LinkConfigs } from './useLinkConfigState';

function parsePostTagIds(tags: string): string[] {
  return tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : [];
}

function refreshWorkTrackingInputs(
  rawInputs: Record<string, string>,
  tagIds: string[],
  savedTags: Tag[],
  setInput: (name: string, value: string) => void
): void {
  const migrated = migrateLegacyBookFields(migrateCalendarInputs(rawInputs));
  const caught = catchUpWorkTrackingInputs(migrated, tagIds, savedTags);
  applyWorkTrackingInputs(caught, setInput);
}

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
  setUploadedImages: (images: ImageData[]) => void;
  setPreviewOverride: (value: string | null) => void;
  setCurrentTemplateIdx: (idx: number) => void;
  savedTags: Tag[];
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
    setCurrentTemplateIdx,
    savedTags,
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
          setCurrentTemplateIdx(templateIdx);
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
        Object.keys(post.savedInputs).forEach(key => {
          if (key === SKIP_VERSION_CHECK_INPUT_KEY) return;
          setInput(key, post.savedInputs![key] || '');
        });

        if (isCalendarPublishedPost(post)) {
          const migrated = migrateLegacyBookFields(migrateCalendarInputs(post.savedInputs));
          for (const key of [
            'Official_Site_Label',
            'Official_Site_Link',
            'Scan_Site_Label',
            'Scan_Site_Link',
          ] as const) {
            if (migrated[key]) setInput(key, migrated[key]);
          }
          refreshWorkTrackingInputs(
            post.savedInputs,
            parsePostTagIds(post.tags || ''),
            savedTags,
            setInput
          );
        }
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
        const baseImage = { id: Date.now().toString(), url: post.imagePath, name: fileName, isMain: true };
        setUploadedImages([baseImage]);
        void import('../workTracking/resolveWorkImage').then(({ resolveWorkImagePreview }) =>
          resolveWorkImagePreview(post.imagePath!).then(resolved => {
            if (!resolved) return;
            setUploadedImages([{
              ...baseImage,
              url: resolved.sourceUrl,
              previewUrl: resolved.previewUrl,
            }]);
          }),
        );
      }

      if (isCalendarPublishedPost(post)) {
        setPreviewOverride(null);
        void (async () => {
          const fresh = await fetchPublishedPostById(post.id);
          if (!fresh?.savedInputs) return;
          refreshWorkTrackingInputs(
            fresh.savedInputs,
            parsePostTagIds(fresh.tags || post.tags || ''),
            savedTags,
            setInput
          );
        })();
      } else {
        setPreviewOverride(post.content ?? '');
      }
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
      setCurrentTemplateIdx,
      savedTags,
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
        Object.keys(post.savedInputs).forEach(key => {
          if (key === SKIP_VERSION_CHECK_INPUT_KEY) return;
          setInput(key, post.savedInputs![key] ?? '');
        });
        if (isCalendarPublishedPost(post)) {
          refreshWorkTrackingInputs(
            post.savedInputs,
            parsePostTagIds(post.tags || ''),
            savedTags,
            setInput
          );
        }
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
      savedTags,
    ]
  );

  return { loadPostForEditing, loadPostForDuplication };
}
