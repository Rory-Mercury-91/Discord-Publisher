import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ErrorModal from '../components/ErrorModal';
import { getSupabase } from '../lib/supabase';
import { tauriAPI } from '../lib/tauri-api';
// The local logger has been removed.  Koyeb collects logs automatically, so
// there is no need to import or use the custom logger.

export type VarConfig = {
  name: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'textarea';
  fullWidth?: boolean;
  hasSaveLoad?: boolean;
  showInAvailableVars?: boolean;
  domId?: string;
  templates?: string[]; // Liste des IDs de templates associés (vide = tous)
  isCustom?: boolean; // Pour distinguer les variables par défaut des personnalisées
};

export type Template = {
  id?: string;
  name: string;
  type?: string | null;
  content: string;
  isDraft?: boolean;
  /** Template par défaut (défini dans le code) : sauvegardé localement uniquement, jamais poussé en BDD. */
  isDefault?: boolean;
  createdAt?: number;
  modifiedAt?: number;
  lastSavedAt?: number;
};

export type LinkConfig = {
  source: 'F95' | 'Lewd' | 'Autre';
  value: string; // ID ou URL complète selon la source
};

export type AdditionalTranslationLink = {
  label: string;
  link: string;
};

export type Tag = {
  name: string;
  id?: string;
  template?: string;
  isTranslator?: boolean;
  /** ID Discord de l'utilisateur qui a créé le tag (optionnel) */
  authorDiscordId?: string;
  /** ID du tag côté Discord (forum/channel) pour que ça marche avec Discord */
  discordTagId?: string;
};

export type PublishedPost = {
  id: string;
  timestamp: number;
  /** Date de création (ms), pour affichage */
  createdAt?: number;
  /** Date de dernière modification (ms), pour affichage */
  updatedAt?: number;
  title: string;
  content: string;
  tags: string;
  template: string;
  imagePath?: string;
  translationType?: string;
  isIntegrated?: boolean;
  threadId: string;
  messageId: string;
  discordUrl: string;
  forumId: number;

  // ✅ Ajout des données complètes de restauration
  savedInputs?: Record<string, string>;
  savedLinkConfigs?: {
    Game_link: LinkConfig;
    Translate_link: LinkConfig;
    Mod_link: LinkConfig;
  };
  savedAdditionalTranslationLinks?: AdditionalTranslationLink[];
  /** Liens additionnels mod (affichés si mod compatible) */
  savedAdditionalModLinks?: AdditionalTranslationLink[];
  templateId?: string;
  /** ID Discord de l'auteur du post (pour droits d'édition) */
  authorDiscordId?: string;
};

const defaultVarsConfig: VarConfig[] = [
  { name: 'Game_name', label: 'Nom du jeu', placeholder: 'Lost Solace' },
  { name: 'Game_version', label: 'Version du jeu', placeholder: 'v0.1' },
  { name: 'Translate_version', label: 'Version de la traduction', placeholder: 'v0.1' },
  { name: 'Game_link', label: 'Lien du jeu', placeholder: 'https://...' },
  { name: 'Translate_link', label: 'Lien de la traduction', placeholder: 'https://...' },
  { name: 'Overview', label: 'Synopsis', placeholder: 'Synopsis du jeu...', type: 'textarea' },
  { name: 'is_modded_game', label: 'Mod compatible', type: 'text' }, // Stocké comme "true"/"false"
  { name: 'Mod_link', label: 'Lien du mod', placeholder: 'https://...' }
];

// Template unique par défaut (géré uniquement dans le code ; sauvegarde locale possible, pas en BDD)
const defaultTemplate: Template = {
  id: 'my',
  name: 'Mes traductions',
  type: 'my',
  isDefault: true,
  content: `## :flag_fr: La traduction française de [Game_name] est disponible ! :tada:

Vous pouvez l'installer dès maintenant pour profiter du jeu dans notre langue. Bon jeu à tous ! :point_down:

1. :computer: **Infos du Jeu**
   * **Nom du jeu :** [Game_name]
   * **Version du jeu :** \`[Game_version]\`
   * **Version traduite :** \`[Translate_version]\`
   * **Type de traduction :** [Translation_Type]
   * **Mod compatible :** [is_modded_game]

2. :link: **Liens requis**
   * [Jeu original](<[Game_link]>)
[MOD_LINKS_LINE]

3. :link: **Traductions**
[TRANSLATION_LINKS_LINE]

**Synopsis du jeu :**
> [Overview]
[instruction]`
};
// // Template unique par défaut
// const defaultTemplate: Template = {
//   id: 'my',
//   name: 'Mes traductions',
//   type: 'my',
//   content: `## :flag_fr: La traduction française de [Game_name] est disponible ! :tada:

// Vous pouvez l'installer dès maintenant pour profiter du jeu dans notre langue. Bon jeu à tous ! :point_down:

// ### :computer: Infos du Mod & Liens de Téléchargement
// * **Nom du jeu :** [Game_name]
// * **Version du jeu :** \`[Game_version]\`
// * **Version traduite :** \`[Translate_version]\`
// * **Type de traduction :** [Translation_Type]
// * **Mod compatible :** [is_modded_game]
// * [Accès au jeu original](<[Game_link]>)
//   * [Téléchargez la traduction ici !](<[Translate_link]>)
// [ADDITIONAL_TRANSLATION_LINKS]
// > **Synopsis du jeu :**
// > [Overview]
// [instruction]
// ### :sparkling_heart: Soutenez le Traducteur !
// Pour m'encourager et soutenir mes efforts :
// * **Soutien au Traducteur (Moi !) :** [Offrez-moi un café pour le temps passé !](https://discord.com/channels/1417811606674477139/1433930090349330493)`
// };
// Templates stockés comme tableau avec un seul élément (pour compatibilité avec TemplatesModal)
const defaultTemplates: Template[] = [defaultTemplate];

