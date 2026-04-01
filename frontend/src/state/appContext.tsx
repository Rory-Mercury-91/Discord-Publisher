import React, { createContext, useCallback, useContext, useEffect } from 'react';
import ErrorModal from '../components/Modals/ErrorModal';
import { useToast } from '../components/shared/ToastProvider';
import { createApiHeaders } from '../lib/api-helpers';
import { getSupabase } from '../lib/supabase';
import { useTampermonkeyListener } from './hooks/useTampermonkeyListener';
import { tauriAPI } from '../lib/tauri-api';
import { useAuth } from './authContext';
import { useImagesState } from './hooks/useImagesState';
import { useApiConfig } from './hooks/useApiConfig';
import { useErrorModal } from './hooks/useErrorModal';
import { useLinkConfigState } from './hooks/useLinkConfigState';
import { usePublicationAndHistory } from './hooks/usePublicationAndHistory';
import { useTemplatesVarsInputs } from './hooks/useTemplatesVarsInputs';
import { useTagsState } from './hooks/useTagsState';
import { usePostFormState } from './hooks/usePostFormState';
import { useDiscordAndApiStatus } from './hooks/useDiscordAndApiStatus';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { useLoadPost } from './hooks/useLoadPost';
import { useClearAllAppData } from './hooks/useClearAllAppData';
import { mergeInstructionsFromSupabase, useInstructionsState } from './hooks/useInstructionsState';
import { usePreviewEngine } from './hooks/usePreviewEngine';
import { buildFinalLink } from './logic/links';
import { postToRow, rowToPost } from './logic/history';
import { buildDynamicTitle } from './logic/title';
import { b64EncodeUtf8 } from './logic/utils';
import { applyFullConfig } from './logic/importConfig';
import type {
  AdditionalTranslationLink,
  LinkConfig,
  PublishedPost,
  Tag,
  Template,
  VarConfig
} from './types';

