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
  /** URL canonique complète (F95/Lewd) ou URL brute (Autre) */
  value: string;
};

export type AdditionalTranslationLink = {
  label: string;
  link: string;
};

export type TagType = 'translator' | 'translationType' | 'gameStatus' | 'sites' | 'other';

export type Tag = {
  name: string;
  id?: string;
  /** Type de tag : 'translator' pour les traducteurs, ou une catégorie pour les tags génériques */
  tagType: TagType;
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
  imagePath?: string;
  translationType?: string;
  isIntegrated?: boolean;
  threadId: string;
  messageId: string;
  discordUrl: string;
  forumId: number;

  // Données pour ré-édition complète
  savedInputs?: Record<string, string>;
  savedLinkConfigs?: {
    Game_link: LinkConfig;
    Translate_link: LinkConfig;
    Mod_link: LinkConfig;
  };
  savedAdditionalTranslationLinks?: AdditionalTranslationLink[];
  /** Liens additionnels mod (affichés si mod compatible) */
  savedAdditionalModLinks?: AdditionalTranslationLink[];
  /** ID Discord de l'auteur du post (pour droits d'édition) */
  authorDiscordId?: string;
  /** Post dans l'onglet Archive (synchronisé Supabase is_archived) */
  archived?: boolean;
};

export type AppContextValue = {
  resetAllFields: () => void;
  templates: Template[];
  updateTemplate: (idx: number, t: Template) => void;
  restoreDefaultTemplates: () => void;
  currentTemplateIdx: number;
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

  uploadedImages: Array<{ id: string, url?: string, name: string, isMain: boolean }>;
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
  publishPost: (authorDiscordId?: string, options?: { silentUpdate?: boolean }) => Promise<{ ok: boolean, data?: any, error?: string }>;

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

  additionalTranslationLinks: AdditionalTranslationLink[];
  addAdditionalTranslationLink: () => void;
  updateAdditionalTranslationLink: (index: number, link: AdditionalTranslationLink) => void;
  deleteAdditionalTranslationLink: (index: number) => void;

  additionalModLinks: AdditionalTranslationLink[];
  addAdditionalModLink: () => void;
  updateAdditionalModLink: (index: number, link: AdditionalTranslationLink) => void;
  deleteAdditionalModLink: (index: number) => void;

  apiStatus: string;
  setApiStatus: (status: string) => void;
  discordConfig: any;
  setDiscordConfig: (config: any) => void;
  setApiBaseFromSupabase: (url: string | null) => void;

  instructionOwners: Record<string, string>;
};