type AppContextValue = {
  resetAllFields: () => void;
  templates: Template[];
  updateTemplate: (idx: number, t: Template) => void;
  restoreDefaultTemplates: () => void;
  currentTemplateIdx: number; // Toujours 0 - un seul template
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
  /** Contenu affiché et envoyé à la publication : rendu template+variables, ou override si édition directe. */
  preview: string;
  /** Override du preview (édition directe pour ce post). null = rendu live depuis le template. */
  previewOverride: string | null;
  setPreviewOverride: (value: string | null) => void;
  savedTags: Tag[];
  addSavedTag: (t: Tag) => void;
  updateSavedTag: (id: string, updates: Partial<Tag>) => void;
  deleteSavedTag: (idx: number) => void;
  /** Envoyer les tags vers Supabase. authorDiscordId optionnel : utilisé pour les tags sans auteur. */
  syncTagsToSupabase: (authorDiscordId?: string) => Promise<{ ok: boolean; count?: number; error?: string }>;
  /** Recharger les tags depuis Supabase (pour récupérer ceux des autres utilisateurs). */
  fetchTagsFromSupabase: () => Promise<void>;
  /** Envoyer les instructions vers Supabase (app_config). */
  syncInstructionsToSupabase: () => Promise<{ ok: boolean; error?: string }>;
  /** Récupérer les instructions depuis Supabase. */
  fetchInstructionsFromSupabase: () => Promise<void>;
  /** Envoyer les templates personnalisés vers Supabase (app_config). */
  syncTemplatesToSupabase: () => Promise<{ ok: boolean; error?: string }>;
  /** Récupérer les templates depuis Supabase. */
  fetchTemplatesFromSupabase: () => Promise<void>;
  importFullConfig: (config: any) => void;

  savedInstructions: Record<string, string>;
  saveInstruction: (name: string, text: string) => void;
  deleteInstruction: (name: string) => void;

  uploadedImages: Array<{ id: string, path?: string, url?: string, name: string, isMain: boolean }>;
  addImages: (files: FileList | File[]) => void;
  addImageFromPath: (filePath: string) => Promise<void>;
  addImageFromUrl: (url: string) => void;
  removeImage: (idx: number) => void;
  setMainImage: (idx: number) => void;

  // Post & API
  postTitle: string;
  setPostTitle: (s: string) => void;
  postTags: string;
  setPostTags: (s: string) => void;

  apiUrl: string;
  publishInProgress: boolean;
  lastPublishResult: string | null;
  publishPost: (authorDiscordId?: string) => Promise<{ ok: boolean, data?: any, error?: string }>;

  // Error handling
  showErrorModal: (error: { code?: string | number; message: string; context?: string; httpStatus?: number; discordError?: any }) => void;

  // History
  publishedPosts: PublishedPost[];
  addPublishedPost: (p: PublishedPost) => Promise<void>;
  updatePublishedPost: (id: string, p: Partial<PublishedPost>) => Promise<void>;
  deletePublishedPost: (id: string) => void;
  fetchHistoryFromAPI: () => Promise<void>;
  /** Convertit une ligne historique (snake_case, Supabase/archive) en PublishedPost pour l'affichage. */
  parseHistoryRow: (row: Record<string, unknown>) => PublishedPost;
  /** Nettoyage des données applicatives (Supabase + état local). ownerId = profil courant pour supprimer ses lignes allowed_editors. */
  clearAllAppData: (ownerId?: string) => Promise<{ ok: boolean; error?: string }>;

  // Rate limit protection
  rateLimitCooldown: number | null;

  // NOUVEAU : Gestion des liens
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
  setLinkConfigs: React.Dispatch<React.SetStateAction<{
    Game_link: LinkConfig;
    Translate_link: LinkConfig;
    Mod_link: LinkConfig;
  }>>;

  // Edit mode
  editingPostId: string | null;
  editingPostData: PublishedPost | null;
  setEditingPostId: (id: string | null) => void;
  setEditingPostData: (post: PublishedPost | null) => void;
  loadPostForEditing: (post: PublishedPost) => void;
  loadPostForDuplication: (post: PublishedPost) => void;

  // Config globale (URL API partagée via Supabase)
  setApiBaseFromSupabase: (url: string | null) => void;

  // API status global
  apiStatus: string;
  setApiStatus: React.Dispatch<React.SetStateAction<string>>;

  // Discord config global
  discordConfig: any;
  setDiscordConfig: React.Dispatch<React.SetStateAction<any>>;

  // Liens additionnels de traduction
  additionalTranslationLinks: AdditionalTranslationLink[];
  addAdditionalTranslationLink: () => void;
  updateAdditionalTranslationLink: (index: number, link: AdditionalTranslationLink) => void;
  deleteAdditionalTranslationLink: (index: number) => void;
  // Liens additionnels mod (affichés si mod compatible)
  additionalModLinks: AdditionalTranslationLink[];
  addAdditionalModLink: () => void;
  updateAdditionalModLink: (index: number, link: AdditionalTranslationLink) => void;
  deleteAdditionalModLink: (index: number) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
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

  // currentTemplateIdx toujours à 0 puisqu'il n'y a qu'un seul template
  const currentTemplateIdx = 0;

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

    let importedVars = config.allVarsConfig;
    if (Array.isArray(importedVars)) {
      // Migration: retirer les anciennes variables qui ne sont plus utilisées
      importedVars = importedVars.filter((v: any) =>
        v?.name !== 'install_instructions' &&
        v?.name !== 'Traductor' &&
        v?.name !== 'Developpeur'
      );
      setAllVarsConfig(importedVars);
    }

    if (Array.isArray(config.savedTags)) {
      setSavedTags(config.savedTags);
    }

    if (config.savedInstructions && typeof config.savedInstructions === 'object') {
      setSavedInstructions(config.savedInstructions);
    }

    if (Array.isArray(config.publishedPosts)) {
      setPublishedPosts(config.publishedPosts);
    }

    // Re-synchroniser inputs avec les variables importées (évite des champs manquants)
    if (Array.isArray(importedVars)) {
      setInputs(prev => {
        const next: Record<string, string> = { ...prev };

        // Migration: supprimer les anciennes variables des inputs
        delete next['Traductor'];
        delete next['Developpeur'];

        for (const v of importedVars) {
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
      next[index] = link;
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
      next[index] = link;
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
        const vars = JSON.parse(raw);
        // Migration: supprimer les anciennes variables qui ne sont plus utilisées
        return vars.filter((v: VarConfig) =>
          v.name !== 'install_instructions' &&
          v.name !== 'Traductor' &&
          v.name !== 'Developpeur'
        );
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
    obj['main_translation_label'] = 'Traduction';
    obj['main_mod_label'] = 'Mod';
    try {
      const raw = localStorage.getItem('savedInputs');
      if (raw) {
        const parsed = JSON.parse(raw);
        // Migration: supprimer les anciennes variables Traductor et Developpeur des inputs sauvegardés
        delete parsed['Traductor'];
        delete parsed['Developpeur'];
        Object.assign(obj, parsed);
      }
    } catch (e) { }
    return obj;
  });

  const [savedInstructions, setSavedInstructions] = useState<Record<string, string>>(() => {
    try { const raw = localStorage.getItem('savedInstructions'); if (raw) return JSON.parse(raw); } catch (e) { }
    return {};
  });
  /** Propriétaire par clé d'instruction (owner_id) : pour ne synchroniser que les instructions de l'utilisateur courant. */
  const [instructionOwners, setInstructionOwners] = useState<Record<string, string>>({});

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

  const [uploadedImages, setUploadedImages] = useState<Array<{ id: string, path?: string, url?: string, name: string, isMain: boolean }>>(() => {
    try {
      const raw = localStorage.getItem('uploadedImages');
      if (raw) {
        const parsed = JSON.parse(raw);
        // Migration: convert old dataUrl format to new path format
        if (parsed.length > 0 && parsed[0].dataUrl) {
          return []; // Reset old format images
        }
        // Migration: ajouter name si manquant
        return parsed.map((img: any) => ({
          ...img,
          name: img.name || img.path?.split(/[/\\]/).pop() || img.url?.split('/').pop() || 'image'
        }));
      }
    } catch (e) { }
    return [];
  });

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

  // API Configuration - URL is now hardcoded for local API
  // Définir l’URL de base en consultant d’abord localStorage, puis .env, et enfin un fallback Koyeb
  const [apiBaseFromSupabase, setApiBaseFromSupabase] = useState<string | null>(null);

  const defaultApiBaseRaw =
    apiBaseFromSupabase ??
    localStorage.getItem('apiBase') ??
    localStorage.getItem('apiUrl') ??
    (typeof import.meta?.env?.VITE_PUBLISHER_API_URL === 'string' ? import.meta.env.VITE_PUBLISHER_API_URL : '') ??
    'https://dependent-klarika-rorymercury91-e1486cf2.koyeb.app';

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
  const [previewOverride, setPreviewOverride] = useState<string | null>(null);

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
  const addPublishedPost = async (p: PublishedPost) => {
    setPublishedPosts(prev => [p, ...prev]);
    const sb = getSupabase();
    if (sb) {
      const row = postToRow(p);
      const res = await sb.from('published_posts').upsert(row, { onConflict: 'id' });
      if (res.error) console.warn('⚠️ Supabase insert post:', (res.error as { message?: string })?.message);
    }
  };

  const updatePublishedPost = async (id: string, updates: Partial<PublishedPost>) => {
    const withUpdatedAt = { ...updates, updatedAt: updates.updatedAt ?? Date.now() };
    setPublishedPosts(prev => prev.map(post => post.id === id ? { ...post, ...withUpdatedAt } : post));
    const sb = getSupabase();
    if (sb) {
      // Fusionner avec l'état actuel pour avoir un post complet ; les updates passés priment (ex: après édition)
      const existing = publishedPosts.find(p => p.id === id);
      const merged: PublishedPost = { ...existing, ...withUpdatedAt, id } as PublishedPost;
      const row = postToRow(merged);
      const res = await sb.from('published_posts').upsert(row, { onConflict: 'id' });
      if (res.error) console.warn('⚠️ Supabase update post:', (res.error as { message?: string })?.message);
    }
  };

  const deletePublishedPost = (id: string) => {
    setPublishedPosts(prev => prev.filter(post => post.id !== id));
    const sb = getSupabase();
    if (sb) sb.from('published_posts').delete().eq('id', id).then((res) => {
      if (res.error) console.warn('⚠️ Supabase delete post:', (res.error as { message?: string })?.message);
    });
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
        }
      }
      setPublishedPosts([]);
      setSavedInstructions({});
      setInstructionOwners({});
      return { ok: true };
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.warn('⚠️ clearAllAppData:', msg);
      return { ok: false, error: msg };
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
      template: p.template ?? 'my',
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
      template_id: p.templateId ?? null,
      created_at: new Date(createdTs).toISOString(),
      updated_at: new Date(updatedTs).toISOString()
    };
  }
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
      template: String(r.template ?? 'my'),
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
      templateId: r.template_id != null ? String(r.template_id) : undefined,
      authorDiscordId: r.author_discord_id != null ? String(r.author_discord_id) : undefined
    };
  }

  // Récupérer l'historique : d'abord Supabase, puis API Koyeb en backup
  async function fetchHistoryFromAPI() {
    const sb = getSupabase();
    if (sb) {
      try {
        const { data: rows, error } = await sb
          .from('published_posts')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(1000);
        if (!error && Array.isArray(rows) && rows.length > 0) {
          setPublishedPosts(rows.map(rowToPost));
          return;
        }
      } catch (_e) {
        // Continuer vers Koyeb
      }
    }
    try {
      const baseUrl = localStorage.getItem('apiBase') || defaultApiBase;
      const apiKey = localStorage.getItem('apiKey') || '';
      const endpoint = `${baseUrl}/api/history`;

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log('⚠️ Endpoint /api/history non disponible, utilisation de localStorage uniquement');
          return;
        }
        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (Array.isArray(data.posts) || Array.isArray(data)) {
        const koyebPosts = Array.isArray(data.posts) ? data.posts : data;
        const localPosts = publishedPosts;
        const newPostsFromKoyeb = koyebPosts.filter((p: any) => {
          const koyebThreadId = p.thread_id || p.threadId;
          const koyebMessageId = p.message_id || p.messageId;
          return !localPosts.some(local =>
            (local.threadId === koyebThreadId && local.messageId === koyebMessageId) ||
            local.id === p.id
          );
        });
        if (newPostsFromKoyeb.length > 0) {
          // Aligné Supabase : l'API Koyeb renvoie les mêmes champs (snake_case) ; on utilise rowToPost
          const mapped = newPostsFromKoyeb.map((p: Record<string, unknown>) => {
            const row = {
              ...p,
              id: p.id ?? `post_${p.timestamp ?? Date.now()}_koyeb`,
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
          console.log(`✅ ${newPostsFromKoyeb.length} nouveaux posts récupérés depuis Koyeb (backup)`);
        }
      }
    } catch (e: any) {
      console.error('❌ Erreur lors de la récupération de l\'historique:', e);
    }
  }

  async function publishPost(authorDiscordId?: string) {
    const title = (postTitle || '').trim();
    const content = preview || '';
    const templateType = (templates[currentTemplateIdx]?.type) || '';
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
    const translatorLabel = selectedTagObjects.filter(t => t.isTranslator).map(t => t.name).join(', ');
    const stateLabel = selectedTagObjects.filter(t => !t.isTranslator).map(t => t.name).join(', ');

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
        context: 'Veuillez configurer l\'URL Koyeb dans Configuration',
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
      let finalContent = content;
      if (uploadedImages.length > 0) {
        const mainImage = uploadedImages.find(img => img.isMain) || uploadedImages[0];
        let imageUrl = '';

        if (mainImage.url) {
          // URL externe (http:// ou https://), utiliser directement
          imageUrl = mainImage.url;
        } else if (mainImage.path) {
          // Fichier local : sans hébergement, on ne peut pas générer une URL publique.
          // L'utilisateur doit utiliser une URL externe pour que l'embed fonctionne.
          console.warn('Les fichiers locaux ne peuvent pas être utilisés comme image embed Discord. Veuillez utiliser une URL externe.');
        }

        // Ajouter le lien à la fin du contenu (le backend le retirera après avoir créé l'embed)
        if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
          finalContent = content + '\n' + imageUrl.trim();
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
      const mainImageForAnnounce = uploadedImages.find(i => i.isMain) || uploadedImages[0];
      const announceImageUrl = mainImageForAnnounce?.url && (mainImageForAnnounce.url.startsWith('http://') || mainImageForAnnounce.url.startsWith('https://'))
        ? mainImageForAnnounce.url
        : '';
      formData.append('announce_image_url', announceImageUrl);

      if (isEditMode && editingPostData) {
        formData.append('threadId', editingPostData.threadId);
        formData.append('messageId', editingPostData.messageId);
        formData.append('thread_url', editingPostData.discordUrl || '');
        formData.append('isUpdate', 'true');
        console.log('🔄 Mode édition activé:', {
          threadId: editingPostData.threadId,
          messageId: editingPostData.messageId
        });
      }

      // Payload complet pour l'historique Koyeb (aligné Supabase) : tous les champs
      const now = Date.now();
      const postId = `post_${now}_${Math.random().toString(36).substr(2, 9)}`;
      const imagePathVal = uploadedImages.find(i => i.isMain)?.path || uploadedImages.find(i => i.isMain)?.url;
      if (isEditMode && editingPostData) {
        const mergedForHistory: PublishedPost = {
          ...editingPostData,
          id: editingPostData.id,
          timestamp: now,
          updatedAt: now,
          title,
          content: finalContent,
          tags: tagsToSend,
          template: templateType,
          imagePath: imagePathVal,
          translationType,
          isIntegrated,
          savedInputs: { ...inputs },
          savedLinkConfigs: JSON.parse(JSON.stringify(linkConfigs)),
          savedAdditionalTranslationLinks: JSON.parse(JSON.stringify(additionalTranslationLinks)),
          savedAdditionalModLinks: JSON.parse(JSON.stringify(additionalModLinks)),
          templateId: templates[currentTemplateIdx]?.id,
          threadId: editingPostData.threadId,
          messageId: editingPostData.messageId,
          discordUrl: editingPostData.discordUrl || '',
          forumId: editingPostData.forumId ?? 0
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
          template: templateType,
          imagePath: imagePathVal,
          translationType,
          isIntegrated,
          savedInputs: { ...inputs },
          savedLinkConfigs: JSON.parse(JSON.stringify(linkConfigs)),
          savedAdditionalTranslationLinks: JSON.parse(JSON.stringify(additionalTranslationLinks)),
          savedAdditionalModLinks: JSON.parse(JSON.stringify(additionalModLinks)),
          templateId: templates[currentTemplateIdx]?.id,
          threadId: '',
          messageId: '',
          discordUrl: '',
          forumId: 0,
          authorDiscordId: authorDiscordId ?? undefined
        };
        formData.append('history_payload', JSON.stringify(postToRow(newPostForHistory)));
      }

      // Plus besoin d'envoyer les images comme attachments, elles sont dans le contenu

      const apiKey = localStorage.getItem('apiKey') || '';

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey
        },
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
            ? 'L\'API n\'est pas accessible. Vérifiez l\'URL Koyeb.'
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
          const updatedPost: Partial<PublishedPost> = {
            timestamp: Date.now(),
            title,
            content,
            tags: tagsToSend,
            template: templateType,
            imagePath: uploadedImages.find(i => i.isMain)?.path || uploadedImages.find(i => i.isMain)?.url,
            translationType,
            isIntegrated,
            savedInputs: { ...inputs },
            savedLinkConfigs: JSON.parse(JSON.stringify(linkConfigs)),
            savedAdditionalTranslationLinks: JSON.parse(JSON.stringify(additionalTranslationLinks)),
            savedAdditionalModLinks: JSON.parse(JSON.stringify(additionalModLinks)),
            templateId: templates[currentTemplateIdx]?.id,
            threadId: String(threadId),
            messageId: String(messageId),
            discordUrl: threadUrl || editingPostData.discordUrl,
            forumId: typeof forumId === 'number' ? forumId : parseInt(String(forumId)) || 0
          };
          // Post fusionné = même contenu que Discord pour que Supabase et le contrôle de version restent cohérents
          const mergedPost = { ...editingPostData, ...updatedPost };
          await updatePublishedPost(editingPostId, mergedPost);
          tauriAPI.saveLocalHistoryPost(postToRow(mergedPost), mergedPost.authorDiscordId);
          setEditingPostId(null);
          setEditingPostData(null);
          console.log('✅ Post mis à jour dans l\'historique et Supabase:', updatedPost);
        } else {
          const now = Date.now();
          const newPost: PublishedPost = {
            id: `post_${now}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: now,
            createdAt: now,
            updatedAt: now,
            title,
            content,
            tags: tagsToSend,
            template: templateType,
            imagePath: uploadedImages.find(i => i.isMain)?.path || uploadedImages.find(i => i.isMain)?.url,
            translationType,
            isIntegrated,
            savedInputs: { ...inputs },
            savedLinkConfigs: JSON.parse(JSON.stringify(linkConfigs)),
            savedAdditionalTranslationLinks: JSON.parse(JSON.stringify(additionalTranslationLinks)),
            savedAdditionalModLinks: JSON.parse(JSON.stringify(additionalModLinks)),
            templateId: templates[currentTemplateIdx]?.id,
            threadId: String(threadId),
            messageId: String(messageId),
            discordUrl: threadUrl,
            forumId: typeof forumId === 'number' ? forumId : parseInt(String(forumId)) || 0,
            authorDiscordId: authorDiscordId ?? undefined
          };
          await addPublishedPost(newPost);
          tauriAPI.saveLocalHistoryPost(postToRow(newPost), newPost.authorDiscordId);
          console.log('✅ Nouveau post ajouté à l\'historique et Supabase:', newPost);
        }
      } else {
        console.warn('⚠️ Réponse API ne contient pas thread_id/message_id');
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

  // Charger les tags depuis Supabase au montage (remplace localStorage si Supabase a des données)
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.from('tags')
      .select('id, name, template, is_translator, author_discord_id, discord_tag_id')
      .order('created_at', { ascending: true })
      .then((res) => {
        if (res.error || !res.data?.length) return;
        setSavedTags(
          (res.data as Array<{ id: string; name: string; template: string | null; is_translator: boolean; author_discord_id: string | null; discord_tag_id: string | null }>).map((r) => ({
            id: r.id,
            name: r.name,
            template: r.template ?? undefined,
            isTranslator: r.is_translator ?? false,
            authorDiscordId: r.author_discord_id ?? undefined,
            discordTagId: r.discord_tag_id ?? undefined
          }))
        );
      });
  }, []);

  // Charger instructions (table saved_instructions par propriétaire) et templates depuis Supabase au montage
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      // Instructions : table saved_instructions (visible par l'auteur + ses éditeurs autorisés)
      const resInstr = await sb.from('saved_instructions').select('owner_id, value');
      if (!resInstr.error && resInstr.data?.length) {
        const merged: Record<string, string> = {};
        const owners: Record<string, string> = {};
        for (const row of resInstr.data as Array<{ owner_id: string; value: Record<string, string> | string }>) {
          try {
            const val = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
            if (val && typeof val === 'object' && !Array.isArray(val)) {
              for (const [k, v] of Object.entries(val)) {
                if (typeof v === 'string') {
                  merged[k] = v;
                  owners[k] = row.owner_id;
                }
              }
            }
          } catch (_e) {
            /* ignorer */
          }
        }
        if (Object.keys(merged).length) setSavedInstructions(merged);
        setInstructionOwners(owners);
      } else if (session?.user?.id) {
        // Migration : anciennes instructions globales (app_config) → saved_instructions pour l'utilisateur courant
        const { data: oldRow } = await sb.from('app_config').select('value').eq('key', 'saved_instructions').maybeSingle();
        if (oldRow?.value) {
          try {
            const parsed = JSON.parse(oldRow.value as string) as Record<string, string>;
            if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) {
              await sb.from('saved_instructions').upsert(
                { owner_id: session.user.id, value: parsed, updated_at: new Date().toISOString() },
                { onConflict: 'owner_id' }
              );
              setSavedInstructions(parsed);
              const owners: Record<string, string> = {};
              for (const k of Object.keys(parsed)) owners[k] = session.user.id;
              setInstructionOwners(owners);
            }
          } catch (_e) {
            /* ignorer */
          }
        }
      }
      // Templates : toujours depuis app_config (partagés)
      const resTpl = await sb.from('app_config').select('value').eq('key', 'custom_templates').maybeSingle();
      if (!resTpl.error && resTpl.data?.value) {
        try {
          const parsed = JSON.parse(resTpl.data.value as string) as Template[];
          if (Array.isArray(parsed) && parsed.length > 0) setTemplates(parsed);
        } catch (_e) {
          /* ignorer */
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
          const mapRow = (r: { id: string; name: string; template: string | null; is_translator: boolean; author_discord_id?: string | null; discord_tag_id?: string | null }) => ({
            id: r.id,
            name: r.name,
            template: r.template ?? undefined,
            isTranslator: r.is_translator ?? false,
            authorDiscordId: r.author_discord_id ?? undefined,
            discordTagId: r.discord_tag_id ?? undefined
          });
          if (payload.eventType === 'INSERT') {
            const r = payload.new as { id: string; name: string; template: string | null; is_translator: boolean; author_discord_id?: string | null; discord_tag_id?: string | null };
            const row = mapRow(r);
            setSavedTags(prev => (prev.some(t => t.id === row.id) ? prev : [...prev, row]));
          } else if (payload.eventType === 'UPDATE') {
            const r = payload.new as { id: string; name: string; template: string | null; is_translator: boolean; author_discord_id?: string | null; discord_tag_id?: string | null };
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
              const merged: Record<string, string> = {};
              const owners: Record<string, string> = {};
              for (const row of res.data as Array<{ owner_id: string; value: Record<string, string> | string }>) {
                try {
                  const val = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
                  if (val && typeof val === 'object' && !Array.isArray(val)) {
                    for (const [k, v] of Object.entries(val)) {
                      if (typeof v === 'string') {
                        merged[k] = v;
                        owners[k] = row.owner_id;
                      }
                    }
                  }
                } catch (_e) {
                  /* ignorer */
                }
              }
              setSavedInstructions(merged);
              setInstructionOwners(owners);
            });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_config' },
        (payload) => {
          const r = (payload.eventType === 'DELETE' ? payload.old : payload.new) as { key: string; value: string };
          if (r?.key === 'custom_templates' && r?.value) {
            try {
              const parsed = JSON.parse(r.value) as Template[];
              if (Array.isArray(parsed) && parsed.length > 0) setTemplates(parsed);
            } catch (_e) { /* ignorer */ }
          } else if (r?.key === 'api_base_url' && r?.value?.trim()) {
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') console.log('🔄 Realtime Discord Publisher actif');
      });

    return () => {
      sb.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    // Migration: nettoyer les anciennes variables avant de sauvegarder
    const cleanedInputs = { ...inputs };
    delete cleanedInputs['Traductor'];
    delete cleanedInputs['Developpeur'];
    localStorage.setItem('savedInputs', JSON.stringify(cleanedInputs));
  }, [inputs]);

  useEffect(() => {
    localStorage.setItem('translationType', translationType);
  }, [translationType]);

  useEffect(() => {
    localStorage.setItem('isIntegrated', String(isIntegrated));
  }, [isIntegrated]);

  useEffect(() => {
    localStorage.setItem('savedInstructions', JSON.stringify(savedInstructions));
  }, [savedInstructions]);

  useEffect(() => {
    localStorage.setItem('uploadedImages', JSON.stringify(uploadedImages));
  }, [uploadedImages]);

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
    } catch (e) {
      console.error('Erreur lors de la sauvegarde des templates par défaut:', e);
    }
  }

  function addVarConfig(v: VarConfig) {
    // Empêcher l'ajout des variables obsolètes
    if (v.name === 'Traductor' || v.name === 'Developpeur' || v.name === 'install_instructions') {
      console.warn(`Variable "${v.name}" n'est plus supportée et ne peut pas être ajoutée`);
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
    if (!url || !url.trim()) return url;

    const trimmed = url.trim();

    // Retirer les chevrons si présents (au cas où l'utilisateur les met manuellement)
    const cleaned = trimmed.replace(/^<|>$/g, '');

    // F95Zone - Garder uniquement https://f95zone.to/threads/ID/
    const f95Match = cleaned.match(/f95zone\.to\/threads\/([^\/]+)/);
    if (f95Match) {
      return `https://f95zone.to/threads/${f95Match[1]}/`;
    }

    // LewdCorner - Garder uniquement https://lewdcorner.com/threads/ID/
    const lewdMatch = cleaned.match(/lewdcorner\.com\/threads\/([^\/]+)/);
    if (lewdMatch) {
      return `https://lewdcorner.com/threads/${lewdMatch[1]}/`;
    }

    // Si aucun pattern reconnu, retourner l'URL nettoyée
    return cleaned;
  }

  function setInput(name: string, value: string) {
    let finalValue = value;

    // Auto-nettoyage des liens (Game_link, Translate_link, Mod_link)
    if (name === 'Game_link' || name === 'Translate_link' || name === 'Mod_link') {
      finalValue = cleanGameLink(value);
    }

    setInputs(prev => ({ ...prev, [name]: finalValue }));
  }

  function extractIdFromUrl(url: string, source: 'F95' | 'Lewd'): string {
    if (!url || !url.trim()) return '';

    const trimmed = url.trim();

    if (source === 'F95') {
      // Extraire ID de f95zone.to/threads/nom.ID/ ou f95zone.to/threads/ID/
      const match = trimmed.match(/f95zone\.to\/threads\/(?:[^.]+\.)?(\d+)/);
      return match ? match[1] : trimmed;
    }

    if (source === 'Lewd') {
      // Extraire ID de lewdcorner.com/threads/nom.ID/ ou lewdcorner.com/threads/ID/
      const match = trimmed.match(/lewdcorner\.com\/threads\/(?:[^.]+\.)?(\d+)/);
      return match ? match[1] : trimmed;
    }

    return trimmed;
  }

  function buildFinalLink(config: LinkConfig): string {
    const v = config.value.trim();
    if (!v) return '';

    // Détecter si c'est une URL complète d'un autre domaine (Proton, etc.)
    const isOtherFullUrl = v.toLowerCase().startsWith('http') &&
      !v.toLowerCase().includes('f95zone.to') &&
      !v.toLowerCase().includes('lewdcorner.com');

    // Si c'est une URL d'un autre domaine, la retourner telle quelle, peu importe la source sélectionnée
    if (isOtherFullUrl) {
      return v;
    }

    // Sinon, construire l'URL selon la source
    switch (config.source) {
      case 'F95':
        return `https://f95zone.to/threads/${v}/`;
      case 'Lewd':
        return `https://lewdcorner.com/threads/${v}/`;
      case 'Autre':
        return v;
      default:
        return v;
    }
  }

  // Fonction pour mettre à jour la config d'un lien
  function setLinkConfig(linkName: 'Game_link' | 'Translate_link' | 'Mod_link', source: 'F95' | 'Lewd' | 'Autre', value: string) {
    setLinkConfigs(prev => {
      // Si on change de source F95/Lewd et qu'on a une URL, extraire l'ID
      let processedValue = value;
      if ((source === 'F95' || source === 'Lewd') && value.includes('http')) {
        processedValue = extractIdFromUrl(value, source);
      }

      return {
        ...prev,
        [linkName]: { source, value: processedValue }
      };
    });
  }

  function addSavedTag(t: Tag) {
    const sb = getSupabase();
    if (sb) {
      sb.from('tags')
        .insert({
          name: t.name || '',
          template: t.template ?? null,
          is_translator: t.isTranslator ?? false,
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
      if (updates.template !== undefined) row.template = updates.template ?? null;
      if (updates.isTranslator !== undefined) row.is_translator = updates.isTranslator;
      if (updates.authorDiscordId !== undefined) row.author_discord_id = updates.authorDiscordId ?? null;
      if (updates.discordTagId !== undefined) row.discord_tag_id = updates.discordTagId ?? null;
      if (Object.keys(row).length > 0) {
        sb.from('tags').update(row).eq('id', id).then((res) => {
          if (res.error) console.warn('⚠️ Supabase update tag:', (res.error as { message?: string })?.message);
        });
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
          template: t.template ?? null,
          is_translator: t.isTranslator ?? false,
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
      .select('id, name, template, is_translator, author_discord_id, discord_tag_id')
      .order('created_at', { ascending: true });
    if (error || !data?.length) return;
    setSavedTags(
      (data as Array<{ id: string; name: string; template: string | null; is_translator: boolean; author_discord_id: string | null; discord_tag_id: string | null }>).map((r) => ({
        id: r.id,
        name: r.name,
        template: r.template ?? undefined,
        isTranslator: r.is_translator ?? false,
        authorDiscordId: r.author_discord_id ?? undefined,
        discordTagId: r.discord_tag_id ?? undefined
      }))
    );
  }

  // Instructions saved
  function saveInstruction(name: string, text: string) {
    setSavedInstructions(prev => ({ ...prev, [name]: text }));
    getSupabase()?.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setInstructionOwners(prev => ({ ...prev, [name]: session.user.id }));
    });
  }
  function deleteInstruction(name: string) {
    setSavedInstructions(prev => { const copy = { ...prev }; delete copy[name]; return copy; });
    setInstructionOwners(prev => { const copy = { ...prev }; delete copy[name]; return copy; });
  }

  async function syncInstructionsToSupabase(): Promise<{ ok: boolean; error?: string }> {
    const sb = getSupabase();
    if (!sb) return { ok: false, error: 'Supabase non configuré' };
    try {
      const { data: { session } } = await sb.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'Connectez-vous pour enregistrer les instructions' };
      const myInstructions: Record<string, string> = {};
      for (const [k, v] of Object.entries(savedInstructions)) {
        if (instructionOwners[k] === userId) myInstructions[k] = v;
      }
      const { error } = await sb
        .from('saved_instructions')
        .upsert(
          { owner_id: userId, value: myInstructions, updated_at: new Date().toISOString() },
          { onConflict: 'owner_id' }
        );
      if (error) throw new Error((error as { message?: string })?.message);
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function fetchInstructionsFromSupabase(): Promise<void> {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.from('saved_instructions').select('owner_id, value');
    if (error || !data?.length) return;
    const merged: Record<string, string> = {};
    const owners: Record<string, string> = {};
    for (const row of data as Array<{ owner_id: string; value: Record<string, string> | string }>) {
      try {
        const val = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          for (const [k, v] of Object.entries(val)) {
            if (typeof v === 'string') {
              merged[k] = v;
              owners[k] = row.owner_id;
            }
          }
        }
      } catch (_e) {
        /* ignorer */
      }
    }
    if (Object.keys(merged).length) setSavedInstructions(merged);
    setInstructionOwners(owners);
  }

  async function syncTemplatesToSupabase(): Promise<{ ok: boolean; error?: string }> {
    const sb = getSupabase();
    if (!sb) return { ok: false, error: 'Supabase non configuré' };
    // Ne pas pousser le template par défaut en BDD (géré uniquement dans le code + localStorage)
    if (templates.length > 0 && templates[0]?.isDefault === true) {
      return { ok: true };
    }
    try {
      const { error } = await sb
        .from('app_config')
        .upsert(
          { key: 'custom_templates', value: JSON.stringify(templates), updated_at: new Date().toISOString() },
          { onConflict: 'key' }
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
    const { data, error } = await sb.from('app_config').select('value').eq('key', 'custom_templates').maybeSingle();
    if (error || !data?.value) return;
    try {
      const parsed = JSON.parse(data.value as string) as Template[];
      if (Array.isArray(parsed) && parsed.length > 0) setTemplates(parsed);
    } catch (_e) {
      /* ignorer */
    }
  }

  // Images
  async function compressImage(file: File): Promise<File> {
    const MAX_SIZE_MB = 8;
    const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
    const JPEG_QUALITY = 0.8;

    // Si l'image est déjà petite, pas besoin de compresser
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

            console.log(`Image compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`);
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

  // Fonction pour ajouter une image depuis un chemin de fichier (bouton Parcourir)
  // Une seule image : remplace l'ancienne si elle existe
  async function addImageFromPath(filePath: string) {
    try {
      // Sauvegarder l'image dans le dossier images/ via Tauri
      const result = await tauriAPI.saveImage(filePath);
      if (result.ok && result.fileName) {
        // Extraire le nom du fichier depuis le chemin sauvegardé
        const fileName = result.fileName.split(/[/\\]/).pop() || filePath.split(/[/\\]/).pop() || 'image';

        setUploadedImages(prev => {
          // Supprimer l'ancienne image si elle existe
          if (prev.length > 0 && prev[0].path) {
            tauriAPI.deleteImage(prev[0].path).catch(e => console.error('Failed to delete old image:', e));
          }

          // Ajouter la nouvelle image (une seule)
          return [{
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
            path: result.fileName,
            name: fileName,
            isMain: true
          }];
        });
      }
    } catch (e) {
      console.error('Failed to save image from path:', e);
    }
  }

  // Fonction pour ajouter des images depuis File objects (drag & drop)
  // Une seule image : ne traite que le premier fichier et remplace l'ancienne si elle existe
  async function addImages(files: FileList | File[]) {
    const fileArray = Array.from(files as any) as File[];
    const file = fileArray[0]; // Prendre uniquement le premier fichier

    if (!file || !file.type.startsWith('image/')) return;

    try {
      // Compresser l'image si nécessaire
      const processedFile = await compressImage(file);

      // Les File objects en JavaScript n'ont jamais de propriété path
      // On doit toujours convertir en base64 et utiliser la commande Tauri
      let result;
      try {
        // Convertir le File en base64 avec FileReader (plus efficace et évite la récursion)
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            // Extraire la partie base64 (après "data:image/...;base64,")
            const base64Data = dataUrl.split(',')[1];
            resolve(base64Data);
          };
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(processedFile);
        });

        // Utiliser tauriAPI pour sauvegarder depuis base64
        result = await tauriAPI.saveImageFromBase64(
          base64,
          processedFile.name,
          processedFile.type
        );

        if (!result.ok) {
          throw new Error(result.error || 'Failed to save image from base64');
        }
      } catch (invokeError: any) {
        console.error('Failed to save image from base64:', invokeError);
        // Relancer l'erreur pour qu'elle soit gérée par le catch parent
        throw invokeError;
      }

      if (result.ok && result.fileName) {
        // Extraire le nom du fichier depuis le chemin sauvegardé
        const fileName = result.fileName.split(/[/\\]/).pop() || file.name;

        setUploadedImages(prev => {
          // Supprimer l'ancienne image si elle existe
          if (prev.length > 0 && prev[0].path) {
            tauriAPI.deleteImage(prev[0].path).catch(e => console.error('Failed to delete old image:', e));
          }

          // Ajouter la nouvelle image (une seule)
          return [{
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
            path: result.fileName,
            name: fileName,
            isMain: true
          }];
        });
      }
    } catch (e) {
      console.error('Failed to save image:', e);
    }
  }

  async function removeImage(idx: number) {
    const img = uploadedImages[idx];
    // Supprimer le fichier uniquement si c'est un fichier local (pas une URL)
    if (img?.path && !img.url) {
      try {
        // Delete image file from filesystem
        await tauriAPI.deleteImage(img.path);
      } catch (e) {
        console.error('Failed to delete image:', e);
      }
    }
    setUploadedImages(prev => { const copy = [...prev]; copy.splice(idx, 1); if (copy.length && !copy.some(i => i.isMain)) copy[0].isMain = true; return copy; });
  }

  // Fonction pour ajouter une image depuis une URL
  function addImageFromUrl(url: string) {
    if (!url.trim()) return;

    // Valider que c'est une URL valide
    try {
      new URL(url);
    } catch {
      console.error('URL invalide:', url);
      return;
    }

    setUploadedImages(prev => {
      // Supprimer l'ancienne image si elle existe
      if (prev.length > 0) {
        const oldImg = prev[0];
        // Supprimer le fichier local si c'est un fichier (pas une URL)
        if (oldImg.path && !oldImg.url) {
          tauriAPI.deleteImage(oldImg.path).catch(e => console.error('Failed to delete old image:', e));
        }
      }

      // Extraire le nom de l'image depuis l'URL ou utiliser un nom par défaut
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const fileName = pathname.split('/').pop() || 'image.jpg';

      // Ajouter la nouvelle image (une seule)
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

  const resetAllFields = useCallback(() => {
    allVarsConfig.forEach(v => setInput(v.name, ''));
    setInput('instruction', '');
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
    setInput('main_translation_label', 'Traduction');
    setInput('main_mod_label', 'Mod');
    setUploadedImages([]);
    setPreviewOverride(null);
  }, [allVarsConfig, setTranslationType, setIsIntegrated, setPostTitle, setPostTags, setLinkConfigs, setPreviewOverride]);

  // SUPPRESSION COMPLÈTE DU DEBOUNCE pour un rendu instantané
  // Le preview dépend directement de inputs et currentTemplateIdx

  // ============================================
  // PREVIEW ENGINE - Logique legacy restaurée
  // ============================================
  // Dépend directement de inputs (RAW state) et currentTemplateIdx
  // Logique simplifiée et robuste de la version legacy
  const preview = useMemo(() => {
    const tpl = templates[currentTemplateIdx];
    if (!tpl) return '';

    let content = tpl.content;

    // 1. GESTION DU MOD COMPATIBLE
    const isModded = (inputs as any)['is_modded_game'] === true || (inputs as any)['is_modded_game'] === 'true';
    const modLink = cleanGameLink((inputs['Mod_link'] || '').trim()); // ✅ Nettoyer le lien

    // Dans "Infos du Mod", afficher juste "Oui" ou "Non"
    const moddedText = isModded ? 'Oui' : 'Non';

    // Remplace le tag [is_modded_game] dans le texte
    content = content.split('[is_modded_game]').join(moddedText);

    // 2. Construction des lignes MOD et TRADUCTION (affichées en ligne, séparées par " - ")
    const mainModLabel = (inputs['main_mod_label'] || 'Mod').trim() || 'Mod';
    const mainTranslationLabel = (inputs['main_translation_label'] || 'Traduction').trim() || 'Traduction';
    const modLinkUrl = cleanGameLink((inputs['Mod_link'] || '').trim());
    const translateLinkUrl = cleanGameLink((inputs['Translate_link'] || '').trim());

    // Affichage de la ligne mod dans le template : uniquement si au moins un lien est renseigné (URL ou additionnels).
    // La checkbox "Mod compatible" gère seulement Oui/Non dans les Infos du Jeu.
    const modParts: string[] = [];
    if (modLinkUrl) {
      modParts.push(`[${mainModLabel}](<${modLinkUrl}>)`);
    }
    additionalModLinks
      .filter(link => link.label.trim() && link.link.trim())
      .forEach(link => modParts.push(`[${link.label.trim()}](<${cleanGameLink(link.link.trim())}>)`));
    const modLinksLine = modParts.length > 0 ? `   * ${modParts.join(' - ')}` : '';

    const translationParts: string[] = [];
    if (translateLinkUrl) {
      translationParts.push(`[${mainTranslationLabel}](<${translateLinkUrl}>)`);
    }
    additionalTranslationLinks
      .filter(link => link.label.trim() && link.link.trim())
      .forEach(link => translationParts.push(`[${link.label.trim()}](<${cleanGameLink(link.link.trim())}>)`));
    const translationLinksLine = translationParts.length > 0 ? `   * ${translationParts.join(' - ')}` : '';

    content = content.split('[MOD_LINKS_LINE]').join(modLinksLine);
    // Si traduction intégrée ET aucun lien de traduction : masquer toute la section "3. Traductions"
    const hideTranslationsSection = isIntegrated && translationParts.length === 0;
    if (hideTranslationsSection) {
      content = content.replace(/3\. :link: \*\*Traductions\*\*\n\[TRANSLATION_LINKS_LINE\]\n?/g, '');
    } else {
      content = content.split('[TRANSLATION_LINKS_LINE]').join(translationLinksLine);
    }

    // 3. Remplacement des variables classiques
    allVarsConfig.forEach(varConfig => {
      const name = varConfig.name;
      if (name === 'is_modded_game') return;
      if (name === 'Mod_link' || name === 'Translate_link') return;

      const val = (inputs[name] || '').trim();
      let finalVal = val;

      // Nettoyer les liens (Game_link, Translate_link) à la volée
      if (name === 'Game_link' || name === 'Translate_link') {
        finalVal = cleanGameLink(val);
      }

      if (name === 'Overview' && val) {
        // Synopsis uniquement : préserver les retours à la ligne en blockquote "> "
        const lines = val.split('\n');
        finalVal = lines.length
          ? lines.map((line, i) => (i === 0 ? line : '> ' + line)).join('\n')
          : '';
      }

      content = content.split('[' + name + ']').join(finalVal || '[' + name + ']');
    });

    // 4. Remplacement de [Translation_Type]
    const displayTranslationType = isIntegrated
      ? `${translationType} (Intégrée)`
      : translationType;
    content = content.split('[Translation_Type]').join(displayTranslationType);

    // 5. Logique Smart Integrated (masquer lien traduction standard si intégré)
    if (isIntegrated) {
      content = content.replace(/^.*\[Translate_link\].*$/gm, '');
      content = content.replace(/\n\n\n+/g, '\n\n');
    }

    // [instruction] : bloc de type code (indépendant du synopsis)
    const instructionContent = (inputs['instruction'] || '').trim();
    const instructionBlock = instructionContent
      ? (() => {
        const instructionLines = instructionContent.split('\n').map(l => l.trim()).filter(Boolean);
        const numberedInstructions = instructionLines.map((l, index) => `${index + 1}. ${l}`).join('\n');
        return '```\nInstructions d\'installation :\n' + numberedInstructions + '\n```';
      })()
      : '';
    content = content.split('[instruction]').join(instructionBlock);
    content = content.split('[INVISIBLE_CHAR]').join('\u200B');

    // 6. Réduire les retours à la ligne multiples (garder au moins une ligne vide entre sections pour le preview Discord)
    content = content.replace(/\n\n\n+/g, '\n\n');

    // Ne pas ajouter le lien dans le preview - il sera ajouté uniquement lors de la publication
    // L'image sera affichée séparément via le composant PreviewImage
    return content;
  }, [templates, currentTemplateIdx, allVarsConfig, inputs, translationType, isIntegrated, additionalTranslationLinks, additionalModLinks, uploadedImages]);

  /** Preview effectif : contenu saisi si non vide, sinon rendu template + variables (affichage et publication). */
  const effectivePreview = (previewOverride != null && previewOverride !== '') ? previewOverride : preview;

  const value: AppContextValue = {
    resetAllFields,
    linkConfigs,
    setLinkConfig,
    setLinkConfigs,
    templates,
    importFullConfig,
    updateTemplate,
    restoreDefaultTemplates,
    currentTemplateIdx,
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
    preview: effectivePreview,
    previewOverride,
    setPreviewOverride,
    savedTags,
    addSavedTag,
    updateSavedTag,
    deleteSavedTag,
    syncTagsToSupabase,
    fetchTagsFromSupabase,
    syncInstructionsToSupabase,
    fetchInstructionsFromSupabase,
    syncTemplatesToSupabase,
    fetchTemplatesFromSupabase,

    savedInstructions,
    saveInstruction,
    deleteInstruction,

    uploadedImages,
    addImages,
    addImageFromPath,
    addImageFromUrl,
    removeImage,
    setMainImage,

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

      // ✅ Restaurer les inputs sauvegardés
      if (post.savedInputs) {
        Object.keys(post.savedInputs).forEach(key => {
          setInput(key, post.savedInputs![key] || '');
        });
      }

      // ✅ Restaurer linkConfigs sauvegardés
      if (post.savedLinkConfigs) {
        setLinkConfigs(JSON.parse(JSON.stringify(post.savedLinkConfigs)));
      } else {
        // Fallback : reconstruire depuis savedInputs si ancienne version
        if (post.savedInputs) {
          setLinkConfigs({
            Game_link: { source: 'F95', value: post.savedInputs.Game_link || '' },
            Translate_link: { source: 'Autre', value: post.savedInputs.Translate_link || '' },
            Mod_link: { source: 'Autre', value: post.savedInputs.Mod_link || '' }
          });
        }
      }

      // ✅ Restaurer les liens additionnels de traduction
      if (post.savedAdditionalTranslationLinks) {
        setAdditionalTranslationLinks(JSON.parse(JSON.stringify(post.savedAdditionalTranslationLinks)));
      } else {
        setAdditionalTranslationLinks([]);
      }

      // ✅ Restaurer les liens additionnels mod
      if (post.savedAdditionalModLinks) {
        setAdditionalModLinks(JSON.parse(JSON.stringify(post.savedAdditionalModLinks)));
      } else {
        setAdditionalModLinks([]);
      }

      // ✅ Restaurer les labels principaux (Traduction, Mod) depuis savedInputs
      if (post.savedInputs?.['main_translation_label']) {
        setInput('main_translation_label', post.savedInputs.main_translation_label);
      }
      if (post.savedInputs?.['main_mod_label']) {
        setInput('main_mod_label', post.savedInputs.main_mod_label);
      }

      // ✅ Restaurer l'image si elle existe encore
      if (post.imagePath) {
        // Vérifier si c'est une URL ou un chemin local
        if (post.imagePath.startsWith('http://') || post.imagePath.startsWith('https://')) {
          // C'est une URL externe
          const fileName = new URL(post.imagePath).pathname.split('/').pop() || 'image.jpg';
          setUploadedImages([{
            id: Date.now().toString(),
            url: post.imagePath,
            name: fileName,
            isMain: true
          }]);
        } else {
          // C'est un fichier local, vérifier s'il existe dans le dossier images/
          tauriAPI.readImage(post.imagePath)
            .then(result => {
              if (result.ok) {
                // L'image existe, on peut la restaurer
                const fileName = post.imagePath!.split(/[/\\]/).pop() || 'image';
                setUploadedImages([{
                  id: Date.now().toString(),
                  path: post.imagePath!,
                  name: fileName,
                  isMain: true
                }]);
              }
            })
            .catch(err => {
              console.warn('Image du post non trouvée:', err);
              // L'image n'existe plus dans le dossier local, on continue sans
            });
        }
      }

      // Restaurer le contenu du post dans le preview (mode override) pour édition directe
      setPreviewOverride(post.content ?? '');

      // Plus besoin de restaurer le template - un seul template maintenant
    },
    loadPostForDuplication: (post: PublishedPost) => {
      setEditingPostId(null);
      setEditingPostData(null);
      setPreviewOverride(null);
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
