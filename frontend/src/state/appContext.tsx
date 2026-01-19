import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ErrorModal from '../components/ErrorModal';
import { tauriAPI } from '../lib/tauri-api';
// The local logger has been removed.  Koyeb collects logs automatically, so
// there is no need to import or use the custom logger.

export type VarConfig = {
  name: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'textarea' | 'select';
  options?: string[];
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
  isDraft?: boolean;          // Indique si c'est un brouillon non enregistré
  createdAt?: number;         // Timestamp de création
  modifiedAt?: number;        // Timestamp de dernière modification
  lastSavedAt?: number;       // Timestamp de dernière sauvegarde auto
};

export type LinkConfig = {
  source: 'F95' | 'Lewd' | 'Autre';
  value: string; // ID ou URL complète selon la source
};

export type Tag = { name: string; id?: string; template?: string };

export type PublishedPost = {
  id: string;
  timestamp: number;
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
  templateId?: string;
};

const defaultVarsConfig: VarConfig[] = [
  { name: 'Game_name', label: 'Nom du jeu', placeholder: 'Lost Solace' },
  { name: 'Game_version', label: 'Version du jeu', placeholder: 'v0.1' },
  { name: 'Translate_version', label: 'Version de la traduction', placeholder: 'v0.1' },
  { name: 'Game_link', label: 'Lien du jeu', placeholder: 'https://...' },
  { name: 'Translate_link', label: 'Lien de la traduction', placeholder: 'https://...' },
  { name: 'Traductor', label: 'Traducteur', placeholder: 'Rory Mercury 91', hasSaveLoad: true },
  { name: 'Developpeur', label: 'Développeur', placeholder: 'Nom du développeur' },
  { name: 'Overview', label: 'Synopsis', placeholder: 'Synopsis du jeu...', type: 'textarea' },
  { name: 'is_modded_game', label: 'Jeu modé', type: 'text' }, // Stocké comme "true"/"false"
  { name: 'Mod_link', label: 'Lien du mod', placeholder: 'https://...' }
];

const defaultTemplates: Template[] = [
  {
    id: 'mes',
    name: 'Mes traductions',
    type: 'my',
    content: `## :flag_fr: La traduction française de [Game_name] est disponible ! :tada:

Vous pouvez l'installer dès maintenant pour profiter du jeu dans notre langue. Bon jeu à tous ! :point_down:

### :computer: Infos du Mod & Liens de Téléchargement
* **Nom du jeu :** [Game_name]
* **Version du jeu :** \`[Game_version]\`
* **Version traduite :** \`[Translate_version]\`
* **Type de traduction :** [Translation_Type]
* **Jeu modé :** [is_modded_game]
* **Lien du jeu :** [Accès au jeu original](<[Game_link]>)
* **Lien de la Traduction :** [Téléchargez la traduction ici !](<[Translate_link]>)

> **Synopsis du jeu :**
> [Overview]
[instruction]
### :sparkling_heart: Soutenez le Traducteur !
Pour m'encourager et soutenir mes efforts :
* **Soutien au Traducteur (Moi !) :** [Offrez-moi un café pour le temps passé !](https://discord.com/channels/1417811606674477139/1433930090349330493)`
  },
  {
    id: 'partenaire',
    name: 'Traductions partenaire',
    type: 'partner',
    content: `## :flag_fr: La traduction française de [Game_name] est disponible ! :tada:

Vous pouvez l'installer dès maintenant pour profiter du jeu dans notre langue. Bon jeu à tous ! :point_down:

### :computer: Infos du Mod & Liens de Téléchargement
* **Traducteur :** [Traductor]
* **Nom du jeu :** [Game_name]
* **Version du jeu :** \`[Game_version]\`
* **Version traduite :** \`[Translate_version]\`
* **Type de traduction :** [Translation_Type]
* **Jeu modé :** [is_modded_game]
* **Lien du jeu :** [Accès au jeu original](<[Game_link]>)
* **Lien de la Traduction :** [Téléchargez la traduction ici !](<[Translate_link]>)

> **Synopsis du jeu :**
> [Overview]
[instruction]`
  }
];