// Ré-exporter les types pour la compatibilité
export type {
  AdditionalTranslationLink, LinkConfig, PublishedPost, Tag, Template, VarConfig
};

 type AppContextValue = {
  resetAllFields: () => void;
  templates: Template[];
  updateTemplate: (idx: number, t: Template) => void;
  restoreDefaultTemplates: () => void;
  currentTemplateIdx: number;
  setCurrentTemplateIdx: (idx: number) => void;
  allVarsConfig: VarConfig[];
  addVarConfig: (v: VarConfig) => void;
  updateVarConfig: (idx: number, v: VarConfig) => void;
  deleteVarConfig: (idx: number) => void;
  inputs: Record<string, string>;
  setInput: (name: string, value: string) => void;
  translationType: string;
  setTranslationType: (type: string) => void;
  isIntegrated: boolean;
  setIsIntegrated: (value: boolean) => void;
  preview: string;
  previewOverride: string | null;
  setPreviewOverride: (value: string | null) => void;
  savedTags: Tag[];
  addSavedTag: (t: Tag) => void;
  updateSavedTag: (id: string, updates: Partial<Tag>) => void;
  deleteSavedTag: (idx: number) => void;
  syncTagsToSupabase: (authorDiscordId?: string) => Promise<{ ok: boolean; count?: number; error?: string }>;
  fetchTagsFromSupabase: () => Promise<void>;
  syncInstructionsToSupabase: () => Promise<{ ok: boolean; error?: string }>;
  fetchInstructionsFromSupabase: () => Promise<void>;
  syncTemplatesToSupabase: (templatesToSync?: Template[]) => Promise<{ ok: boolean; error?: string }>;
  syncTemplatesForOwnerToSupabase: (ownerId: string, templates: Template[], customVars?: VarConfig[]) => Promise<{ ok: boolean; error?: string }>;
  fetchTemplatesFromSupabase: () => Promise<void>;
  applySavedTemplatesPayload: (value: unknown) => void;
  importFullConfig: (config: any) => void;

  savedInstructions: Record<string, string>;
  saveInstruction: (name: string, text: string, ownerId?: string) => void;
  deleteInstruction: (name: string) => void;
  instructionOwners: Record<string, string>;

  uploadedImages: Array<{ id: string; url?: string; name: string; isMain: boolean }>;
  addImageFromUrl: (url: string) => void;
  removeImage: (idx: number) => void;
  setMainImage: (idx: number) => void;

  postTitle: string;
  setPostTitle: (s: string) => void;
  postTags: string;
  setPostTags: (s: string) => void;

  apiUrl: string;
  publishInProgress: boolean;
  lastPublishResult: string | null;
  /** 
   * Publie un post.
   * - authorDiscordId : Discord ID du profil qui publie (utilisateur connecté)
   * - authorExternalTranslatorId : si défini, le post est attribué à ce traducteur externe dans l'historique
   */
  publishPost: (
    authorDiscordId?: string,
    authorExternalTranslatorId?: string,
    options?: { silentUpdate?: boolean; skipVersionControl?: boolean }
  ) => Promise<{ ok: boolean; data?: any; error?: string }>;

  showErrorModal: (error: { code?: string | number; message: string; context?: string; httpStatus?: number; discordError?: any }) => void;

  publishedPosts: PublishedPost[];
  addPublishedPost: (p: PublishedPost, skipSupabase?: boolean) => Promise<void>;
  updatePublishedPost: (id: string, p: Partial<PublishedPost>) => Promise<void>;
  deletePublishedPost: (id: string) => void;
  fetchHistoryFromAPI: () => Promise<void>;
  parseHistoryRow: (row: Record<string, unknown>) => PublishedPost;
  clearAllAppData: (ownerId?: string) => Promise<{ ok: boolean; error?: string }>;

  rateLimitCooldown: number | null;

  linkConfigs: {
    Game_link: LinkConfig;
    Translate_link: LinkConfig;
    Mod_link: LinkConfig;
  };
  setLinkConfig: (
    linkName: 'Game_link' | 'Translate_link' | 'Mod_link',
    source: 'F95' | 'Lewd' | 'Autre',
    value: string
  ) => void;
  /** Construit l’URL finale à partir d’une LinkConfig (même logique que le preview). */
  buildFinalLink: (config: LinkConfig) => string;
  setLinkConfigs: React.Dispatch<React.SetStateAction<{
    Game_link: LinkConfig;
    Translate_link: LinkConfig;
    Mod_link: LinkConfig;
  }>>;

  editingPostId: string | null;
  editingPostData: PublishedPost | null;
  setEditingPostId: (id: string | null) => void;
  setEditingPostData: (post: PublishedPost | null) => void;
  loadPostForEditing: (post: PublishedPost) => void;
  loadPostForDuplication: (post: PublishedPost) => void;

  setApiBaseFromSupabase: (url: string | null) => void;
  /** URL du formulaire liste (tableur), configurée par l'admin dans app_config. */
  listFormUrl: string;
  apiStatus: string;
  setApiStatus: React.Dispatch<React.SetStateAction<string>>;
  discordConfig: any;
  setDiscordConfig: React.Dispatch<React.SetStateAction<any>>;

  additionalTranslationLinks: AdditionalTranslationLink[];
  addAdditionalTranslationLink: () => void;
  updateAdditionalTranslationLink: (index: number, link: AdditionalTranslationLink) => void;
  deleteAdditionalTranslationLink: (index: number) => void;
  additionalModLinks: AdditionalTranslationLink[];
  addAdditionalModLink: () => void;
  updateAdditionalModLink: (index: number, link: AdditionalTranslationLink) => void;
  deleteAdditionalModLink: (index: number) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  // ========================================
  // HOOKS EXTRAITS
  // ========================================
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const imagesState = useImagesState();
  const instructionsState = useInstructionsState();
  const linkState = useLinkConfigState();

  const tagsState = useTagsState();
  const postFormState = usePostFormState();
  const { discordConfig, setDiscordConfig, apiStatus, setApiStatus } = useDiscordAndApiStatus();

  const tvState = useTemplatesVarsInputs();

  function importFullConfig(config: unknown) {
    applyFullConfig(config, {
      setTemplates: (templates) => tvState.setTemplates(templates as Template[]),
      setAllVarsConfig: (vars) => tvState.setAllVarsConfig(vars as VarConfig[]),
      setInputs: tvState.setInputs,
      setSavedTags: (tags) => tagsState.setSavedTags(tags as Tag[]),
      setSavedInstructions: instructionsState.setSavedInstructions,
      setPublishedPosts: (posts) => pubState.setPublishedPosts(posts as PublishedPost[]),
    });
    setApiStatus('checking');
  }

  const { errorModalData, showErrorModal, closeErrorModal } = useErrorModal();

  // API Configuration - URL is now hardcoded for local API
  // Définir l’URL de base en consultant d’abord localStorage, puis .env, et enfin un fallback Koyeb
  const apiConfig = useApiConfig();
  const pubState = usePublicationAndHistory({
    apiUrl: apiConfig.apiUrl,
    isMasterAdmin: profile?.is_master_admin === true,
  });

  // Mettre à jour les inputs avec les liens construits pour le preview
  useEffect(() => {
    tvState.setInputs(prev => ({
      ...prev,
      Game_link: buildFinalLink(linkState.linkConfigs.Game_link),
      Translate_link: buildFinalLink(linkState.linkConfigs.Translate_link),
      Mod_link: buildFinalLink(linkState.linkConfigs.Mod_link)
    }));
  }, [linkState.linkConfigs, tvState.setInputs]);

  // Génération automatique du titre dynamique (logique pure dans state/logic/title.ts)
  useEffect(() => {
    postFormState.setPostTitle(buildDynamicTitle(tvState.inputs['Game_name'], tvState.inputs['Game_version']));
  }, [tvState.inputs['Game_name'], tvState.inputs['Game_version']]);

  // Envoyer la configuration Discord à l'API au démarrage
  useEffect(() => {
    const sendConfigToAPI = async () => {
      try {
        const configStr = localStorage.getItem('discordConfig');
        if (!configStr) return;
        const discordConfig = JSON.parse(configStr);
        if (!discordConfig.discordPublisherToken) return;
        // utilise l’URL de base dynamique
        const response = await fetch(`${apiConfig.defaultApiBase}/api/configure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(discordConfig)
        });
        if (response.ok) {
          console.log('✅ Configuration Discord envoyée à l’API');
        } else {
          console.warn('⚠️ Échec de l’envoi de la configuration à l’API');
        }
      } catch (error) {
        console.error('❌ Erreur lors de l’envoi de la configuration:', error);
      }
    };
    const timer = setTimeout(sendConfigToAPI, 5000);
    return () => clearTimeout(timer);
  }, [apiConfig.defaultApiBase]);

  const clearAllAppData = useClearAllAppData({
    onClearPublishedPosts: () => pubState.setPublishedPosts([]),
    onClearInstructions: () => instructionsState.setSavedInstructions({}),
    onClearInstructionOwners: () => instructionsState.setInstructionOwners({}),
  });

  async function publishPost(
    authorDiscordId?: string,
    authorExternalTranslatorId?: string,
    options?: { silentUpdate?: boolean; skipVersionControl?: boolean }
  ) {
    const title = (postFormState.postTitle || '').trim();
    const content = previewEngine.preview || '';
    const templateId = tvState.templates[tvState.currentTemplateIdx]?.id || null;
    const isEditMode = pubState.editingPostId !== null && pubState.editingPostData !== null;

    const selectedIds = (postFormState.postTags || '').split(',').map(s => s.trim()).filter(Boolean);
    const tagsToSend = selectedIds
      .map(id => {
        const tag = tagsState.savedTags.find(t => (t.id || t.name) === id || String(t.discordTagId ?? '') === id);
        if (tag?.discordTagId) return String(tag.discordTagId);
        return tag?.name ?? id;
      })
      .filter(Boolean)
      .join(',');

    const selectedTagObjects = tagsState.savedTags.filter(t =>
      selectedIds.some(id => (t.id || t.name) === id || String(t.discordTagId ?? '') === id)
    );
    const translatorLabel = selectedTagObjects.filter(t => t.tagType === 'translator').map(t => t.name).join(', ');
    const stateLabel = selectedTagObjects.filter(t => t.tagType !== 'translator').map(t => t.name).join(', ');

    const baseUrlRaw = localStorage.getItem('apiBase') || apiConfig.defaultApiBase;
    const baseUrl = baseUrlRaw.replace(/\/+$/, '');

    const apiEndpoint = isEditMode
      ? `${baseUrl}/api/forum-post/update`
      : `${baseUrl}/api/forum-post`;

    if (!title || title.length === 0) {
      pubState.setLastPublishResult('❌ Titre obligatoire');
      showErrorModal({ code: 'VALIDATION_ERROR', message: 'Le titre du post est obligatoire', context: 'Validation avant publication', httpStatus: 400 });
      return { ok: false, error: 'missing_title' };
    }

    if (!baseUrl || baseUrl.trim().length === 0) {
      pubState.setLastPublishResult('❌ URL API manquante dans Configuration');
      showErrorModal({ code: 'CONFIG_ERROR', message: 'URL de l\'API manquante', context: 'Veuillez configurer l\'URL de l\'API dans Configuration', httpStatus: 500 });
      return { ok: false, error: 'missing_api_url' };
    }

    if (pubState.rateLimitCooldown !== null && Date.now() < pubState.rateLimitCooldown) {
      const remainingSeconds = Math.ceil((pubState.rateLimitCooldown - Date.now()) / 1000);
      pubState.setLastPublishResult(`⏳ Rate limit actif. Attendez ${remainingSeconds} secondes.`);
      showErrorModal({ code: 'RATE_LIMIT_COOLDOWN', message: `Rate limit actif`, context: `Veuillez attendre ${remainingSeconds} secondes avant de réessayer pour éviter un bannissement IP.`, httpStatus: 429 });
      return { ok: false, error: 'rate_limit_cooldown' };
    }

    const hasSite = selectedTagObjects.some(t => t.tagType === 'sites');
    const hasTranslationType = selectedTagObjects.some(t => t.tagType === 'translationType');
    const hasTranslator = selectedTagObjects.some(t => t.tagType === 'translator');
    const missing: string[] = [];
    if (!hasSite) missing.push('Site');
    if (!hasTranslationType) missing.push('Type de traduction');
    if (!hasTranslator) missing.push('Traducteur');
    if (missing.length > 0) {
      pubState.setLastPublishResult(`❌ Tags obligatoires manquants : ${missing.join(', ')}`);
      showErrorModal({ code: 'VALIDATION_ERROR', message: 'Tags obligatoires manquants', context: `Vous devez sélectionner au moins un tag pour chaque catégorie : Site, Type de traduction et Traducteur. Manquant : ${missing.join(', ')}. Les tags "Autres" et "Statut du jeu" restent optionnels.`, httpStatus: 400 });
      return { ok: false, error: 'missing_required_tags' };
    }

    pubState.setPublishInProgress(true);
    pubState.setLastPublishResult(null);

    try {
      const metadata = {
        game_name: tvState.inputs['Game_name'] || '',
        game_version: tvState.inputs['Game_version'] || '',
        translate_version: tvState.inputs['Translate_version'] || '',
        translation_type: postFormState.translationType || '',
        is_integrated: postFormState.isIntegrated,
        etat: tagsToSend || '',
        timestamp: Date.now()
      };

      // Résoudre le forum_channel_id depuis le mapping du tag traducteur sélectionné
      let resolvedForumChannelId: string | null = null;
      const translatorTag = selectedTagObjects.find(t => t.tagType === 'translator');
      if (translatorTag?.id) {
        const sb = getSupabase();
        if (sb) {
          try {
            // 1. Chercher d'abord dans translator_forum_mappings (traducteurs inscrits)
            const { data: mappingData } = await sb
              .from('translator_forum_mappings')
              .select('forum_channel_id')
              .eq('tag_id', translatorTag.id)
              .maybeSingle();

            if (mappingData?.forum_channel_id) {
              resolvedForumChannelId = mappingData.forum_channel_id;
            } else {
              // 2. Fallback : chercher dans external_translators (traducteurs externes)
              const { data: extData } = await sb
                .from('external_translators')
                .select('forum_channel_id')
                .eq('tag_id', translatorTag.id)
                .maybeSingle();

              if (extData?.forum_channel_id?.trim()) {
                resolvedForumChannelId = extData.forum_channel_id.trim();
              }
            }
          } catch { /* non bloquant */ }
        }
      }

      let finalContent = content;
      if (imagesState.uploadedImages.length > 0) {
        const mainImage = imagesState.uploadedImages.find(img => img.isMain) || imagesState.uploadedImages[0];
        if (mainImage.url) {
          finalContent = content + '\n' + mainImage.url;
        }
      }

      const formData = new FormData();
      formData.append('title', title);
      formData.append('content', finalContent);
      formData.append('tags', tagsToSend);
      formData.append('metadata', b64EncodeUtf8(JSON.stringify(metadata)));
      formData.append('translator_label', translatorLabel);
      formData.append('state_label', stateLabel);
      formData.append('game_version', tvState.inputs['Game_version'] || '');
      formData.append('translate_version', tvState.inputs['Translate_version'] || '');
      const mainImageForAnnounce = imagesState.uploadedImages.find(i => i.isMain) || imagesState.uploadedImages[0];
      const announceImageUrl = mainImageForAnnounce?.url && (mainImageForAnnounce.url.startsWith('http://') || mainImageForAnnounce.url.startsWith('https://'))
        ? mainImageForAnnounce.url
        : '';
      formData.append('announce_image_url', announceImageUrl);
      if (resolvedForumChannelId) {
        formData.append('forum_channel_id', resolvedForumChannelId);
      }

      if (isEditMode && pubState.editingPostData) {
        formData.append('threadId', pubState.editingPostData.threadId);
        formData.append('messageId', pubState.editingPostData.messageId);
        formData.append('thread_url', pubState.editingPostData.discordUrl || '');
        formData.append('isUpdate', 'true');
        if (options?.silentUpdate) {
          formData.append('silent_update', 'true');
        }
      }

      const savedInputsWithVersionFlag = options?.skipVersionControl
        ? { ...tvState.inputs, _skip_version_check: 'true' }
        : { ...tvState.inputs };

      const now = Date.now();
      const postId = `post_${now}_${Math.random().toString(36).substr(2, 9)}`;
      const imagePathVal = imagesState.uploadedImages.find(i => i.isMain)?.url;
      if (isEditMode && pubState.editingPostData) {
        const mergedForHistory: PublishedPost = {
          ...pubState.editingPostData,
          id: pubState.editingPostData.id,
          timestamp: now,
          updatedAt: now,
          title,
          content: finalContent,
          tags: tagsToSend,
          imagePath: imagePathVal,
          translationType: postFormState.translationType,
          isIntegrated: postFormState.isIntegrated,
          savedInputs: savedInputsWithVersionFlag,
          savedLinkConfigs: JSON.parse(JSON.stringify(linkState.linkConfigs)),
          savedAdditionalTranslationLinks: JSON.parse(JSON.stringify(linkState.additionalTranslationLinks)),
          savedAdditionalModLinks: JSON.parse(JSON.stringify(linkState.additionalModLinks)),
          threadId: pubState.editingPostData.threadId,
          messageId: pubState.editingPostData.messageId,
          discordUrl: pubState.editingPostData.discordUrl || '',
          forumId: pubState.editingPostData.forumId ?? 0,
          templateId: templateId ?? pubState.editingPostData.templateId ?? undefined,
          authorDiscordId: pubState.editingPostData.authorDiscordId,
          authorExternalTranslatorId: pubState.editingPostData.authorExternalTranslatorId
        };
        formData.append('history_payload', JSON.stringify(postToRow(mergedForHistory)));
      } else {
        const newPostForHistory: PublishedPost = {
          id: postId,
          timestamp: now,
          createdAt: now,
          updatedAt: now,
          title,
          content: finalContent,
          tags: tagsToSend,
          imagePath: imagePathVal,
          translationType: postFormState.translationType,
          isIntegrated: postFormState.isIntegrated,
          savedInputs: savedInputsWithVersionFlag,
          savedLinkConfigs: JSON.parse(JSON.stringify(linkState.linkConfigs)),
          savedAdditionalTranslationLinks: JSON.parse(JSON.stringify(linkState.additionalTranslationLinks)),
          savedAdditionalModLinks: JSON.parse(JSON.stringify(linkState.additionalModLinks)),
          threadId: '',
          messageId: '',
          discordUrl: '',
          forumId: 0,
          authorDiscordId: authorDiscordId ?? undefined,
          authorExternalTranslatorId: authorExternalTranslatorId ?? undefined,
          templateId: templateId ?? undefined
        };
        formData.append('history_payload', JSON.stringify(postToRow(newPostForHistory)));
      }

      const apiKey = localStorage.getItem('apiKey') || '';
      const headers = await createApiHeaders(apiKey);
      const response = await fetch(apiEndpoint, { method: 'POST', headers, body: formData });
      const res = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          const cooldownEnd = Date.now() + 60000;
          pubState.setRateLimitCooldown(cooldownEnd);
          pubState.setLastPublishResult('❌ Rate limit Discord (429). Cooldown de 60 secondes activé.');
          showErrorModal({ code: 'RATE_LIMIT_429', message: 'Rate limit Discord atteint', context: 'Discord a limité les requêtes. Le bouton de publication sera désactivé pendant 60 secondes pour éviter un bannissement IP.', httpStatus: 429, discordError: res });
          setTimeout(() => { pubState.setRateLimitCooldown(null); pubState.setLastPublishResult(null); }, 60000);
          return { ok: false, error: 'rate_limit_429' };
        }
        pubState.setLastPublishResult('Erreur API: ' + (res.error || 'unknown'));
        const isNetworkError = !response.status || response.status === 0;
        showErrorModal({ code: res.error || 'API_ERROR', message: isNetworkError ? 'L\'API n\'est pas accessible. Vérifiez l\'URL de l\'API.' : (res.error || 'Erreur inconnue'), context: isEditMode ? 'Mise à jour du post Discord' : 'Publication du post Discord', httpStatus: response.status || 0, discordError: res });
        return { ok: false, error: res.error };
      }

      if (pubState.rateLimitCooldown !== null) {
        pubState.setRateLimitCooldown(null);
      }

      let successMsg = isEditMode
        ? (res.rerouted ? '🔀 Post déplacé dans le bon salon' : 'Mise à jour réussie')
        : 'Publication réussie';

      pubState.setLastPublishResult(successMsg);

      if (res.rerouted) {
        showToast(
          '🔀 Le post a été déplacé dans le salon correct et l\'ancien a été supprimé.',
          'success',
          5000
        );
      }

      // ── Warning clé API legacy ──────────────────────────────────────────────
      if (res.legacy_key_warning) {
        setTimeout(() => {
          showToast(
            '⚠️ Clé API obsolète — Tapez /generer-cle sur le serveur Discord pour obtenir votre clé personnelle.',
            'warning',
            8000
          );
        }, 1000);
      }
      // ───────────────────────────────────────────────────────────────────────

      const threadId = res.thread_id || res.threadId;
      const messageId = res.message_id || res.messageId;
      const threadUrl = res.thread_url || res.threadUrl || res.url || res.discordUrl || '';
      const forumId = res.forum_id || res.forumId || 0;

      if (threadId && messageId) {
        const savedInputsForState = options?.skipVersionControl
          ? { ...tvState.inputs, _skip_version_check: 'true' }
          : { ...tvState.inputs };
        if (isEditMode && pubState.editingPostId && pubState.editingPostData) {
          const now = Date.now();
          const updatedPost: PublishedPost = {
            ...pubState.editingPostData,
            id: pubState.editingPostId,
            timestamp: now,
            createdAt: pubState.editingPostData.createdAt ?? now,
            updatedAt: now,
            title,
            content,
            tags: tagsToSend,
            imagePath: imagesState.uploadedImages.find(i => i.isMain)?.url,
            translationType: postFormState.translationType,
            isIntegrated: postFormState.isIntegrated,
            savedInputs: savedInputsForState,
            savedLinkConfigs: JSON.parse(JSON.stringify(linkState.linkConfigs)),
            savedAdditionalTranslationLinks: JSON.parse(JSON.stringify(linkState.additionalTranslationLinks)),
            savedAdditionalModLinks: JSON.parse(JSON.stringify(linkState.additionalModLinks)),
            threadId: String(threadId),
            messageId: String(messageId),
            discordUrl: threadUrl || pubState.editingPostData.discordUrl,
            forumId: typeof forumId === 'number' ? forumId : parseInt(String(forumId)) || 0,
            authorDiscordId: pubState.editingPostData.authorDiscordId,
            authorExternalTranslatorId: pubState.editingPostData.authorExternalTranslatorId
          };
          await pubState.updatePublishedPost(pubState.editingPostId, updatedPost);
          tauriAPI.saveLocalHistoryPost(postToRow(updatedPost), updatedPost.authorDiscordId ?? updatedPost.authorExternalTranslatorId ?? undefined);
          pubState.setEditingPostId(null);
          pubState.setEditingPostData(null);
        } else {
          const now = Date.now();
        const newPost: PublishedPost = {
            id: postId,
            timestamp: now,
            createdAt: now,
            updatedAt: now,
            title,
            content,
            tags: tagsToSend,
            imagePath: imagesState.uploadedImages.find(i => i.isMain)?.url,
            translationType: postFormState.translationType,
            isIntegrated: postFormState.isIntegrated,
            savedInputs: savedInputsForState,
            savedLinkConfigs: JSON.parse(JSON.stringify(linkState.linkConfigs)),
            savedAdditionalTranslationLinks: JSON.parse(JSON.stringify(linkState.additionalTranslationLinks)),
            savedAdditionalModLinks: JSON.parse(JSON.stringify(linkState.additionalModLinks)),
            threadId: String(threadId),
            messageId: String(messageId),
            discordUrl: threadUrl,
            forumId: typeof forumId === 'number' ? forumId : parseInt(String(forumId)) || 0,
            authorDiscordId: authorDiscordId ?? undefined,
            authorExternalTranslatorId: authorExternalTranslatorId ?? undefined,
            templateId: templateId ?? undefined
          };
          await pubState.addPublishedPost(newPost, true);
          tauriAPI.saveLocalHistoryPost(postToRow(newPost), newPost.authorDiscordId);
        }
      }

      return { ok: true, data: res };

    } catch (e: any) {
      pubState.setLastPublishResult('Erreur envoi: ' + String(e?.message || e));
      showErrorModal({ code: 'NETWORK_ERROR', message: String(e?.message || e), context: 'Exception lors de la publication', httpStatus: 0 });
      return { ok: false, error: String(e?.message || e) };
    } finally {
      pubState.setPublishInProgress(false);
    }
  }

  useEffect(() => {
    const handler = () => { /* recharger savedTags depuis Supabase */ };
    window.addEventListener('tagsUpdated', handler);
    return () => window.removeEventListener('tagsUpdated', handler);
  }, []);

  // Charger la config globale (URL API + URL formulaire liste) depuis Supabase au montage
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.from('app_config')
      .select('key, value')
      .in('key', ['api_base_url', 'list_form_url'])
      .then((res: { data?: Array<{ key: string; value: string }> | null; error?: unknown }) => {
        if (res.error || !res.data?.length) return;
        for (const row of res.data) {
          if (row.key === 'api_base_url' && row.value?.trim()) {
            const url = row.value.trim().replace(/\/+$/, '');
            apiConfig.setApiBaseFromSupabase(url);
          } else if (row.key === 'list_form_url') {
            apiConfig.setListFormUrl((row.value ?? '').trim());
          }
        }
      });
  }, []);

  useEffect(() => {
    if (user) tagsState.fetchTagsFromSupabase();
  }, [user?.id, tagsState.fetchTagsFromSupabase]);

  // Charger instructions (par propriétaire ; visible par l'auteur + éditeurs autorisés) et templates (par utilisateur connecté)
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      const userId = session?.user?.id;

      // Instructions : owner_data (data_key = instructions)
      const resInstr = await sb.from('owner_data').select('owner_type, owner_id, value').eq('data_key', 'instructions');
      if (!resInstr.error && resInstr.data?.length) {
        let localInstructions: Record<string, string> = {};
        let localOwners: Record<string, string> = {};
        try {
          const rawInstr = localStorage.getItem('savedInstructions');
          const rawOwners = localStorage.getItem('instructionOwners');
          if (rawInstr) localInstructions = JSON.parse(rawInstr);
          if (rawOwners) localOwners = JSON.parse(rawOwners);
        } catch (_e) { /* ignorer */ }

        const { merged, owners } = mergeInstructionsFromSupabase(
          resInstr.data as import('./hooks/useInstructionsState').SavedInstructionRow[],
          localInstructions,
          localOwners
        );
        instructionsState.setSavedInstructions(merged);
        instructionsState.setInstructionOwners(owners);
      }

      // Templates + variables personnalisées : owner_data (data_key = templates)
      if (userId) {
        const resTpl = await sb.from('owner_data').select('value').eq('owner_type', 'profile').eq('owner_id', userId).eq('data_key', 'templates').maybeSingle();
        if (!resTpl.error && resTpl.data?.value) tvState.applySavedTemplatesPayload(resTpl.data.value);
      }
    })();
  }, []);

  // Admin : charger toutes les instructions via l'API (contourne la RLS Supabase)
  useEffect(() => {
    if (!profile?.is_master_admin || !apiConfig.apiUrl?.trim()) return;
    // apiConfig.apiUrl contient déjà "/api/forum-post", il faut revenir à l'URL de base.
    const baseUrl = apiConfig.apiUrl.replace(/\/api\/forum-post\/?$/, '').replace(/\/+$/, '');
    const apiKey = localStorage.getItem('apiKey') || '';
    if (!apiKey) return;
    (async () => {
      try {
        const headers = await createApiHeaders(apiKey);
        const res = await fetch(`${baseUrl}/api/instructions`, { headers });
        const data = await res.json().catch(() => ({}));
        if (!data?.ok || !Array.isArray(data.instructions)) return;
        let localInstructions: Record<string, string> = {};
        let localOwners: Record<string, string> = {};
        try {
          const rawInstr = localStorage.getItem('savedInstructions');
          const rawOwners = localStorage.getItem('instructionOwners');
          if (rawInstr) localInstructions = JSON.parse(rawInstr);
          if (rawOwners) localOwners = JSON.parse(rawOwners);
        } catch (_e) { /* ignorer */ }
        const { merged, owners } = mergeInstructionsFromSupabase(
          data.instructions as import('./hooks/useInstructionsState').SavedInstructionRow[],
          localInstructions,
          localOwners
        );
        instructionsState.setSavedInstructions(merged);
        instructionsState.setInstructionOwners(owners);
      } catch (e) {
        console.warn('[App] Chargement instructions admin:', e);
      }
    })();
  }, [profile?.is_master_admin, apiConfig.apiUrl]);

  useRealtimeSync({
    setSavedTags: tagsState.setSavedTags,
    setApiBaseFromSupabase: apiConfig.setApiBaseFromSupabase,
    setListFormUrl: apiConfig.setListFormUrl,
    setPublishedPosts: pubState.setPublishedPosts,
    setSavedInstructions: instructionsState.setSavedInstructions,
    setInstructionOwners: instructionsState.setInstructionOwners,
    applySavedTemplatesPayload: tvState.applySavedTemplatesPayload,
  });

  useEffect(() => {
    localStorage.setItem('imagesState.uploadedImages', JSON.stringify(imagesState.uploadedImages));
  }, [imagesState.uploadedImages]);

  // ========================================
  // PREVIEW ENGINE (hook extrait)
  // ========================================
  const previewEngine = usePreviewEngine({
    templates: tvState.templates,
    currentTemplateIdx: tvState.currentTemplateIdx,
    allVarsConfig: tvState.allVarsConfig,
    inputs: tvState.inputs,
    translationType: postFormState.translationType,
    isIntegrated: postFormState.isIntegrated,
    additionalTranslationLinks: linkState.additionalTranslationLinks,
    additionalModLinks: linkState.additionalModLinks,
    uploadedImages: imagesState.uploadedImages,
    editingPostId: pubState.editingPostId
  });

  const { loadPostForEditing, loadPostForDuplication } = useLoadPost({
    setEditingPostId: pubState.setEditingPostId,
    setEditingPostData: pubState.setEditingPostData,
    setPostTitle: postFormState.setPostTitle,
    setPostTags: postFormState.setPostTags,
    setTranslationType: postFormState.setTranslationType,
    setIsIntegrated: postFormState.setIsIntegrated,
    templates: tvState.templates,
    allVarsConfig: tvState.allVarsConfig,
    setInput: tvState.setInput,
    setLinkConfigs: linkState.setLinkConfigs,
    setAdditionalTranslationLinks: linkState.setAdditionalTranslationLinks,
    setAdditionalModLinks: linkState.setAdditionalModLinks,
    setUploadedImages: imagesState.setUploadedImages,
    setPreviewOverride: previewEngine.setPreviewOverride,
  });

  const resetAllFields = useCallback(() => {
    tvState.allVarsConfig.forEach(v => tvState.setInput(v.name, ''));
    tvState.setInput('instruction', '');
    tvState.setInput('selected_instruction_key', '');
    tvState.setInput('is_modded_game', 'false');
    tvState.setInput('Mod_link', '');
    tvState.setInput('use_additional_links', 'false');
    postFormState.setPostTitle('');
    postFormState.setTranslationType('Automatique');
    postFormState.setIsIntegrated(false);
    linkState.setLinkConfigs({
      Game_link: { source: 'F95', value: '' },
      Translate_link: { source: 'Autre', value: '' },
      Mod_link: { source: 'Autre', value: '' }
    });
    linkState.setAdditionalTranslationLinks([]);
    linkState.setAdditionalModLinks([]);
    tvState.setInput('main_translation_label', localStorage.getItem('default_translation_label') || 'Traduction');
    tvState.setInput('main_mod_label', localStorage.getItem('default_mod_label') || 'Mod');
    imagesState.clearImages();
    previewEngine.setPreviewOverride(null);
  }, [tvState, postFormState, linkState, imagesState, previewEngine]);

  const value: AppContextValue = {
    resetAllFields,
    linkConfigs: linkState.linkConfigs,
    setLinkConfig: linkState.setLinkConfig,
    buildFinalLink,
    setLinkConfigs: linkState.setLinkConfigs,
    templates: tvState.templates,
    importFullConfig,
    updateTemplate: tvState.updateTemplate,
    restoreDefaultTemplates: tvState.restoreDefaultTemplates,
    currentTemplateIdx: tvState.currentTemplateIdx,
    setCurrentTemplateIdx: tvState.setCurrentTemplateIdx,
    allVarsConfig: tvState.allVarsConfig,
    addVarConfig: tvState.addVarConfig,
    updateVarConfig: tvState.updateVarConfig,
    deleteVarConfig: tvState.deleteVarConfig,
    inputs: tvState.inputs,
    setInput: tvState.setInput,
    translationType: postFormState.translationType,
    setTranslationType: postFormState.setTranslationType,
    isIntegrated: postFormState.isIntegrated,
    setIsIntegrated: postFormState.setIsIntegrated,
    preview: previewEngine.preview,
    previewOverride: previewEngine.previewOverride,
    setPreviewOverride: previewEngine.setPreviewOverride,
    savedTags: tagsState.savedTags,
    addSavedTag: tagsState.addSavedTag,
    updateSavedTag: tagsState.updateSavedTag,
    deleteSavedTag: tagsState.deleteSavedTag,
    syncTagsToSupabase: tagsState.syncTagsToSupabase,
    fetchTagsFromSupabase: tagsState.fetchTagsFromSupabase,
    syncInstructionsToSupabase: instructionsState.syncInstructionsToSupabase,
    fetchInstructionsFromSupabase: instructionsState.fetchInstructionsFromSupabase,
    syncTemplatesToSupabase: tvState.syncTemplatesToSupabase,
    syncTemplatesForOwnerToSupabase: tvState.syncTemplatesForOwnerToSupabase,
    fetchTemplatesFromSupabase: tvState.fetchTemplatesFromSupabase,
    applySavedTemplatesPayload: tvState.applySavedTemplatesPayload,

    savedInstructions: instructionsState.savedInstructions,
    saveInstruction: instructionsState.saveInstruction,
    deleteInstruction: instructionsState.deleteInstruction,
    instructionOwners: instructionsState.instructionOwners,

    uploadedImages: imagesState.uploadedImages,
    addImageFromUrl: imagesState.addImageFromUrl,
    removeImage: imagesState.removeImage,
    setMainImage: imagesState.setMainImage,

    // Post & API
    postTitle: postFormState.postTitle,
    setPostTitle: postFormState.setPostTitle,
    postTags: postFormState.postTags,
    setPostTags: postFormState.setPostTags,

    apiUrl: apiConfig.apiUrl,

    publishInProgress: pubState.publishInProgress,
    lastPublishResult: pubState.lastPublishResult,
    publishPost,

    // Error handling
    showErrorModal,

    // History
    publishedPosts: pubState.publishedPosts,
    addPublishedPost: pubState.addPublishedPost,
    updatePublishedPost: pubState.updatePublishedPost,
    deletePublishedPost: pubState.deletePublishedPost,
    fetchHistoryFromAPI: pubState.fetchHistoryFromAPI,
    parseHistoryRow: rowToPost,
    clearAllAppData,

    // Rate limit protection
    rateLimitCooldown: pubState.rateLimitCooldown,

    setApiBaseFromSupabase: apiConfig.setApiBaseFromSupabase,
    listFormUrl: apiConfig.listFormUrl,

    // Edit mode
    editingPostId: pubState.editingPostId,
    editingPostData: pubState.editingPostData,
    setEditingPostId: pubState.setEditingPostId,
    setEditingPostData: pubState.setEditingPostData,
    loadPostForEditing,
    loadPostForDuplication,

    // API status global
    apiStatus,
    setApiStatus,

    // Discord config global
    discordConfig,
    setDiscordConfig,

    additionalTranslationLinks: linkState.additionalTranslationLinks,
    addAdditionalTranslationLink: linkState.addAdditionalTranslationLink,
    updateAdditionalTranslationLink: linkState.updateAdditionalTranslationLink,
    deleteAdditionalTranslationLink: linkState.deleteAdditionalTranslationLink,
    additionalModLinks: linkState.additionalModLinks,
    addAdditionalModLink: linkState.addAdditionalModLink,
    updateAdditionalModLink: linkState.updateAdditionalModLink,
    deleteAdditionalModLink: linkState.deleteAdditionalModLink
  };

  // Écoute les imports Tampermonkey envoyés via le serveur local Tauri (localhost:7832)
  useTampermonkeyListener();

  return (
    <AppContext.Provider value={value}>
      {children}
      {errorModalData && (
        <ErrorModal
          error={errorModalData}
          onClose={closeErrorModal}
          onRetry={publishPost}
        />
      )}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
