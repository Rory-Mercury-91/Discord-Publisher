import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import ErrorModal from '../components/ErrorModal';
import { apiFetch, createApiHeaders } from '../lib/api-helpers';
import { getSupabase } from '../lib/supabase';
import { tauriAPI } from '../lib/tauri-api';
import { useAuth } from './authContext';
import { defaultTemplates, defaultVarsConfig } from './defaults';
import { useImagesState } from './hooks/useImagesState';
import { mergeInstructionsFromSupabase, useInstructionsState } from './hooks/useInstructionsState';
import { usePreviewEngine } from './hooks/usePreviewEngine';
import type {
  AdditionalTranslationLink,
  LinkConfig,
  PublishedPost,
  Tag,
  TagType,
  Template,
  VarConfig
} from './types';

// Ré-exporter les types pour la compatibilité
export type {
  AdditionalTranslationLink, LinkConfig, PublishedPost, Tag, Template, VarConfig
};

/**
 * Nettoie les liens F95/Lewd : on ne garde que l'ID entre threads/ et le reste.
 * Accepte #post-XXXXX ou /post-XXXXX ; on conserve la forme fournie (on n'ajoute jamais de hash si absent).
 */
function cleanGameLinkUrl(url: string): string {
  if (!url || !url.trim()) return url;
  const trimmed = url.trim().replace(/^<|>$/g, '');
  const f95Match = trimmed.match(/f95zone\.to\/threads\/([^\/#]+)(?:\/(post-\d+))?(?:\/)?(#post-\d+)?/);
  if (f95Match) {
    const segment = f95Match[1];
    const postPath = f95Match[2]; // "post-13454014" (forme path)
    const postHash = f95Match[3]; // "#post-13454014" (forme hash)
    const suffix = postHash || (postPath ? `/${postPath}` : '');
    const id = segment.includes('.') ? (segment.match(/\.(\d+)$/)?.[1] ?? segment) : segment;
    const base = `https://f95zone.to/threads/${id}/`;
    return base + (suffix.startsWith('/') ? suffix.slice(1) : suffix);
  }
  const lewdMatch = trimmed.match(/lewdcorner\.com\/threads\/([^\/#]+)(?:\/(post-\d+))?(?:\/)?(#post-\d+)?/);
  if (lewdMatch) {
    const segment = lewdMatch[1];
    const postPath = lewdMatch[2];
    const postHash = lewdMatch[3];
    const suffix = postHash || (postPath ? `/${postPath}` : '');
    const id = segment.includes('.') ? (segment.match(/\.(\d+)$/)?.[1] ?? segment) : segment;
    const base = `https://lewdcorner.com/threads/${id}/`;
    return base + (suffix.startsWith('/') ? suffix.slice(1) : suffix);
  }
  return trimmed;
}

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
  fetchTemplatesFromSupabase: () => Promise<void>;
  importFullConfig: (config: any) => void;

  savedInstructions: Record<string, string>;
  saveInstruction: (name: string, text: string) => void;
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
  publishPost: (authorDiscordId?: string) => Promise<{ ok: boolean, data?: any, error?: string }>;

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
  const { user } = useAuth();
  const imagesState = useImagesState();
  const instructionsState = useInstructionsState();

  // Base64 UTF-8 (btoa seul ne supporte pas les caractères non-ASCII)
  function b64EncodeUtf8(str: string): string {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    const chunkSize = 0x8000; // éviter "Maximum call stack size" sur gros payloads
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }
  // Discord config global
  const [discordConfig, setDiscordConfig] = useState<any>(() => {
    try {
      const raw = localStorage.getItem('discordConfig');
      if (raw) return JSON.parse(raw);
    } catch { }
    return {};
  });
  // API status global
  const [apiStatus, setApiStatus] = useState<string>("unknown");
  // Templates : tableau avec un seul élément (le template unique modifiable)
  const [templates, setTemplates] = useState<Template[]>(() => {
    try {
      const raw = localStorage.getItem('customTemplates');
      if (raw) {
        const parsed = JSON.parse(raw);
        // S'assurer qu'on a toujours un tableau avec au moins un élément
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) { }
    return defaultTemplates;
  });

  const [currentTemplateIdx, setCurrentTemplateIdx] = useState(0);

  function importFullConfig(config: any) {
    if (!config || typeof config !== 'object') {
      throw new Error('Fichier invalide (JSON attendu)');
    }

    // ⚠️ API (compat: ton UI parle de apiUrl, ton publish utilise apiBase)
    const importedBase =
      (typeof config.apiBase === 'string' && config.apiBase.trim()) ||
      (typeof config.apiUrl === 'string' && config.apiUrl.trim()) ||
      '';

    if (importedBase) {
      localStorage.setItem('apiBase', importedBase);
      localStorage.setItem('apiUrl', importedBase); // compat avec ton App.tsx (check apiUrl)
    }

    if (typeof config.apiKey === 'string') {
      localStorage.setItem('apiKey', config.apiKey);
    }

    // Données principales
    if (Array.isArray(config.templates)) {
      setTemplates(config.templates);
    }

    if (Array.isArray(config.allVarsConfig)) {
      setAllVarsConfig(config.allVarsConfig);
    }

    if (Array.isArray(config.savedTags)) {
      setSavedTags(config.savedTags);
    }

    if (config.savedInstructions && typeof config.savedInstructions === 'object') {
      instructionsState.setSavedInstructions(config.savedInstructions);
    }

    if (Array.isArray(config.publishedPosts)) {
      setPublishedPosts(config.publishedPosts);
    }

    // Re-synchroniser inputs avec les variables importées (évite des champs manquants)
    if (Array.isArray(config.allVarsConfig)) {
      setInputs(prev => {
        const next: Record<string, string> = { ...prev };

        for (const v of config.allVarsConfig) {
          if (v?.name && !(v.name in next)) next[v.name] = '';
        }

        // garantir ces clés
        if (!('is_modded_game' in next)) next['is_modded_game'] = 'false';
        if (!('Mod_link' in next)) next['Mod_link'] = '';
        if (!('use_additional_links' in next)) next['use_additional_links'] = 'false';

        return next;
      });
    }

    // Bonus: relancer un check API visuel
    setApiStatus('checking');
  }

  const [linkConfigs, setLinkConfigs] = useState<{
    Game_link: LinkConfig;
    Translate_link: LinkConfig;
    Mod_link: LinkConfig;
  }>(() => {
    try {
      const raw = localStorage.getItem('linkConfigs');
      if (raw) return JSON.parse(raw);
    } catch (e) { }
    return {
      Game_link: { source: 'F95', value: '' },
      Translate_link: { source: 'Autre', value: '' },
      Mod_link: { source: 'Autre', value: '' }
    };
  });

  // Liens additionnels de traduction
  const [additionalTranslationLinks, setAdditionalTranslationLinks] = useState<AdditionalTranslationLink[]>(() => {
    try {
      const raw = localStorage.getItem('additionalTranslationLinks');
      if (raw) return JSON.parse(raw);
    } catch (e) { }
    return [];
  });

  // Sauvegarder les liens additionnels dans localStorage
  useEffect(() => {
    localStorage.setItem('additionalTranslationLinks', JSON.stringify(additionalTranslationLinks));
  }, [additionalTranslationLinks]);

  const addAdditionalTranslationLink = useCallback(() => {
    setAdditionalTranslationLinks(prev => [...prev, { label: '', link: '' }]);
  }, []);

  const updateAdditionalTranslationLink = useCallback((index: number, link: AdditionalTranslationLink) => {
    setAdditionalTranslationLinks(prev => {
      const next = [...prev];
      // Nettoyer le lien (F95/Lewd avec /post-XXXXX -> URL canonique du thread) comme pour Game_link / Translate_link / Mod_link
      const cleanedLink = cleanGameLinkUrl(link.link);
      next[index] = { ...link, link: cleanedLink };
      return next;
    });
  }, []);

  const deleteAdditionalTranslationLink = useCallback((index: number) => {
    setAdditionalTranslationLinks(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Liens additionnels mod (affichés si mod compatible)
  const [additionalModLinks, setAdditionalModLinks] = useState<AdditionalTranslationLink[]>(() => {
    try {
      const raw = localStorage.getItem('additionalModLinks');
      if (raw) return JSON.parse(raw);
    } catch (e) { }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('additionalModLinks', JSON.stringify(additionalModLinks));
  }, [additionalModLinks]);

  const addAdditionalModLink = useCallback(() => {
    setAdditionalModLinks(prev => [...prev, { label: '', link: '' }]);
  }, []);

  const updateAdditionalModLink = useCallback((index: number, link: AdditionalTranslationLink) => {
    setAdditionalModLinks(prev => {
      const next = [...prev];
      // Nettoyer le lien (F95/Lewd avec /post-XXXXX -> URL canonique du thread) comme pour les autres champs liens
      const cleanedLink = cleanGameLinkUrl(link.link);
      next[index] = { ...link, link: cleanedLink };
      return next;
    });
  }, []);

  const deleteAdditionalModLink = useCallback((index: number) => {
    setAdditionalModLinks(prev => prev.filter((_, i) => i !== index));
  }, []);

  const [allVarsConfig, setAllVarsConfig] = useState<VarConfig[]>(() => {
    try {
      const raw = localStorage.getItem('customVariables');
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) { }
    return defaultVarsConfig;
  });

  const [inputs, setInputs] = useState<Record<string, string>>(() => {
    const obj: Record<string, string> = {};
    allVarsConfig.forEach(v => obj[v.name] = '');
    // Champs non présents dans allVarsConfig mais utilisés dans le formulaire / template
    obj['instruction'] = '';
    obj['is_modded_game'] = 'false';
    obj['use_additional_links'] = 'false';
    obj['Mod_link'] = '';
    // Charger les labels personnalisés depuis localStorage, ou utiliser les valeurs par défaut
    obj['main_translation_label'] = localStorage.getItem('default_translation_label') || 'Traduction';
    obj['main_mod_label'] = localStorage.getItem('default_mod_label') || 'Mod';
    try {
      const raw = localStorage.getItem('savedInputs');
      if (raw) {
        Object.assign(obj, JSON.parse(raw));
      }
    } catch (e) { }
    return obj;
  });


  // Translation type and integration state
  const [translationType, setTranslationType] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('translationType');
      return saved || 'Automatique';
    } catch (e) { }
    return 'Automatique';
  });

  const [isIntegrated, setIsIntegrated] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('isIntegrated');
      return saved === 'true';
    } catch (e) { }
    return false;
  });

  // Error modal state
  const [errorModalData, setErrorModalData] = useState<{
    code?: string | number;
    message: string;
    context?: string;
    httpStatus?: number;
    discordError?: any;
    timestamp: number;
  } | null>(null);

  const showErrorModal = (error: { code?: string | number; message: string; context?: string; httpStatus?: number; discordError?: any }) => {
    setErrorModalData({
      ...error,
      timestamp: Date.now()
    });
  };


  const [savedTags, setSavedTags] = useState<Tag[]>(() => {
    try { const raw = localStorage.getItem('savedTags'); if (raw) return JSON.parse(raw); } catch (e) { }
    return [];
  });

  // Post fields and API configuration
  const [postTitle, setPostTitle] = useState<string>(() => {
    try { const raw = localStorage.getItem('postTitle'); return raw || ''; } catch (e) { return ''; }
  });
  const [postTags, setPostTags] = useState<string>(() => {
    try { const raw = localStorage.getItem('postTags'); return raw || ''; } catch (e) { return ''; }
  });

  // Correspondance ID Discord du tag "Type de traduction" → type de traduction du formulaire
  const TRANSLATION_TYPE_BY_TAG_DISCORD_ID: Record<string, string> = {
    '1467532357530816522': 'Manuelle',
    '1467532481963229276': 'Semi-automatique',
    '1467532186700747021': 'Automatique'
  };

  useEffect(() => {
    const selectedIds = (postTags || '').split(',').map(s => s.trim()).filter(Boolean);
    const selectedTagObjects = savedTags.filter(t =>
      selectedIds.some(id => (t.id || t.name) === id || String(t.discordTagId ?? '') === id)
    );
    for (const tag of selectedTagObjects) {
      const discordId = tag.discordTagId != null ? String(tag.discordTagId) : '';
      const mappedType = TRANSLATION_TYPE_BY_TAG_DISCORD_ID[discordId];
      if (mappedType != null) {
        setTranslationType(mappedType);
        return;
      }
    }
  }, [postTags, savedTags]);

  // API Configuration - URL is now hardcoded for local API
  // Définir l’URL de base en consultant d’abord localStorage, puis .env, et enfin un fallback Koyeb
  const [apiBaseFromSupabase, setApiBaseFromSupabase] = useState<string | null>(null);

  const defaultApiBaseRaw =
    apiBaseFromSupabase ??
    localStorage.getItem('apiBase') ??
    localStorage.getItem('apiUrl') ??
    (typeof import.meta?.env?.VITE_PUBLISHER_API_URL === 'string' ? import.meta.env.VITE_PUBLISHER_API_URL : '') ??
    'http://138.2.182.125:8080';

  const defaultApiBase = (defaultApiBaseRaw || '').replace(/\/+$/, '');

  // L’URL complète pour publier un post (sans la partie forum-post par défaut)
  const apiUrl = `${defaultApiBase}/api/forum-post`;

  const [publishInProgress, setPublishInProgress] = useState<boolean>(false);
  const [lastPublishResult, setLastPublishResult] = useState<string | null>(null);

  // Rate limit protection (cooldown de 60 secondes après une erreur 429)
  const [rateLimitCooldown, setRateLimitCooldown] = useState<number | null>(null);

  // Published posts history
  const [publishedPosts, setPublishedPosts] = useState<PublishedPost[]>(() => {
    try {
      const raw = localStorage.getItem('publishedPosts');
      if (raw) return JSON.parse(raw);
    } catch (e) { }
    return [];
  });

  // Edit mode
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostData, setEditingPostData] = useState<PublishedPost | null>(null);

  /** Override du preview : édition directe pour ce post. null = rendu live depuis le template. */

  useEffect(() => { localStorage.setItem('postTitle', postTitle); }, [postTitle]);

  useEffect(() => {
    localStorage.setItem('linkConfigs', JSON.stringify(linkConfigs));
  }, [linkConfigs]);

  // Mettre à jour les inputs avec les liens construits pour le preview
  useEffect(() => {
    setInputs(prev => ({
      ...prev,
      Game_link: buildFinalLink(linkConfigs.Game_link),
      Translate_link: buildFinalLink(linkConfigs.Translate_link),
      Mod_link: buildFinalLink(linkConfigs.Mod_link)
    }));
  }, [linkConfigs]);

  // Génération automatique du titre dynamique
  // Format : Nom du jeu [Version du jeu]
  useEffect(() => {
    const gameName = inputs['Game_name']?.trim();
    const gameVersion = inputs['Game_version']?.trim();

    let titleParts: string[] = [];

    // Nom du jeu (sans crochets si présent)
    if (gameName) {
      const cleanName = gameName.replace(/^\[(.*)\]$/, '$1');
      titleParts.push(cleanName);
    }

    // Version du jeu : [Version du jeu]
    if (gameVersion) {
      titleParts.push(`[${gameVersion}]`);
    }

    // On assemble le tout avec un espace
    const finalTitle = titleParts.join(' ');
    setPostTitle(finalTitle);

  }, [inputs['Game_name'], inputs['Game_version']]);

  // Envoyer la configuration Discord à l'API au démarrage
  useEffect(() => {
    const sendConfigToAPI = async () => {
      try {
        const configStr = localStorage.getItem('discordConfig');
        if (!configStr) return;
        const discordConfig = JSON.parse(configStr);
        if (!discordConfig.discordPublisherToken) return;
        // utilise l’URL de base dynamique
        const response = await fetch(`${defaultApiBase}/api/configure`, {
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
  }, [defaultApiBase]);

  useEffect(() => {
    localStorage.setItem('customTemplates', JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    localStorage.setItem('publishedPosts', JSON.stringify(publishedPosts));
  }, [publishedPosts]);

  // History management functions (sync Supabase si configuré)
  const addPublishedPost = async (p: PublishedPost, skipSupabase = false) => {
    setPublishedPosts(prev => [p, ...prev]);
    // Si skipSupabase=true, ne pas sauvegarder dans Supabase (déjà fait par le backend)
    if (skipSupabase) {
      return;
    }
    const sb = getSupabase();
    if (sb) {
      const row = postToRow(p);
      const res = await sb.from('published_posts').upsert(row, { onConflict: 'id' });
    }
  };

  const updatePublishedPost = async (id: string, updates: Partial<PublishedPost>) => {
    const withUpdatedAt = { ...updates, updatedAt: updates.updatedAt ?? Date.now() };

    const sb = getSupabase();
    if (!sb) {
      setPublishedPosts(prev => prev.map(post => post.id === id ? { ...post, ...withUpdatedAt } : post));
      return;
    }
    if (sb) {
      try {
        // Récupérer la version fraîche depuis Supabase
        const { data: existingRow, error: fetchError } = await sb
          .from('published_posts')
          .select('*')
          .eq('id', id)
          .single();

        if (fetchError) {
          // Fallback : chercher dans l'état local
          const existing = publishedPosts.find(p => p.id === id);
          if (!existing) {
            return;
          }
          const merged = { ...existing, ...withUpdatedAt, id } as PublishedPost;
          const row = postToRow(merged);
          await sb.from('published_posts').upsert(row, { onConflict: 'id' });

          // Mettre à jour l'état local
          setPublishedPosts(prev => prev.map(p => p.id === id ? merged : p));
          return;
        }

        // Fusionner avec les données fraîches de Supabase
        const existingPost = rowToPost(existingRow);
        const merged = { ...existingPost, ...withUpdatedAt, id } as PublishedPost;

        // Upsert dans Supabase
        const row = postToRow(merged);
        await sb.from('published_posts').upsert(row, { onConflict: 'id' });

        // Mettre à jour l'état local
        setPublishedPosts(prev => prev.map(p => p.id === id ? merged : p));

      } catch {
        // Fallback : mise à jour locale uniquement
        setPublishedPosts(prev => prev.map(post => post.id === id ? { ...post, ...withUpdatedAt } : post));
      }
    } else {
      // Pas de Supabase : mise à jour locale uniquement
      setPublishedPosts(prev => prev.map(post => post.id === id ? { ...post, ...withUpdatedAt } : post));
    }
  };

  const deletePublishedPost = (id: string) => {
    setPublishedPosts(prev => prev.filter(post => post.id !== id));
    const sb = getSupabase();
    if (sb) sb.from('published_posts').delete().eq('id', id);
  };

  async function clearAllAppData(ownerId?: string): Promise<{ ok: boolean; error?: string }> {
    const sb = getSupabase();
    try {
      if (sb) {
        const { data: postRows } = await sb.from('published_posts').select('id');
        const postIds = (postRows ?? []).map((r: { id: string }) => r.id);
        if (postIds.length > 0) {
          await sb.from('published_posts').delete().in('id', postIds);
        }
        const { data: tagRows } = await sb.from('tags').select('id');
        const tagIds = (tagRows ?? []).map((r: { id: string }) => r.id);
        if (tagIds.length > 0) {
          await sb.from('tags').delete().in('id', tagIds);
        }
        const { data: configRows } = await sb.from('app_config').select('key');
        const configKeys = (configRows ?? []).map((r: { key: string }) => r.key);
        if (configKeys.length > 0) {
          await sb.from('app_config').delete().in('key', configKeys);
        }
        if (ownerId) {
          await sb.from('allowed_editors').delete().eq('owner_id', ownerId);
          await sb.from('saved_instructions').delete().eq('owner_id', ownerId);
          await sb.from('saved_templates').delete().eq('owner_id', ownerId);
        }
      }
      setPublishedPosts([]);
      instructionsState.setSavedInstructions({});
      instructionsState.setInstructionOwners({});
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  }

  // Helper : parse les champs jsonb renvoyés par Supabase (parfois en string)
  function parseJsonb<T>(val: unknown): T | undefined {
    if (val == null) return undefined;
    if (typeof val === 'string') {
      try {
        return JSON.parse(val) as T;
      } catch {
        return undefined;
      }
    }
    return val as T;
  }

  // Mappers PublishedPost <-> Supabase row (table published_posts = source de vérité pour bot server 1)
  function postToRow(p: PublishedPost) {
    const createdTs = p.createdAt ?? p.timestamp;
    const updatedTs = p.updatedAt ?? p.timestamp;
    return {
      id: p.id,
      title: p.title ?? '',
      content: p.content ?? '',
      tags: p.tags ?? '',
      image_path: p.imagePath ?? null,
      translation_type: p.translationType ?? null,
      is_integrated: p.isIntegrated ?? false,
      thread_id: p.threadId ?? '',
      message_id: p.messageId ?? '',
      discord_url: p.discordUrl ?? '',
      forum_id: Number(p.forumId) || 0,
      author_discord_id: p.authorDiscordId ?? null,
      saved_inputs: p.savedInputs ?? null,
      saved_link_configs: p.savedLinkConfigs ?? null,
      saved_additional_translation_links: Array.isArray(p.savedAdditionalTranslationLinks) ? p.savedAdditionalTranslationLinks : (p.savedAdditionalTranslationLinks ?? null),
      saved_additional_mod_links: Array.isArray(p.savedAdditionalModLinks) ? p.savedAdditionalModLinks : (p.savedAdditionalModLinks ?? null),
      is_archived: p.archived ?? false,
      template_id: p.templateId ?? null,
      created_at: new Date(createdTs).toISOString(),
      updated_at: new Date(updatedTs).toISOString()
    };
  }
  // 🆕 Modifier rowToPost pour récupérer template_id
  function rowToPost(r: Record<string, unknown>): PublishedPost {
    const createdStr = r.created_at as string;
    const updatedStr = r.updated_at as string;
    const createdAt = createdStr ? new Date(createdStr).getTime() : Date.now();
    const updatedAt = updatedStr ? new Date(updatedStr).getTime() : createdAt;
    const ts = updatedAt;
    const savedInputs = parseJsonb<Record<string, string>>(r.saved_inputs);
    const savedLinkConfigs = parseJsonb<PublishedPost['savedLinkConfigs']>(r.saved_link_configs);
    const savedAdditionalTranslationLinks = parseJsonb<AdditionalTranslationLink[]>(r.saved_additional_translation_links);
    const savedAdditionalModLinks = parseJsonb<AdditionalTranslationLink[]>(r.saved_additional_mod_links);
    return {
      id: String(r.id),
      timestamp: ts,
      createdAt,
      updatedAt,
      title: String(r.title ?? ''),
      content: String(r.content ?? ''),
      tags: String(r.tags ?? ''),
      imagePath: r.image_path != null ? String(r.image_path) : undefined,
      translationType: r.translation_type != null ? String(r.translation_type) : undefined,
      isIntegrated: Boolean(r.is_integrated),
      threadId: String(r.thread_id ?? ''),
      messageId: String(r.message_id ?? ''),
      discordUrl: String(r.discord_url ?? ''),
      forumId: Number(r.forum_id) || 0,
      savedInputs: savedInputs ?? undefined,
      savedLinkConfigs: savedLinkConfigs ?? undefined,
      savedAdditionalTranslationLinks: Array.isArray(savedAdditionalTranslationLinks) ? savedAdditionalTranslationLinks : undefined,
      savedAdditionalModLinks: Array.isArray(savedAdditionalModLinks) ? savedAdditionalModLinks : undefined,
      authorDiscordId: r.author_discord_id != null ? String(r.author_discord_id) : undefined,
      archived: Boolean(r.is_archived),
      templateId: r.template_id != null ? String(r.template_id) : undefined
    };
  }

  // Récupérer l'historique : d'abord Supabase, puis API en backup
  async function fetchHistoryFromAPI() {
    console.log('[Historique] Début chargement…');
    const sb = getSupabase();
    if (sb) {
      try {
        const { data: rows, error } = await sb
          .from('published_posts')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(1000);
        if (error) {
          console.warn('[Historique] Supabase erreur:', error.message, error.code);
        } else if (Array.isArray(rows) && rows.length > 0) {
          setPublishedPosts(rows.map(rowToPost));
          console.log('[Historique] Supabase OK:', rows.length, 'publication(s)');
          return;
        } else {
          console.log('[Historique] Supabase OK mais 0 publication, passage à l\'API si configurée');
        }
      } catch (e) {
        console.warn('[Historique] Supabase exception:', e);
      }
    } else {
      console.log('[Historique] Supabase non configuré, tentative API');
    }
    try {
      const baseUrl = localStorage.getItem('apiBase') || defaultApiBase;
      const apiKey = localStorage.getItem('apiKey') || '';
      if (!baseUrl || !apiKey) {
        console.log('[Historique] API non configurée (apiBase ou apiKey manquant)');
        return;
      }
      const endpoint = `${baseUrl}/api/history`;
      const response = await apiFetch(endpoint, apiKey, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        console.warn('[Historique] API HTTP', response.status, response.statusText);
        return;
      }
      const data = await response.json();
      if (Array.isArray(data.posts) || Array.isArray(data)) {
        const apiPosts = Array.isArray(data.posts) ? data.posts : data;
        const localPosts = publishedPosts;
        const newPostsFromApi = apiPosts.filter((p: any) => {
          const apiThreadId = p.thread_id || p.threadId;
          const apiMessageId = p.message_id || p.messageId;
          return !localPosts.some(local =>
            (local.threadId === apiThreadId && local.messageId === apiMessageId) ||
            local.id === p.id
          );
        });
        if (newPostsFromApi.length > 0) {
          const mapped = newPostsFromApi.map((p: Record<string, unknown>) => {
            const row = {
              ...p,
              id: p.id ?? `post_${p.timestamp ?? Date.now()}_api`,
              thread_id: p.thread_id ?? p.threadId ?? '',
              message_id: p.message_id ?? p.messageId ?? '',
              discord_url: p.discord_url ?? p.thread_url ?? '',
              forum_id: p.forum_id ?? p.forumId ?? 0
            };
            return rowToPost(row);
          });
          setPublishedPosts(prev => {
            const merged = [...mapped, ...prev].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            return merged;
          });
          console.log('[Historique] API OK:', newPostsFromApi.length, 'nouvelle(s) publication(s)');
        } else {
          console.log('[Historique] API OK mais aucune nouvelle publication');
        }
      }
    } catch (e) {
      console.warn('[Historique] API exception:', e);
    }
  }

  async function publishPost(authorDiscordId?: string, options?: { silentUpdate?: boolean }) {
    const title = (postTitle || '').trim();
    const content = previewEngine.preview || '';
    const templateType = (templates[currentTemplateIdx]?.type) || '';
    const templateId = templates[currentTemplateIdx]?.id || null;
    const isEditMode = editingPostId !== null && editingPostData !== null;

    // Résoudre les tags sélectionnés (UUID ou IDs Discord) vers les IDs Discord pour l'API et le stockage
    const selectedIds = (postTags || '').split(',').map(s => s.trim()).filter(Boolean);
    const tagsToSend = selectedIds
      .map(id => {
        const tag = savedTags.find(t => (t.id || t.name) === id || String(t.discordTagId ?? '') === id);
        if (tag?.discordTagId) return String(tag.discordTagId);
        return tag?.name ?? id; // fallback : nom pour résolution côté backend
      })
      .filter(Boolean)
      .join(',');

    const selectedTagObjects = savedTags.filter(t =>
      selectedIds.some(id => (t.id || t.name) === id || String(t.discordTagId ?? '') === id)
    );
    const translatorLabel = selectedTagObjects.filter(t => t.tagType === 'translator').map(t => t.name).join(', ');
    const stateLabel = selectedTagObjects.filter(t => t.tagType !== 'translator').map(t => t.name).join(', ');

    const storedApiUrl = localStorage.getItem('apiUrl');
    const baseUrlRaw = localStorage.getItem('apiBase') || defaultApiBase;
    const baseUrl = baseUrlRaw.replace(/\/+$/, '');

    const apiEndpoint = isEditMode
      ? `${baseUrl}/api/forum-post/update`
      : `${baseUrl}/api/forum-post`;

    // Validations (inchangées)
    if (!title || title.length === 0) {
      setLastPublishResult('❌ Titre obligatoire');
      showErrorModal({
        code: 'VALIDATION_ERROR',
        message: 'Le titre du post est obligatoire',
        context: 'Validation avant publication',
        httpStatus: 400
      });
      return { ok: false, error: 'missing_title' };
    }

    if (!baseUrl || baseUrl.trim().length === 0) {
      setLastPublishResult('❌ URL API manquante dans Configuration');
      showErrorModal({
        code: 'CONFIG_ERROR',
        message: 'URL de l\'API manquante',
        context: 'Veuillez configurer l\'URL de l\'API dans Configuration',
        httpStatus: 500
      });
      return { ok: false, error: 'missing_api_url' };
    }

    if (templateType !== 'my') {
      setLastPublishResult('❌ Seul le template "Mes traductions" (my) peut être publié');
      showErrorModal({
        code: 'VALIDATION_ERROR',
        message: 'Type de template invalide',
        context: 'Seul le template "Mes traductions" (my) peut être publié',
        httpStatus: 400
      });
      return { ok: false, error: 'invalid_template_type' };
    }

    if (rateLimitCooldown !== null && Date.now() < rateLimitCooldown) {
      const remainingSeconds = Math.ceil((rateLimitCooldown - Date.now()) / 1000);
      setLastPublishResult(`⏳ Rate limit actif. Attendez ${remainingSeconds} secondes.`);
      showErrorModal({
        code: 'RATE_LIMIT_COOLDOWN',
        message: `Rate limit actif`,
        context: `Veuillez attendre ${remainingSeconds} secondes avant de réessayer pour éviter un bannissement IP.`,
        httpStatus: 429
      });
      return { ok: false, error: 'rate_limit_cooldown' };
    }

    // Tags obligatoires : au moins un Site, un Type de traduction et un Traducteur (Autres et Statut optionnels)
    const hasSite = selectedTagObjects.some(t => t.tagType === 'sites');
    const hasTranslationType = selectedTagObjects.some(t => t.tagType === 'translationType');
    const hasTranslator = selectedTagObjects.some(t => t.tagType === 'translator');
    const missing: string[] = [];
    if (!hasSite) missing.push('Site');
    if (!hasTranslationType) missing.push('Type de traduction');
    if (!hasTranslator) missing.push('Traducteur');
    if (missing.length > 0) {
      setLastPublishResult(`❌ Tags obligatoires manquants : ${missing.join(', ')}`);
      showErrorModal({
        code: 'VALIDATION_ERROR',
        message: 'Tags obligatoires manquants',
        context: `Vous devez sélectionner au moins un tag pour chaque catégorie : Site, Type de traduction et Traducteur. Manquant : ${missing.join(', ')}. Les tags "Autres" et "Statut du jeu" restent optionnels.`,
        httpStatus: 400
      });
      return { ok: false, error: 'missing_required_tags' };
    }

    setPublishInProgress(true);
    setLastPublishResult(null);

    try {
      // ✅ NOUVEAU : Créer l'objet de métadonnées structurées
      const metadata = {
        game_name: inputs['Game_name'] || '',
        game_version: inputs['Game_version'] || '',
        translate_version: inputs['Translate_version'] || '',
        translation_type: translationType || '',
        is_integrated: isIntegrated,
        etat: tagsToSend || '',
        timestamp: Date.now()
      };


      // Ajouter le lien d'image à la fin du contenu si une image est présente.
      // Le backend détectera ce lien, créera un embed avec l'image, puis retirera le lien du contenu.
      // Ainsi l'image sera visible via l'embed sans que le lien soit affiché.
      // ✅ CORRECTIF : Ajouter l'URL de l'image au contenu
      let finalContent = content;
      if (imagesState.uploadedImages.length > 0) {
        const mainImage = imagesState.uploadedImages.find(img => img.isMain) || imagesState.uploadedImages[0];

        if (mainImage.url) {
          // Ajouter l'URL à la fin du contenu (le backend Python la détectera et créera l'embed)
          finalContent = content + '\n' + mainImage.url;
        }
      }

      const formData = new FormData();
      formData.append('title', title);
      formData.append('content', finalContent); // Utiliser finalContent avec le lien masqué
      formData.append('tags', tagsToSend);
      formData.append('template', templateType);

      // Métadonnées encodées en base64 (UTF-8)
      formData.append('metadata', b64EncodeUtf8(JSON.stringify(metadata)));

      // Champs pour l'annonce (nouvelle traduction / mise à jour) dans le publisher
      formData.append('translator_label', translatorLabel);
      formData.append('state_label', stateLabel);
      formData.append('game_version', inputs['Game_version'] || '');
      formData.append('translate_version', inputs['Translate_version'] || '');
      const mainImageForAnnounce = imagesState.uploadedImages.find(i => i.isMain) || imagesState.uploadedImages[0];
      const announceImageUrl = mainImageForAnnounce?.url && (mainImageForAnnounce.url.startsWith('http://') || mainImageForAnnounce.url.startsWith('https://'))
        ? mainImageForAnnounce.url
        : '';
      formData.append('announce_image_url', announceImageUrl);

      if (isEditMode && editingPostData) {
        formData.append('threadId', editingPostData.threadId);
        formData.append('messageId', editingPostData.messageId);
        formData.append('thread_url', editingPostData.discordUrl || '');
        formData.append('isUpdate', 'true');
        if (options?.silentUpdate) {
          formData.append('silent_update', 'true');
        }
      }

      // Payload complet pour l'historique (aligné Supabase) : tous les champs
      const now = Date.now();
      const postId = `post_${now}_${Math.random().toString(36).substr(2, 9)}`;
      const imagePathVal = imagesState.uploadedImages.find(i => i.isMain)?.url;
      if (isEditMode && editingPostData) {
        const mergedForHistory: PublishedPost = {
          ...editingPostData,
          id: editingPostData.id,
          timestamp: now,
          updatedAt: now,
          title,
          content: finalContent,
          tags: tagsToSend,
          imagePath: imagePathVal,
          translationType,
          isIntegrated,
          savedInputs: { ...inputs },
          savedLinkConfigs: JSON.parse(JSON.stringify(linkConfigs)),
          savedAdditionalTranslationLinks: JSON.parse(JSON.stringify(additionalTranslationLinks)),
          savedAdditionalModLinks: JSON.parse(JSON.stringify(additionalModLinks)),
          threadId: editingPostData.threadId,
          messageId: editingPostData.messageId,
          discordUrl: editingPostData.discordUrl || '',
          forumId: editingPostData.forumId ?? 0,
          templateId: templateId ?? editingPostData.templateId ?? undefined
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
          translationType,
          isIntegrated,
          savedInputs: { ...inputs },
          savedLinkConfigs: JSON.parse(JSON.stringify(linkConfigs)),
          savedAdditionalTranslationLinks: JSON.parse(JSON.stringify(additionalTranslationLinks)),
          savedAdditionalModLinks: JSON.parse(JSON.stringify(additionalModLinks)),
          threadId: '',
          messageId: '',
          discordUrl: '',
          forumId: 0,
          authorDiscordId: authorDiscordId ?? undefined,
          templateId: templateId ?? undefined
        };
        formData.append('history_payload', JSON.stringify(postToRow(newPostForHistory)));
      }

      // Plus besoin d'envoyer les images comme attachments, elles sont dans le contenu

      const apiKey = localStorage.getItem('apiKey') || '';

      const headers = await createApiHeaders(apiKey);
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers,
        body: formData
      });

      const res = await response.json();

      // Gestion des erreurs (code existant inchangé)
      if (!response.ok) {
        if (response.status === 429) {
          const cooldownEnd = Date.now() + 60000;
          setRateLimitCooldown(cooldownEnd);
          setLastPublishResult('❌ Rate limit Discord (429). Cooldown de 60 secondes activé.');
          showErrorModal({
            code: 'RATE_LIMIT_429',
            message: 'Rate limit Discord atteint',
            context: 'Discord a limité les requêtes. Le bouton de publication sera désactivé pendant 60 secondes pour éviter un bannissement IP.',
            httpStatus: 429,
            discordError: res
          });
          setTimeout(() => {
            setRateLimitCooldown(null);
            setLastPublishResult(null);
          }, 60000);
          return { ok: false, error: 'rate_limit_429' };
        }

        setLastPublishResult('Erreur API: ' + (res.error || 'unknown'));
        const isNetworkError = !response.status || response.status === 0;
        showErrorModal({
          code: res.error || 'API_ERROR',
          message: isNetworkError
            ? 'L\'API n\'est pas accessible. Vérifiez l\'URL de l\'API.'
            : (res.error || 'Erreur inconnue'),
          context: isEditMode ? 'Mise à jour du post Discord' : 'Publication du post Discord',
          httpStatus: response.status || 0,
          discordError: res
        });
        return { ok: false, error: res.error };
      }

      if (rateLimitCooldown !== null) {
        setRateLimitCooldown(null);
      }

      let successMsg = isEditMode ? 'Mise à jour réussie' : 'Publication réussie';
      setLastPublishResult(successMsg);

      const threadId = res.thread_id || res.threadId;
      const messageId = res.message_id || res.messageId;
      const threadUrl = res.thread_url || res.threadUrl || res.url || res.discordUrl || '';
      const forumId = res.forum_id || res.forumId || 0;

      if (threadId && messageId) {
        if (isEditMode && editingPostId && editingPostData) {
          const now = Date.now();

          const updatedPost: PublishedPost = {
            ...editingPostData,
            id: editingPostId,
            timestamp: now,
            createdAt: editingPostData.createdAt ?? now,
            updatedAt: now,
            title,
            content,
            tags: tagsToSend,
            imagePath: imagesState.uploadedImages.find(i => i.isMain)?.url,
            translationType,
            isIntegrated,
            savedInputs: { ...inputs },
            savedLinkConfigs: JSON.parse(JSON.stringify(linkConfigs)),
            savedAdditionalTranslationLinks: JSON.parse(JSON.stringify(additionalTranslationLinks)),
            savedAdditionalModLinks: JSON.parse(JSON.stringify(additionalModLinks)),
            threadId: String(threadId),
            messageId: String(messageId),
            discordUrl: threadUrl || editingPostData.discordUrl,
            forumId: typeof forumId === 'number' ? forumId : parseInt(String(forumId)) || 0,
            authorDiscordId: editingPostData.authorDiscordId
          };

          await updatePublishedPost(editingPostId, updatedPost);
          tauriAPI.saveLocalHistoryPost(postToRow(updatedPost), updatedPost.authorDiscordId);
          setEditingPostId(null);
          setEditingPostData(null);
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
            translationType,
            isIntegrated,
            savedInputs: { ...inputs },
            savedLinkConfigs: JSON.parse(JSON.stringify(linkConfigs)),
            savedAdditionalTranslationLinks: JSON.parse(JSON.stringify(additionalTranslationLinks)),
            savedAdditionalModLinks: JSON.parse(JSON.stringify(additionalModLinks)),
            threadId: String(threadId),
            messageId: String(messageId),
            discordUrl: threadUrl,
            forumId: typeof forumId === 'number' ? forumId : parseInt(String(forumId)) || 0,
            authorDiscordId: authorDiscordId ?? undefined
          };
          await addPublishedPost(newPost, true);
          tauriAPI.saveLocalHistoryPost(postToRow(newPost), newPost.authorDiscordId);
        }
      }

      return { ok: true, data: res };
    } catch (e: any) {
      setLastPublishResult('Erreur envoi: ' + String(e?.message || e));
      showErrorModal({
        code: 'NETWORK_ERROR',
        message: String(e?.message || e),
        context: 'Exception lors de la publication',
        httpStatus: 0
      });
      return { ok: false, error: String(e?.message || e) };
    } finally {
      setPublishInProgress(false);
    }
  }

  useEffect(() => {
    // Migration: nettoyer les anciennes variables avant de sauvegarder
    const cleanedVars = allVarsConfig.filter(v =>
      v.name !== 'Traductor' &&
      v.name !== 'Developpeur' &&
      v.name !== 'install_instructions'
    );
    localStorage.setItem('customVariables', JSON.stringify(cleanedVars));
  }, [allVarsConfig]);

  useEffect(() => {
    localStorage.setItem('savedTags', JSON.stringify(savedTags));
  }, [savedTags]);

  // Charger la config globale (URL API) depuis Supabase au montage
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.from('app_config')
      .select('value')
      .eq('key', 'api_base_url')
      .maybeSingle()
      .then((res: { data?: { value: string } | null; error?: unknown }) => {
        if (res.error || !res.data?.value?.trim()) return;
        const url = res.data.value.trim().replace(/\/+$/, '');
        setApiBaseFromSupabase(url);
        localStorage.setItem('apiBase', url);
        localStorage.setItem('apiUrl', url);
      });
  }, []);

  // Charger les tags depuis Supabase une fois la session prête (évite la race : requête avant JWT → RLS vide → anciens tags localStorage)
  useEffect(() => {
    if (!user) return;
    const sb = getSupabase();
    if (!sb) return;
    sb.from('tags')
      .select('id, name, tag_type, author_discord_id, discord_tag_id')
      .order('created_at', { ascending: true })
      .then((res) => {
        if (res.error || !res.data?.length) return;
        setSavedTags(
          (res.data as Array<{ id: string; name: string; tag_type: string; author_discord_id: string | null; discord_tag_id: string | null }>).map((r) => ({
            id: r.id,
            name: r.name,
            tagType: (r.tag_type as TagType) || 'other',
            authorDiscordId: r.author_discord_id ?? undefined,
            discordTagId: r.discord_tag_id ?? undefined
          }))
        );
      });
  }, [user?.id]);

  // Charger instructions (par propriétaire ; visible par l'auteur + éditeurs autorisés) et templates (par utilisateur connecté)
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      const userId = session?.user?.id;

      // Instructions : saved_instructions (RLS = propre + autorisations allowed_editors)
      const resInstr = await sb.from('saved_instructions').select('owner_id, value');
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
          resInstr.data as Array<{ owner_id: string; value: Record<string, string> | string }>,
          localInstructions,
          localOwners
        );
        instructionsState.setSavedInstructions(merged);
        instructionsState.setInstructionOwners(owners);
      }

      // Templates : saved_templates (propre à l'utilisateur connecté, un row par owner)
      if (userId) {
        const resTpl = await sb.from('saved_templates').select('value').eq('owner_id', userId).maybeSingle();
        if (!resTpl.error && resTpl.data?.value) {
          try {
            const parsed = (Array.isArray(resTpl.data.value) ? resTpl.data.value : JSON.parse(String(resTpl.data.value))) as Template[];
            if (Array.isArray(parsed) && parsed.length > 0) setTemplates(parsed);
          } catch (_e) {
            /* ignorer */
          }
        }
      }
    })();
  }, []);

  // Realtime : synchronisation en direct des tags, app_config, published_posts
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;

    const channel = sb
      .channel('discord-publisher-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tags' },
        (payload) => {
          const mapRow = (r: { id: string; name: string; tag_type: string; author_discord_id?: string | null; discord_tag_id?: string | null }) => ({
            id: r.id,
            name: r.name,
            tagType: (r.tag_type as TagType) || 'other',
            authorDiscordId: r.author_discord_id ?? undefined,
            discordTagId: r.discord_tag_id ?? undefined
          });
          if (payload.eventType === 'INSERT') {
            const r = payload.new as { id: string; name: string; tag_type: string; author_discord_id?: string | null; discord_tag_id?: string | null };
            const row = mapRow(r);
            setSavedTags(prev => (prev.some(t => t.id === row.id) ? prev : [...prev, row]));
          } else if (payload.eventType === 'UPDATE') {
            const r = payload.new as { id: string; name: string; tag_type: string; author_discord_id?: string | null; discord_tag_id?: string | null };
            setSavedTags(prev => prev.map(t => t.id === r.id ? mapRow(r) : t));
          } else if (payload.eventType === 'DELETE') {
            const r = payload.old as { id: string };
            setSavedTags(prev => prev.filter(t => t.id !== r.id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'saved_instructions' },
        () => {
          // Refetch et fusion : comme plusieurs lignes (par owner) sont fusionnées, on recharge tout (RLS filtre côté serveur).
          getSupabase()
            ?.from('saved_instructions')
            .select('owner_id, value')
            .then((res) => {
              if (res.error || !res.data?.length) return;
              // Lire les instructions locales depuis localStorage pour fusion
              let localInstructions: Record<string, string> = {};
              let localOwners: Record<string, string> = {};
              try {
                const rawInstr = localStorage.getItem('savedInstructions');
                const rawOwners = localStorage.getItem('instructionOwners');
                if (rawInstr) localInstructions = JSON.parse(rawInstr);
                if (rawOwners) localOwners = JSON.parse(rawOwners);
              } catch (_e) { /* ignorer */ }

              // Fusion intelligente : garder les locales sans owner, supprimer les révoquées, ajouter les Supabase
              const { merged, owners } = mergeInstructionsFromSupabase(
                res.data as Array<{ owner_id: string; value: Record<string, string> | string }>,
                localInstructions,
                localOwners
              );
              // Ne pas déclencher de re-render si les données sont identiques (évite les "switches")
              const instrEq = (a: Record<string, string>, b: Record<string, string>) =>
                Object.keys(a).length === Object.keys(b).length &&
                Object.keys(a).every(k => b[k] === a[k]);
              instructionsState.setSavedInstructions(prev => instrEq(prev, merged) ? prev : merged);
              instructionsState.setInstructionOwners(prev => instrEq(prev, owners) ? prev : owners);
            });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'saved_templates' },
        () => {
          // Realtime : refetch les templates de l'utilisateur connecté (RLS = propre à l'utilisateur)
          getSupabase()
            ?.auth.getSession()
            .then(({ data: { session } }) => {
              if (!session?.user?.id) return null;
              return getSupabase()
                ?.from('saved_templates')
                .select('value')
                .eq('owner_id', session.user.id)
                .maybeSingle();
            })
            .then((res) => {
              if (!res?.data?.value || res.error) return;
              const value = res.data.value;
              try {
                const parsed = (Array.isArray(value) ? value : JSON.parse(String(value))) as Template[];
                if (Array.isArray(parsed) && parsed.length > 0) setTemplates(parsed);
              } catch (_e) { /* ignorer */ }
            });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_config' },
        (payload) => {
          const r = (payload.eventType === 'DELETE' ? payload.old : payload.new) as { key: string; value: string };
          if (r?.key === 'api_base_url' && r?.value?.trim()) {
            const url = r.value.trim().replace(/\/+$/, '');
            setApiBaseFromSupabase(url);
            localStorage.setItem('apiBase', url);
            localStorage.setItem('apiUrl', url);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'published_posts' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPublishedPosts(prev => [rowToPost(payload.new as Record<string, unknown>), ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setPublishedPosts(prev => prev.map(p => p.id === (payload.new as { id: string }).id ? rowToPost(payload.new as Record<string, unknown>) : p));
          } else if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id: string }).id;
            setPublishedPosts(prev => prev.filter(p => p.id !== id));
          }
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('savedInputs', JSON.stringify(inputs));
  }, [inputs]);

  useEffect(() => {
    localStorage.setItem('translationType', translationType);
  }, [translationType]);

  useEffect(() => {
    localStorage.setItem('isIntegrated', String(isIntegrated));
  }, [isIntegrated]);


  useEffect(() => {
    localStorage.setItem('imagesState.uploadedImages', JSON.stringify(imagesState.uploadedImages));
  }, [imagesState.uploadedImages]);

  function updateTemplate(idx: number, t: Template) {
    setTemplates(prev => {
      const copy = [...prev];
      const previous = copy[idx];
      // Une fois modifié par l'utilisateur, le template n'est plus "par défaut" (il peut être synchro en BDD)
      const newT = previous?.isDefault ? { ...t, isDefault: false } : t;
      copy[idx] = newT;
      return copy;
    });
  }
  function restoreDefaultTemplates() {
    setTemplates(defaultTemplates);
    // Sauvegarder dans localStorage
    try {
      localStorage.setItem('customTemplates', JSON.stringify(defaultTemplates));
    } catch {
      // Erreur silencieuse
    }
    // Sync immédiate vers Supabase (réel direct) dès que les templates sont restaurés
    syncTemplatesToSupabase(defaultTemplates).catch(() => { });
  }

  function addVarConfig(v: VarConfig) {
    // Empêcher l'ajout des variables obsolètes
    if (v.name === 'Traductor' || v.name === 'Developpeur' || v.name === 'install_instructions') {
      return;
    }
    setAllVarsConfig(prev => [...prev, { ...v, isCustom: true }]);
  }
  function updateVarConfig(idx: number, v: VarConfig) {
    setAllVarsConfig(prev => { const copy = [...prev]; copy[idx] = { ...v, isCustom: copy[idx].isCustom }; return copy; });
  }
  function deleteVarConfig(idx: number) {
    const varName = allVarsConfig[idx]?.name;
    setAllVarsConfig(prev => { const copy = [...prev]; copy.splice(idx, 1); return copy; });
    // Nettoyer l'input associé
    if (varName) {
      setInputs(prev => { const copy = { ...prev }; delete copy[varName]; return copy; });
    }
  }

  function cleanGameLink(url: string): string {
    return cleanGameLinkUrl(url);
  }

  function setInput(name: string, value: string) {
    let finalValue = value;

    // Auto-nettoyage des liens (Game_link, Translate_link, Mod_link)
    if (name === 'Game_link' || name === 'Translate_link' || name === 'Mod_link') {
      finalValue = cleanGameLink(value);
    }

    setInputs(prev => ({ ...prev, [name]: finalValue }));
  }

  /** Extrait l'ID numérique d'une URL F95/Lewd (pour API ou affichage court). */
  function extractIdFromUrl(url: string, source: 'F95' | 'Lewd'): string {
    if (!url || !url.trim()) return '';
    const trimmed = url.trim();
    if (source === 'F95') {
      const m = trimmed.match(/f95zone\.to\/threads\/(?:[^/]*\.)?(\d+)/);
      return m ? m[1] : trimmed;
    }
    if (source === 'Lewd') {
      const m = trimmed.match(/lewdcorner\.com\/threads\/(?:[^/]*\.)?(\d+)/);
      return m ? m[1] : trimmed;
    }
    return trimmed;
  }

  function buildFinalLink(config: LinkConfig): string {
    const v = config.value.trim();
    if (!v) return '';

    const isOtherFullUrl = v.toLowerCase().startsWith('http') &&
      !v.toLowerCase().includes('f95zone.to') &&
      !v.toLowerCase().includes('lewdcorner.com');
    if (isOtherFullUrl) return v;

    // F95/Lewd : si value est déjà une URL complète, la retourner (déjà nettoyée) ; sinon legacy (juste l'ID)
    if (config.source === 'F95' && v.toLowerCase().includes('f95zone.to')) return cleanGameLinkUrl(v);
    if (config.source === 'Lewd' && v.toLowerCase().includes('lewdcorner.com')) return cleanGameLinkUrl(v);
    if (config.source === 'F95') return `https://f95zone.to/threads/${v}/`;
    if (config.source === 'Lewd') return `https://lewdcorner.com/threads/${v}/`;
    return v;
  }

  function setLinkConfig(linkName: 'Game_link' | 'Translate_link' | 'Mod_link', source: 'F95' | 'Lewd' | 'Autre', value: string) {
    setLinkConfigs(prev => {
      let processedValue = value;
      if ((source === 'F95' || source === 'Lewd') && value.trim().toLowerCase().includes('threads/')) {
        processedValue = cleanGameLinkUrl(value);
      }
      return { ...prev, [linkName]: { source, value: processedValue } };
    });
  }

  function addSavedTag(t: Tag) {
    const sb = getSupabase();
    if (sb) {
      sb.from('tags')
        .insert({
          name: t.name || '',
          tag_type: t.tagType || 'other',
          author_discord_id: t.authorDiscordId ?? null,
          discord_tag_id: t.discordTagId ?? null
        })
        .select('id')
        .single()
        .then((res) => {
          if (!res.error && res.data)
            setSavedTags(prev => [...prev, { ...t, id: (res.data as { id: string }).id }]);
          else
            setSavedTags(prev => [...prev, t]);
        });
    } else {
      setSavedTags(prev => [...prev, t]);
    }
  }
  function updateSavedTag(id: string, updates: Partial<Tag>) {
    setSavedTags(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    const sb = getSupabase();
    if (sb) {
      const row: Record<string, unknown> = {};
      if (updates.name !== undefined) row.name = updates.name;
      if (updates.tagType !== undefined) row.tag_type = updates.tagType;
      if (updates.authorDiscordId !== undefined) row.author_discord_id = updates.authorDiscordId ?? null;
      if (updates.discordTagId !== undefined) row.discord_tag_id = updates.discordTagId ?? null;
      if (Object.keys(row).length > 0) {
        sb.from('tags').update(row).eq('id', id);
      }
    }
  }

  function deleteSavedTag(idx: number) {
    const tag = savedTags[idx];
    const sb = getSupabase();
    if (sb && tag?.id) {
      sb.from('tags')
        .delete()
        .eq('id', tag.id)
        .then(() => setSavedTags(prev => { const copy = [...prev]; copy.splice(idx, 1); return copy; }));
    } else {
      setSavedTags(prev => { const copy = [...prev]; copy.splice(idx, 1); return copy; });
    }
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  async function syncTagsToSupabase(authorDiscordId?: string): Promise<{ ok: boolean; count?: number; error?: string }> {
    const sb = getSupabase();
    if (!sb) return { ok: false, error: 'Supabase non configuré' };
    if (savedTags.length === 0) return { ok: true, count: 0 };
    try {
      const updated: Tag[] = [];
      const author = authorDiscordId ?? undefined;
      for (const t of savedTags) {
        const hasValidUuid = t.id && UUID_REGEX.test(t.id);
        const row = {
          name: t.name || '',
          tag_type: t.tagType || 'other',
          author_discord_id: t.authorDiscordId ?? author ?? null,
          discord_tag_id: t.discordTagId ?? null
        };
        if (hasValidUuid) {
          const { error } = await sb
            .from('tags')
            .upsert({ id: t.id, ...row }, { onConflict: 'id' });
          if (error) throw new Error((error as { message?: string })?.message ?? 'Upsert tag failed');
          updated.push(t);
        } else {
          const { data, error } = await sb
            .from('tags')
            .insert(row)
            .select('id')
            .single();
          if (error) throw new Error((error as { message?: string })?.message ?? 'Insert tag failed');
          updated.push({ ...t, id: (data as { id: string }).id, authorDiscordId: t.authorDiscordId ?? author, discordTagId: t.discordTagId });
        }
      }
      setSavedTags(updated);
      return { ok: true, count: savedTags.length };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  async function fetchTagsFromSupabase(): Promise<void> {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb
      .from('tags')
      .select('id, name, tag_type, author_discord_id, discord_tag_id')
      .order('created_at', { ascending: true });
    if (error || !data?.length) return;
    setSavedTags(
      (data as Array<{ id: string; name: string; tag_type: string; author_discord_id: string | null; discord_tag_id: string | null }>).map((r) => ({
        id: r.id,
        name: r.name,
        tagType: (r.tag_type as TagType) || 'other',
        authorDiscordId: r.author_discord_id ?? undefined,
        discordTagId: r.discord_tag_id ?? undefined
      }))
    );
  }

  // Instructions : sync direct vers Supabase (comme les tags), contrôle par autorisation RLS

  async function syncTemplatesToSupabase(templatesToSync?: Template[]): Promise<{ ok: boolean; error?: string }> {
    const sb = getSupabase();
    if (!sb) return { ok: false, error: 'Supabase non configuré' };
    const { data: { session } } = await sb.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return { ok: true };
    const list = templatesToSync ?? templates;
    // Ne pas pousser le template par défaut seul en BDD quand c'est l'état courant (évite écrasement au chargement)
    // Quand templatesToSync est fourni (ex: restauration), on pousse quand même pour mettre Supabase à jour
    if (!templatesToSync && list.length > 0 && list[0]?.isDefault === true) {
      return { ok: true };
    }
    try {
      const { error } = await sb
        .from('saved_templates')
        .upsert(
          { owner_id: userId, value: list, updated_at: new Date().toISOString() },
          { onConflict: 'owner_id' }
        );
      if (error) throw new Error((error as { message?: string })?.message);
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function fetchTemplatesFromSupabase(): Promise<void> {
    const sb = getSupabase();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;
    const { data, error } = await sb.from('saved_templates').select('value').eq('owner_id', userId).maybeSingle();
    if (error || !data?.value) return;
    try {
      const parsed = (Array.isArray(data.value) ? data.value : JSON.parse(String(data.value))) as Template[];
      if (Array.isArray(parsed) && parsed.length > 0) setTemplates(parsed);
    } catch (_e) {
      /* ignorer */
    }
  }

  // Sync automatique des templates vers Supabase (debounce court pour réel direct après édition)
  const templatesSyncEnabledRef = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { templatesSyncEnabledRef.current = true; }, 3000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!templatesSyncEnabledRef.current) return;
    const id = setTimeout(() => { syncTemplatesToSupabase().catch(() => { }); }, 400);
    return () => clearTimeout(id);
  }, [templates]);

  // ========================================
  // PREVIEW ENGINE (hook extrait)
  // ========================================
  const previewEngine = usePreviewEngine({
    templates,
    currentTemplateIdx,
    allVarsConfig,
    inputs,
    translationType,
    isIntegrated,
    additionalTranslationLinks,
    additionalModLinks,
    uploadedImages: imagesState.uploadedImages,
    editingPostId
  });

  const resetAllFields = useCallback(() => {
    allVarsConfig.forEach(v => setInput(v.name, ''));
    setInput('instruction', '');
    setInput('selected_instruction_key', '');
    setInput('is_modded_game', 'false');
    setInput('Mod_link', '');
    setInput('use_additional_links', 'false');
    setPostTitle('');
    setPostTags('');
    setTranslationType('Automatique');
    setIsIntegrated(false);
    setLinkConfigs({
      Game_link: { source: 'F95', value: '' },
      Translate_link: { source: 'Autre', value: '' },
      Mod_link: { source: 'Autre', value: '' }
    });
    setAdditionalTranslationLinks([]);
    setAdditionalModLinks([]);
    // Utiliser les labels personnalisés depuis localStorage, ou les valeurs par défaut
    setInput('main_translation_label', localStorage.getItem('default_translation_label') || 'Traduction');
    setInput('main_mod_label', localStorage.getItem('default_mod_label') || 'Mod');
    imagesState.clearImages();
    previewEngine.setPreviewOverride(null);
  }, [allVarsConfig, setTranslationType, setIsIntegrated, setPostTitle, setPostTags, setLinkConfigs, imagesState, previewEngine]);

  const value: AppContextValue = {
    resetAllFields,
    linkConfigs,
    setLinkConfig,
    buildFinalLink,
    setLinkConfigs,
    templates,
    importFullConfig,
    updateTemplate,
    restoreDefaultTemplates,
    currentTemplateIdx,
    setCurrentTemplateIdx,
    allVarsConfig,
    addVarConfig,
    updateVarConfig,
    deleteVarConfig,
    inputs,
    setInput,
    translationType,
    setTranslationType,
    isIntegrated,
    setIsIntegrated,
    preview: previewEngine.preview,
    previewOverride: previewEngine.previewOverride,
    setPreviewOverride: previewEngine.setPreviewOverride,
    savedTags,
    addSavedTag,
    updateSavedTag,
    deleteSavedTag,
    syncTagsToSupabase,
    fetchTagsFromSupabase,
    syncInstructionsToSupabase: instructionsState.syncInstructionsToSupabase,
    fetchInstructionsFromSupabase: instructionsState.fetchInstructionsFromSupabase,
    syncTemplatesToSupabase,
    fetchTemplatesFromSupabase,

    savedInstructions: instructionsState.savedInstructions,
    saveInstruction: instructionsState.saveInstruction,
    deleteInstruction: instructionsState.deleteInstruction,
    instructionOwners: instructionsState.instructionOwners,

    uploadedImages: imagesState.uploadedImages,
    addImageFromUrl: imagesState.addImageFromUrl,
    removeImage: imagesState.removeImage,
    setMainImage: imagesState.setMainImage,

    // Post & API
    postTitle,
    setPostTitle,
    postTags,
    setPostTags,

    apiUrl, // Now hardcoded, but exposed for ApiStatusBadge

    publishInProgress,
    lastPublishResult,
    publishPost,

    // Error handling
    showErrorModal,

    // History
    publishedPosts,
    addPublishedPost,
    updatePublishedPost,
    deletePublishedPost,
    fetchHistoryFromAPI,
    parseHistoryRow: rowToPost,
    clearAllAppData,

    // Rate limit protection
    rateLimitCooldown,

    setApiBaseFromSupabase,

    // Edit mode
    editingPostId,
    editingPostData,
    setEditingPostId,
    setEditingPostData,
    loadPostForEditing: (post: PublishedPost) => {
      setEditingPostId(post.id);
      setEditingPostData(post);
      setPostTitle(post.title);
      setPostTags(post.tags);

      // Restaurer le type de traduction et l'intégration
      if (post.translationType) {
        setTranslationType(post.translationType);
      }
      if (post.isIntegrated !== undefined) {
        setIsIntegrated(post.isIntegrated);
      }
      // 🆕 Restaurer le template utilisé
      if (post.templateId) {
        const templateIdx = templates.findIndex(t => t.id === post.templateId);
        if (templateIdx !== -1) {
          console.log(`[Edit] Post créé avec le template: ${templates[templateIdx].name}`);
          // Optionnel: setCurrentTemplateIdx(templateIdx) si vous ajoutez cette fonction au context
        } else {
          console.log(`[Edit] Template original (${post.templateId}) introuvable, utilisation du template actuel`);
        }
      }
      // Restaurer tous les inputs (y compris instruction)
      if (post.savedInputs) {
        // Réinitialiser d'abord tous les inputs pour éviter de garder de vieilles valeurs
        const cleanInputs: Record<string, string> = {};
        allVarsConfig.forEach(v => cleanInputs[v.name] = '');
        cleanInputs['instruction'] = '';
        cleanInputs['selected_instruction_key'] = '';
        cleanInputs['is_modded_game'] = 'false';
        cleanInputs['Mod_link'] = '';
        cleanInputs['use_additional_links'] = 'false';
        cleanInputs['main_translation_label'] = 'Traduction';
        cleanInputs['main_mod_label'] = 'Mod';

        // Appliquer d'abord le nettoyage
        Object.keys(cleanInputs).forEach(key => {
          setInput(key, cleanInputs[key]);
        });

        // Puis appliquer les valeurs sauvegardées (écrasent les valeurs par défaut)
        Object.keys(post.savedInputs).forEach(key => {
          setInput(key, post.savedInputs![key] || '');
        });
      }

      // ✅ RESTAURER LINKCONFIGS
      if (post.savedLinkConfigs) {
        setLinkConfigs(JSON.parse(JSON.stringify(post.savedLinkConfigs)));
      } else if (post.savedInputs) {
        // Fallback : reconstruire depuis savedInputs
        setLinkConfigs({
          Game_link: { source: 'F95', value: post.savedInputs.Game_link || '' },
          Translate_link: { source: 'Autre', value: post.savedInputs.Translate_link || '' },
          Mod_link: { source: 'Autre', value: post.savedInputs.Mod_link || '' }
        });
      }

      // ✅ RESTAURER LIENS ADDITIONNELS
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

      // ✅ RESTAURER LES LABELS PRINCIPAUX
      if (post.savedInputs?.['main_translation_label']) {
        setInput('main_translation_label', post.savedInputs.main_translation_label);
      }
      if (post.savedInputs?.['main_mod_label']) {
        setInput('main_mod_label', post.savedInputs.main_mod_label);
      }

      // ✅ RESTAURER L'IMAGE (URLs uniquement)
      if (post.imagePath && (post.imagePath.startsWith('http://') || post.imagePath.startsWith('https://'))) {
        const fileName = new URL(post.imagePath).pathname.split('/').pop() || 'image.jpg';
        imagesState.setUploadedImages([{
          id: Date.now().toString(),
          url: post.imagePath,
          name: fileName,
          isMain: true
        }]);
      }

      // Restaurer le contenu du post dans le preview
      previewEngine.setPreviewOverride(post.content ?? '');

      // Le champ de recherche d'instruction sera restauré automatiquement
      // via l'input 'selected_instruction_key' dans ContentEditor
    },
    loadPostForDuplication: (post: PublishedPost) => {
      setEditingPostId(null);
      setEditingPostData(null);
      previewEngine.setPreviewOverride(null);
      setPostTitle(post.title);
      setPostTags(post.tags);

      if (post.translationType) setTranslationType(post.translationType);
      if (post.isIntegrated !== undefined) setIsIntegrated(post.isIntegrated);

      // Restaurer tous les champs sauvegardés (y compris instruction et variables personnalisées supprimées depuis)
      if (post.savedInputs) {
        Object.keys(post.savedInputs).forEach(key => {
          setInput(key, post.savedInputs![key] ?? '');
        });
      }

      if (post.savedLinkConfigs) {
        setLinkConfigs(JSON.parse(JSON.stringify(post.savedLinkConfigs)));
      } else if (post.savedInputs) {
        setLinkConfigs({
          Game_link: { source: 'F95', value: post.savedInputs.Game_link || '' },
          Translate_link: { source: 'Autre', value: post.savedInputs.Translate_link || '' },
          Mod_link: { source: 'Autre', value: post.savedInputs.Mod_link || '' }
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
      if (post.savedInputs?.['main_translation_label']) setInput('main_translation_label', post.savedInputs.main_translation_label);
      if (post.savedInputs?.['main_mod_label']) setInput('main_mod_label', post.savedInputs.main_mod_label);
    },

    // API status global
    apiStatus,
    setApiStatus,

    // Discord config global
    discordConfig,
    setDiscordConfig,

    additionalTranslationLinks,
    addAdditionalTranslationLink,
    updateAdditionalTranslationLink,
    deleteAdditionalTranslationLink,
    additionalModLinks,
    addAdditionalModLink,
    updateAdditionalModLink,
    deleteAdditionalModLink
  };

  return (
    <AppContext.Provider value={value}>
      {children}
      {errorModalData && (
        <ErrorModal
          error={errorModalData}
          onClose={() => setErrorModalData(null)}
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