type AppContextValue = {
  resetAllFields: () => void;
  templates: Template[];
  addTemplate: (t: Template) => void;
  updateTemplate: (idx: number, t: Template) => void;
  deleteTemplate: (idx: number) => void;
  restoreDefaultTemplates: () => void;
  currentTemplateIdx: number;
  setCurrentTemplateIdx: (n: number) => void;
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
  savedTags: Tag[];
  addSavedTag: (t: Tag) => void;
  deleteSavedTag: (idx: number) => void;
  importFullConfig: (config: any) => void;

  savedInstructions: Record<string, string>;
  saveInstruction: (name: string, text: string) => void;
  deleteInstruction: (name: string) => void;

  savedTraductors: string[];
  saveTraductor: (name: string) => void;
  deleteTraductor: (idx: number) => void;

  uploadedImages: Array<{ id: string, path: string, name: string, isMain: boolean }>;
  addImages: (files: FileList | File[]) => void;
  addImageFromPath: (filePath: string) => Promise<void>;
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
  publishPost: () => Promise<{ ok: boolean, data?: any, error?: string }>;

  // Error handling
  showErrorModal: (error: { code?: string | number; message: string; context?: string; httpStatus?: number; discordError?: any }) => void;

  // History
  publishedPosts: PublishedPost[];
  addPublishedPost: (p: PublishedPost) => void;
  updatePublishedPost: (id: string, p: Partial<PublishedPost>) => void;
  deletePublishedPost: (id: string) => void;
  fetchHistoryFromAPI: () => Promise<void>;

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
  setEditingPostId: (id: string | null) => void;
  setEditingPostData: (post: PublishedPost | null) => void;
  loadPostForEditing: (post: PublishedPost) => void;
  loadPostForDuplication: (post: PublishedPost) => void;

  // API status global
  apiStatus: string;
  setApiStatus: React.Dispatch<React.SetStateAction<string>>;

  // Discord config global
  discordConfig: any;
  setDiscordConfig: React.Dispatch<React.SetStateAction<any>>;
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
  const [templates, setTemplates] = useState<Template[]>(() => {
    try {
      const raw = localStorage.getItem('customTemplates');
      if (raw) return JSON.parse(raw);
    } catch (e) { }
    return defaultTemplates;
  });

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
      // Petite migration: retirer install_instructions si jamais présent (comme ton init)
      importedVars = importedVars.filter((v: any) => v?.name !== 'install_instructions');
      setAllVarsConfig(importedVars);
    }

    if (Array.isArray(config.savedTags)) {
      setSavedTags(config.savedTags);
    }

    if (config.savedInstructions && typeof config.savedInstructions === 'object') {
      setSavedInstructions(config.savedInstructions);
    }

    if (Array.isArray(config.savedTraductors)) {
      setSavedTraductors(config.savedTraductors);
    }

    if (Array.isArray(config.publishedPosts)) {
      setPublishedPosts(config.publishedPosts);
    }

    // Re-synchroniser inputs avec les variables importées (évite des champs manquants)
    if (Array.isArray(importedVars)) {
      setInputs(prev => {
        const next: Record<string, string> = { ...prev };

        for (const v of importedVars) {
          if (v?.name && !(v.name in next)) next[v.name] = '';
        }

        // garantir ces clés
        if (!('is_modded_game' in next)) next['is_modded_game'] = 'false';
        if (!('Mod_link' in next)) next['Mod_link'] = '';

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
      Translate_link: { source: 'F95', value: '' },
      Mod_link: { source: 'F95', value: '' }
    };
  });

  const [allVarsConfig, setAllVarsConfig] = useState<VarConfig[]>(() => {
    try {
      const raw = localStorage.getItem('customVariables');
      if (raw) {
        const vars = JSON.parse(raw);
        // Migration: supprimer l'ancienne variable install_instructions qui est remplacée par le système d'instructions
        return vars.filter((v: VarConfig) => v.name !== 'install_instructions');
      }
    } catch (e) { }
    return defaultVarsConfig;
  });

  const [currentTemplateIdx, setCurrentTemplateIdx] = useState<number>(0);

  const [inputs, setInputs] = useState<Record<string, string>>(() => {
    const obj: Record<string, string> = {};
    allVarsConfig.forEach(v => obj[v.name] = '');
    // Initialiser is_modded_game à "false" par défaut
    obj['is_modded_game'] = 'false';
    obj['Mod_link'] = '';
    obj['Developpeur'] = '';
    try {
      const raw = localStorage.getItem('savedInputs');
      if (raw) {
        const parsed = JSON.parse(raw);
        Object.assign(obj, parsed);
      }
    } catch (e) { }
    return obj;
  });

  const [savedInstructions, setSavedInstructions] = useState<Record<string, string>>(() => {
    try { const raw = localStorage.getItem('savedInstructions'); if (raw) return JSON.parse(raw); } catch (e) { }
    return {};
  });

  const [savedTraductors, setSavedTraductors] = useState<string[]>(() => {
    try { const raw = localStorage.getItem('savedTraductors'); if (raw) return JSON.parse(raw); } catch (e) { }
    return [];
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

  const [uploadedImages, setUploadedImages] = useState<Array<{ id: string, path: string, name: string, isMain: boolean }>>(() => {
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
          name: img.name || img.path?.split(/[/\\]/).pop() || 'image'
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
  const defaultApiBaseRaw =
    localStorage.getItem('apiBase') ||
    import.meta.env.VITE_PUBLISHER_API_URL ||
    'https://dependent-klarika-rorymercury91-e1486cf2.koyeb.app';

  // Normaliser l'URL : enlever les slashes de fin
  const defaultApiBase = defaultApiBaseRaw.replace(/\/+$/, '');

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
  // Format : Nom du jeu [Version du jeu] [FR = Version de la trad] [Développeur]
  useEffect(() => {
    const gameName = inputs['Game_name']?.trim();
    const gameVersion = inputs['Game_version']?.trim();
    const translateVersion = inputs['Translate_version']?.trim();
    const developpeur = inputs['Developpeur']?.trim();

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

    // Version de la trad : [FR = Version de la trad]
    if (translateVersion) {
      titleParts.push(`[FR = ${translateVersion}]`);
    }

    // Développeur : [Développeur]
    if (developpeur) {
      titleParts.push(`[${developpeur}]`);
    }

    // On assemble le tout avec un espace
    const finalTitle = titleParts.join(' ');
    setPostTitle(finalTitle);

  }, [inputs['Game_name'], inputs['Game_version'], inputs['Translate_version'], inputs['Developpeur']]);

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

  // History management functions
  const addPublishedPost = (p: PublishedPost) => {
    setPublishedPosts(prev => [p, ...prev]); // Newest first
  };

  const updatePublishedPost = (id: string, updates: Partial<PublishedPost>) => {
    setPublishedPosts(prev => prev.map(post => post.id === id ? { ...post, ...updates } : post));
  };

  const deletePublishedPost = (id: string) => {
    setPublishedPosts(prev => prev.filter(post => post.id !== id));
  };

  // Fonction pour récupérer l'historique depuis l'API (Koyeb = backup des 1000 derniers)
  async function fetchHistoryFromAPI() {
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
          // L'endpoint n'existe pas encore, on garde localStorage uniquement
          console.log('⚠️ Endpoint /api/history non disponible, utilisation de localStorage uniquement');
          return;
        }
        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (Array.isArray(data.posts) || Array.isArray(data)) {
        const koyebPosts = Array.isArray(data.posts) ? data.posts : data;

        // Récupérer l'historique local actuel
        const localPosts = publishedPosts;
        const localIds = new Set(localPosts.map(p => p.id));

        // Fusionner : Koyeb (backup récent) + localStorage (complet)
        // On ajoute seulement les posts de Koyeb qui ne sont pas déjà dans localStorage
        const newPostsFromKoyeb = koyebPosts.filter((p: any) => {
          // Vérifier par thread_id et message_id pour éviter les doublons même si l'ID local diffère
          const koyebThreadId = p.thread_id || p.threadId;
          const koyebMessageId = p.message_id || p.messageId;

          return !localPosts.some(local =>
            (local.threadId === koyebThreadId && local.messageId === koyebMessageId) ||
            local.id === p.id
          );
        });

        if (newPostsFromKoyeb.length > 0) {
          // Ajouter les nouveaux posts de Koyeb au début (plus récents)
          setPublishedPosts(prev => {
            const merged = [...newPostsFromKoyeb, ...prev].sort((a, b) => b.timestamp - a.timestamp);
            return merged;
          });
          console.log(`✅ ${newPostsFromKoyeb.length} nouveaux posts récupérés depuis Koyeb (backup)`);
        } else {
          console.log('✅ Historique synchronisé : aucun nouveau post depuis Koyeb');
        }
      }
    } catch (e: any) {
      console.error('❌ Erreur lors de la récupération de l\'historique depuis Koyeb:', e);
      // Ne pas bloquer l'utilisateur, on garde localStorage uniquement
      // Koyeb est juste un backup, localStorage est la source principale
    }
  }

  async function publishPost() {
    const title = (postTitle || '').trim();
    const content = preview || '';
    const tags = postTags || '';
    const templateType = (templates[currentTemplateIdx]?.type) || '';
    const isEditMode = editingPostId !== null && editingPostData !== null;

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
        context: 'Veuillez configurer l\'URL Koyeb dans Configuration API',
        httpStatus: 500
      });
      return { ok: false, error: 'missing_api_url' };
    }

    if (templateType !== 'my' && templateType !== 'partner') {
      setLastPublishResult('❌ Seuls les templates "Mes traductions" et "Traductions partenaire" peuvent être publiés');
      showErrorModal({
        code: 'VALIDATION_ERROR',
        message: 'Type de template invalide',
        context: 'Seuls les templates "Mes traductions" et "Traductions partenaire" peuvent être publiés',
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
        traductor: inputs['Traductor'] || '',
        translation_type: translationType || '',
        is_integrated: isIntegrated,
        etat: tags || '',
        timestamp: Date.now()
      };


      const formData = new FormData();
      formData.append('title', title);
      formData.append('content', content);
      formData.append('tags', tags);
      formData.append('template', templateType);

      // ✅ NOUVEAU : Ajouter les métadonnées encodées en base64 (UTF-8)
      // Schéma cohérent avec publisher_api.py / bot_server1.py
      formData.append('metadata', b64EncodeUtf8(JSON.stringify(metadata)));

      if (isEditMode && editingPostData) {
        formData.append('threadId', editingPostData.threadId);
        formData.append('messageId', editingPostData.messageId);
        formData.append('isUpdate', 'true');
        console.log('🔄 Mode édition activé:', {
          threadId: editingPostData.threadId,
          messageId: editingPostData.messageId
        });
      }

      // Traitement des images (code existant inchangé)
      if (uploadedImages.length > 0) {
        const images = [];
        for (const img of uploadedImages) {
          if (!img.path) continue;
          try {
            const imgResult = await tauriAPI.readImage(img.path);
            if (imgResult.ok && imgResult.buffer) {
              const buffer = new Uint8Array(imgResult.buffer);
              let base64 = '';
              const chunkSize = 8192;
              for (let i = 0; i < buffer.length; i += chunkSize) {
                const chunk = buffer.slice(i, i + chunkSize);
                base64 += String.fromCharCode(...chunk);
              }
              base64 = btoa(base64);
              const ext = (img.path.split('.').pop() || 'png').toLowerCase();
              const mimeTypes: Record<string, string> = {
                'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                'png': 'image/png', 'gif': 'image/gif',
                'webp': 'image/webp', 'avif': 'image/avif',
                'bmp': 'image/bmp', 'svg': 'image/svg+xml',
                'ico': 'image/x-icon', 'tiff': 'image/tiff', 'tif': 'image/tiff'
              };
              const mimeType = mimeTypes[ext] || 'image/' + ext;
              images.push({
                dataUrl: `data:${mimeType};base64,${base64}`,
                filename: img.path.split('_').slice(2).join('_'),
                isMain: img.isMain
              });
            }
          } catch (e) {
            console.error('Failed to read image:', img.path, e);
          }
        }
        if (images.length > 0) {
          for (let i = 0; i < images.length; i++) {
            const img = images[i];
            if (!img.dataUrl) continue;

            const parts = img.dataUrl.split(',');
            const meta = parts[0] || '';
            const data = parts[1] || '';
            const m = meta.match(/data:([^;]+);/);
            const contentType = m ? m[1] : 'application/octet-stream';
            const buffer = Uint8Array.from(atob(data), c => c.charCodeAt(0));
            const blob = new Blob([buffer], { type: contentType });
            formData.append(`image_${i}`, blob, img.filename || `image_${i}.png`);

            if (img.isMain) {
              formData.append('main_image_index', String(i));
            }
          }
        }
      }

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
      const forumId = res.forum_id || res.forumId || (templateType === 'my' ? 1427703869844230317 : 1427703869844230318);

      if (threadId && messageId) {
        if (isEditMode && editingPostId) {
          const updatedPost: Partial<PublishedPost> = {
            timestamp: Date.now(),
            title,
            content,
            tags,
            template: templateType,
            imagePath: uploadedImages.find(i => i.isMain)?.path,
            translationType,
            isIntegrated,
            savedInputs: { ...inputs },
            savedLinkConfigs: JSON.parse(JSON.stringify(linkConfigs)),
            templateId: templates[currentTemplateIdx]?.id,
            discordUrl: threadUrl || editingPostData.discordUrl
          };
          updatePublishedPost(editingPostId, updatedPost);
          setEditingPostId(null);
          setEditingPostData(null);
          console.log('✅ Post mis à jour dans l\'historique:', updatedPost);
        } else {
          const newPost: PublishedPost = {
            id: `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            title,
            content,
            tags,
            template: templateType,
            imagePath: uploadedImages.find(i => i.isMain)?.path,
            translationType,
            isIntegrated,
            savedInputs: { ...inputs },
            savedLinkConfigs: JSON.parse(JSON.stringify(linkConfigs)),
            templateId: templates[currentTemplateIdx]?.id,
            threadId: String(threadId),
            messageId: String(messageId),
            discordUrl: threadUrl,
            forumId: typeof forumId === 'number' ? forumId : parseInt(String(forumId)) || 0
          };
          addPublishedPost(newPost);
          console.log('✅ Nouveau post ajouté à l\'historique:', newPost);
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
    localStorage.setItem('customVariables', JSON.stringify(allVarsConfig));
  }, [allVarsConfig]);

  useEffect(() => {
    localStorage.setItem('savedTags', JSON.stringify(savedTags));
  }, [savedTags]);

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
    localStorage.setItem('savedInstructions', JSON.stringify(savedInstructions));
  }, [savedInstructions]);

  useEffect(() => {
    localStorage.setItem('savedTraductors', JSON.stringify(savedTraductors));
  }, [savedTraductors]);

  useEffect(() => {
    localStorage.setItem('uploadedImages', JSON.stringify(uploadedImages));
  }, [uploadedImages]);

  function addTemplate(t: Template) {
    setTemplates(prev => [...prev, t]);
  }
  function updateTemplate(idx: number, t: Template) {
    setTemplates(prev => { const copy = [...prev]; copy[idx] = t; return copy; });
  }
  function deleteTemplate(idx: number) {
    setTemplates(prev => { const copy = [...prev]; copy.splice(idx, 1); return copy; });
    setCurrentTemplateIdx(0);
  }

  function restoreDefaultTemplates() {
    setTemplates(defaultTemplates);
    setCurrentTemplateIdx(0);
    // Sauvegarder dans localStorage
    try {
      localStorage.setItem('customTemplates', JSON.stringify(defaultTemplates));
    } catch (e) {
      console.error('Erreur lors de la sauvegarde des templates par défaut:', e);
    }
  }

  function addVarConfig(v: VarConfig) {
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
    if (!config.value.trim()) return '';

    switch (config.source) {
      case 'F95':
        return `https://f95zone.to/threads/${config.value.trim()}/`;
      case 'Lewd':
        return `https://lewdcorner.com/threads/${config.value.trim()}/`;
      case 'Autre':
        return config.value.trim();
      default:
        return config.value.trim();
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
    setSavedTags(prev => [...prev, t]);
  }
  function deleteSavedTag(idx: number) {
    setSavedTags(prev => { const copy = [...prev]; copy.splice(idx, 1); return copy; });
  }

  // Instructions saved
  function saveInstruction(name: string, text: string) {
    setSavedInstructions(prev => ({ ...prev, [name]: text }));
  }
  function deleteInstruction(name: string) {
    setSavedInstructions(prev => { const copy = { ...prev }; delete copy[name]; return copy; });
  }

  // Traductors
  function saveTraductor(name: string) {
    setSavedTraductors(prev => prev.includes(name) ? prev : [...prev, name]);
  }
  function deleteTraductor(idx: number) {
    setSavedTraductors(prev => { const copy = [...prev]; copy.splice(idx, 1); return copy; });
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
    if (img?.path) {
      try {
        // Delete image file from filesystem
        await tauriAPI.deleteImage(img.path);
      } catch (e) {
        console.error('Failed to delete image:', e);
      }
    }
    setUploadedImages(prev => { const copy = [...prev]; copy.splice(idx, 1); if (copy.length && !copy.some(i => i.isMain)) copy[0].isMain = true; return copy; });
  }

  function setMainImage(idx: number) {
    setUploadedImages(prev => prev.map((i, s) => ({ ...i, isMain: s === idx })));
  }

  const resetAllFields = useCallback(() => {
    allVarsConfig.forEach(v => setInput(v.name, ''));
    setInput('instruction', '');
    setInput('is_modded_game', 'false');
    setInput('Mod_link', '');
    setInput('Developpeur', '');
    setPostTitle('');
    setPostTags('');
    setTranslationType('Automatique');
    setIsIntegrated(false);
    setLinkConfigs({
      Game_link: { source: 'F95', value: '' },
      Translate_link: { source: 'F95', value: '' },
      Mod_link: { source: 'F95', value: '' }
    });
    const imagesToRemove = [...uploadedImages];
    imagesToRemove.forEach(() => removeImage(0));
  }, [allVarsConfig, uploadedImages, setTranslationType, setIsIntegrated, setPostTitle, setPostTags, setLinkConfigs]);

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

    // 1. GESTION DU JEU MODÉ
    const isModded = (inputs as any)['is_modded_game'] === true || (inputs as any)['is_modded_game'] === 'true';
    const modLink = cleanGameLink((inputs['Mod_link'] || '').trim()); // ✅ Nettoyer le lien

    let moddedText = 'Non';
    if (isModded) {
      moddedText = modLink ? `Oui [Lien du mod](<${modLink}>)` : 'Oui';
    }

    // Remplace le tag [is_modded_game] dans le texte
    content = content.split('[is_modded_game]').join(moddedText);

    // 2. Remplacement des variables classiques
    allVarsConfig.forEach(varConfig => {
      const name = varConfig.name;
      // On ne traite pas ces deux là ici car gérés au dessus
      if (name === 'is_modded_game' || name === 'Mod_link') return;

      const val = (inputs[name] || '').trim();
      let finalVal = val;

      // Nettoyer les liens (Game_link, Translate_link) à la volée
      if (name === 'Game_link' || name === 'Translate_link') {
        finalVal = cleanGameLink(val);
      }

      if (name === 'Overview' && val) {
        const lines = val.split('\n').map(l => l.trim()).filter(Boolean);
        finalVal = lines.join('\n> ');

        const instructionContent = (inputs['instruction'] || '').trim();
        if (instructionContent) {
          const instructionLines = instructionContent.split('\n').map(l => l.trim()).filter(Boolean);
          const numberedInstructions = instructionLines.map((l, index) => `${index + 1}. ${l}`).join('\n');
          finalVal += '\n\n```Instructions d\'installation :\n' + numberedInstructions + '\n```';
        }
      }

      content = content.split('[' + name + ']').join(finalVal || '[' + name + ']');
    });

    // 3. Remplacement de [Translation_Type]
    const displayTranslationType = isIntegrated
      ? `${translationType} (Intégrée)`
      : translationType;
    content = content.split('[Translation_Type]').join(displayTranslationType);

    // 4. Logique Smart Integrated
    if (isIntegrated) {
      content = content.replace(/^.*\[Translate_link\].*$/gm, '');
      content = content.replace(/^.*\*\s*\*\*Lien de la [Tt]raduction\s*:\s*\*\*.*$/gm, '');
      content = content.replace(/\n\n\n+/g, '\n\n');
    }

    // Nettoyage final du tag instruction
    content = content.split('[instruction]').join('');

    return content;
  }, [templates, currentTemplateIdx, allVarsConfig, inputs, translationType, isIntegrated]);

  const value: AppContextValue = {
    resetAllFields,
    linkConfigs,
    setLinkConfig,
    setLinkConfigs,
    templates,
    importFullConfig,
    addTemplate,
    updateTemplate,
    deleteTemplate,
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
    preview,
    savedTags,
    addSavedTag,
    deleteSavedTag,

    savedInstructions,
    saveInstruction,
    deleteInstruction,

    savedTraductors,
    saveTraductor,
    deleteTraductor,

    uploadedImages,
    addImages,
    addImageFromPath,
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

    // Rate limit protection
    rateLimitCooldown,

    // Edit mode
    editingPostId,
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
            Translate_link: { source: 'F95', value: post.savedInputs.Translate_link || '' },
            Mod_link: { source: 'F95', value: post.savedInputs.Mod_link || '' }
          });
        }
      }

      // ✅ Restaurer l'image si elle existe encore
      if (post.imagePath) {
        // Vérifier si l'image existe dans le dossier images/
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

      // Restaurer le template utilisé
      if (post.templateId) {
        const templateIdx = templates.findIndex(t => t.id === post.templateId);
        if (templateIdx !== -1) {
          setCurrentTemplateIdx(templateIdx);
        } else {
          const templateIdxByType = templates.findIndex(t => t.type === post.template);
          if (templateIdxByType !== -1) setCurrentTemplateIdx(templateIdxByType);
        }
      } else {
        const templateIdx = templates.findIndex(t => t.type === post.template);
        if (templateIdx !== -1) setCurrentTemplateIdx(templateIdx);
      }
    },
    loadPostForDuplication: (post: PublishedPost) => {
      setEditingPostId(null);
      setEditingPostData(null);
      setPostTitle(post.title);
      setPostTags(post.tags);
      const templateIdx = templates.findIndex(t => t.type === post.template);
      if (templateIdx !== -1) setCurrentTemplateIdx(templateIdx);
    },

    // API status global
    apiStatus,
    setApiStatus,

    // Discord config global
    discordConfig,
    setDiscordConfig
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
