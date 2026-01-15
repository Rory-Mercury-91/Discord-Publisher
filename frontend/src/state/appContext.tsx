import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import ErrorModal from '../components/ErrorModal';
import { useDebounce } from '../hooks/useDebounce';
import { tauriAPI } from '../lib/tauri-api';
import { logger } from '../lib/logger';

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

export type Tag = { name: string; id?: string; template?: string };

export type PublishedPost = {
  id: string;              // UUID local
  timestamp: number;       // Date publication
  title: string;           // Titre du post
  content: string;         // Contenu complet
  tags: string;            // Tags CSV
  template: string;        // "my" ou "partner"
  imagePath?: string;      // Chemin image locale (si utilisée)
  
  // Données Discord (reçues après publication)
  threadId: string;        // ID du thread forum
  messageId: string;       // ID du premier message
  discordUrl: string;      // https://discord.com/channels/...
  forumId: number;         // FORUM_MY_ID ou FORUM_PARTNER_ID
};

const defaultVarsConfig: VarConfig[] = [
  {name: 'Name_game', label: 'Nom du jeu', placeholder: 'Lost Solace'},
  {name: 'Game_version', label: 'Version du jeu', placeholder: 'v0.1'},
  {name: 'Translate_version', label: 'Version de la traduction', placeholder: 'v0.1'},
  {name: 'Game_link', label: 'Lien du jeu', placeholder: 'https://...'},
  {name: 'Translate_link', label: 'Lien de la traduction', placeholder: 'https://...'},
  {name: 'traductor', label: 'Traducteur', placeholder: 'Rory Mercury 91', hasSaveLoad: true},
  {name: 'overview', label: 'Synopsis', placeholder: 'Synopsis du jeu...', type: 'textarea'}
];

const defaultTemplates: Template[] = [
  {
    id: 'mes',
    name: 'Mes traductions',
    type: 'my',
    content: `## :flag_fr: [game_name] est disponible en français ! :tada:

Salut l'équipe ! Le patch est enfin prêt, vous pouvez l'installer dès maintenant pour profiter du titre dans notre langue. Bon jeu à tous ! :point_down:

### :computer: Infos du Mod & Liens de Téléchargement
* **Titre du jeu :** [game_name]
* **Version du jeu :** [game_version]
* **Version traduite :** [translate_version]
* **Lien du jeu (VO) :** [Accès au jeu original]([game_link])
* **Lien de la Traduction :** [Téléchargez la traduction FR ici !]([translate_link])
> **Synopsis du jeu :**
> [overview]
[instruction]
### :sparkling_heart: Soutenez le Traducteur !
Pour m'encourager et soutenir mes efforts :
* **Soutien au Traducteur (Moi !) :** [Offrez-moi un café pour le temps passé !](https://discord.com/channels/1417811606674477139/1433930090349330493)`
  },
  {
    id: 'partenaire',
    name: 'Traductions partenaire',
    type: 'partner',
    content: `## :flag_fr: [game_name] est disponible en français ! :tada:

Salut l'équipe ! Le patch est enfin prêt, vous pouvez l'installer dès maintenant pour profiter du titre dans notre langue. Bon jeu à tous ! :point_down:

### :computer: Infos du Mod & Liens de Téléchargement
* **Traducteur :** [translator]
* **Titre du jeu :** [game_name]
* **Version du jeu :** [game_version]
* **Version traduite :** [translate_version]
* **Lien du jeu (VO) :** [Accès au jeu original]([game_link])
* **Lien de la Traduction :** [Téléchargez la traduction FR ici !]([translate_link])
> **Synopsis du jeu :**
> [overview]
[instruction]`
  }
];

type AppContextValue = {
  templates: Template[];
  addTemplate: (t: Template) => void;
  updateTemplate: (idx: number, t: Template) => void;
  deleteTemplate: (idx: number) => void;
  currentTemplateIdx: number;
  setCurrentTemplateIdx: (n: number) => void;
  allVarsConfig: VarConfig[];
  addVarConfig: (v: VarConfig) => void;
  updateVarConfig: (idx: number, v: VarConfig) => void;
  deleteVarConfig: (idx: number) => void;
  inputs: Record<string, string>;
  setInput: (name: string, value: string) => void;
  preview: string;
  savedTags: Tag[];
  addSavedTag: (t: Tag) => void;
  deleteSavedTag: (idx: number) => void;

  savedInstructions: Record<string,string>;
  saveInstruction: (name:string, text:string) => void;
  deleteInstruction: (name:string) => void;

  savedTraductors: string[];
  saveTraductor: (name:string) => void;
  deleteTraductor: (idx:number) => void;

  uploadedImages: Array<{id:string,path:string,isMain:boolean}>;
  addImages: (files: FileList | File[]) => void;
  removeImage: (idx:number) => void;
  setMainImage: (idx:number) => void;

  // Post & API
  postTitle: string;
  setPostTitle: (s:string) => void;
  postTags: string;
  setPostTags: (s:string) => void;

  apiUrl: string;
  publishInProgress: boolean;
  lastPublishResult: string | null;
  publishPost: () => Promise<{ok:boolean, data?:any, error?:string}>;

  // Error handling
  showErrorModal: (error: {code?: string | number; message: string; context?: string; httpStatus?: number; discordError?: any}) => void;

  // History
  publishedPosts: PublishedPost[];
  addPublishedPost: (p: PublishedPost) => void;
  updatePublishedPost: (id: string, p: Partial<PublishedPost>) => void;
  deletePublishedPost: (id: string) => void;

  // Edit mode
  editingPostId: string | null;
  setEditingPostId: (id: string | null) => void;
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

export function AppProvider({children}: {children: React.ReactNode}){
      // Discord config global
      const [discordConfig, setDiscordConfig] = useState<any>(() => {
        try {
          const raw = localStorage.getItem('discordConfig');
          if(raw) return JSON.parse(raw);
        } catch {}
        return {};
      });
    // API status global
    const [apiStatus, setApiStatus] = useState<string>("unknown");
  const [templates, setTemplates] = useState<Template[]>(() => {
    try{
      const raw = localStorage.getItem('customTemplates');
      if(raw) return JSON.parse(raw);
    }catch(e){}
    return defaultTemplates;
  });

  const [allVarsConfig, setAllVarsConfig] = useState<VarConfig[]>(() => {
    try{
      const raw = localStorage.getItem('customVariables');
      if(raw) {
        const vars = JSON.parse(raw);
        // Migration: supprimer l'ancienne variable install_instructions qui est remplacée par le système d'instructions
        return vars.filter((v: VarConfig) => v.name !== 'install_instructions');
      }
    }catch(e){}
    return defaultVarsConfig;
  });

  const [currentTemplateIdx, setCurrentTemplateIdx] = useState<number>(0);

  const [inputs, setInputs] = useState<Record<string,string>>(() => {
    // load some defaults from localStorage if present
    const obj: Record<string,string> = {};
    allVarsConfig.forEach(v => obj[v.name] = '');
    try{
      const raw = localStorage.getItem('savedInputs');
      if(raw){
        const parsed = JSON.parse(raw);
        Object.assign(obj, parsed);
      }
    }catch(e){}
    return obj;
  });

  const [savedInstructions, setSavedInstructions] = useState<Record<string,string>>(() => {
    try{ const raw = localStorage.getItem('savedInstructions'); if(raw) return JSON.parse(raw); }catch(e){}
    return {};
  });

  const [savedTraductors, setSavedTraductors] = useState<string[]>(() => {
    try{ const raw = localStorage.getItem('savedTraductors'); if(raw) return JSON.parse(raw); }catch(e){}
    return [];
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

  const showErrorModal = (error: {code?: string | number; message: string; context?: string; httpStatus?: number; discordError?: any}) => {
    setErrorModalData({
      ...error,
      timestamp: Date.now()
    });
  };

  const [uploadedImages, setUploadedImages] = useState<Array<{id:string,path:string,isMain:boolean}>>(() => {
    try{ 
      const raw = localStorage.getItem('uploadedImages'); 
      if(raw) {
        const parsed = JSON.parse(raw);
        // Migration: convert old dataUrl format to new path format
        if(parsed.length > 0 && parsed[0].dataUrl) {
          return []; // Reset old format images
        }
        return parsed;
      }
    }catch(e){}
    return [];
  });

  const [savedTags, setSavedTags] = useState<Tag[]>(() => {
    try{ const raw = localStorage.getItem('savedTags'); if(raw) return JSON.parse(raw); }catch(e){}
    return [];
  });

  // Post fields and API configuration
  const [postTitle, setPostTitle] = useState<string>(() => {
    try{ const raw = localStorage.getItem('postTitle'); return raw || ''; }catch(e){ return ''; }
  });
  const [postTags, setPostTags] = useState<string>(() => {
    try{ const raw = localStorage.getItem('postTags'); return raw || ''; }catch(e){ return ''; }
  });

  // API Configuration - URL is now hardcoded for local API
  const apiUrl = 'http://localhost:8080/api/forum-post';

  const [publishInProgress, setPublishInProgress] = useState<boolean>(false);
  const [lastPublishResult, setLastPublishResult] = useState<string | null>(null);

  // Published posts history
  const [publishedPosts, setPublishedPosts] = useState<PublishedPost[]>(() => {
    try{ 
      const raw = localStorage.getItem('publishedPosts'); 
      if(raw) return JSON.parse(raw);
    }catch(e){}
    return [];
  });

  // Edit mode
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostData, setEditingPostData] = useState<PublishedPost | null>(null);

  useEffect(()=>{ localStorage.setItem('postTitle', postTitle); },[postTitle]);
  useEffect(()=>{ localStorage.setItem('postTags', postTags); },[postTags]);

  // Envoyer la configuration Discord à l'API au démarrage
  useEffect(() => {
    const sendConfigToAPI = async () => {
      try {
        const configStr = localStorage.getItem('discordConfig');
        if (!configStr) return;
        
        const discordConfig = JSON.parse(configStr);
        if (!discordConfig.discordPublisherToken) return;
        
        // FIX: URL correcte pour l'API locale
        const response = await fetch('http://localhost:8080/api/configure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(discordConfig)
        });
        
        if (response.ok) {
          console.log('✅ Configuration Discord envoyée à l\'API');
        } else {
          console.warn('⚠️ Échec de l\'envoi de la configuration à l\'API');
        }
      } catch (error) {
        console.error('❌ Erreur lors de l\'envoi de la configuration:', error);
      }
    };
    
    const timer = setTimeout(sendConfigToAPI, 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(()=>{
    localStorage.setItem('customTemplates', JSON.stringify(templates));
  },[templates]);

  useEffect(()=>{
    localStorage.setItem('publishedPosts', JSON.stringify(publishedPosts));
  },[publishedPosts]);

  // History management functions
  const addPublishedPost = (p: PublishedPost) => {
    setPublishedPosts(prev => [p, ...prev]); // Newest first
  };

  const updatePublishedPost = (id: string, updates: Partial<PublishedPost>) => {
    setPublishedPosts(prev => prev.map(post => post.id === id ? {...post, ...updates} : post));
  };

  const deletePublishedPost = (id: string) => {
    setPublishedPosts(prev => prev.filter(post => post.id !== id));
  };

  async function publishPost(){
    // Build and send a multipart/form-data request to apiUrl
    const title = (postTitle || '').trim(); // Uniquement le champ "Titre du post"
    const content = preview || '';
    const tags = postTags || '';
    const templateType = (templates[currentTemplateIdx]?.type) || '';
    const isEditMode = editingPostId !== null && editingPostData !== null;

    // Log début de publication
    await logger.publish('Démarrage', {
      isEditMode,
      title,
      templateType,
      tagsCount: tags.split(',').filter(t => t.trim()).length,
      imagesCount: uploadedImages.length,
      contentLength: content.length
    });

    // Validation: titre obligatoire (uniquement postTitle)
    if(!title || title.length === 0){ 
      await logger.error('Validation échouée: Titre manquant');
      setLastPublishResult('❌ Titre obligatoire');
      showErrorModal({
        code: 'VALIDATION_ERROR',
        message: 'Le titre du post est obligatoire',
        context: 'Validation avant publication',
        httpStatus: 400
      });
      return {ok:false, error:'missing_title'}; 
    }
    
    // Validation: API endpoint requis (should always be available locally)
    if(!apiUrl || apiUrl.trim().length === 0){ 
      await logger.error('Validation échouée: URL API manquante');
      setLastPublishResult('❌ Erreur interne : URL API manquante');
      showErrorModal({
        code: 'CONFIG_ERROR',
        message: 'Erreur interne : L\'URL de l\'API locale est manquante',
        context: 'Configuration interne',
        httpStatus: 500
      });
      return {ok:false, error:'missing_api_url'}; 
    }
    
    // Validation: template type obligatoire (my/partner uniquement)
    if(templateType !== 'my' && templateType !== 'partner') {
      await logger.error('Validation échouée: Type de template invalide', {templateType});
      setLastPublishResult('❌ Seuls les templates "Mes traductions" et "Traductions partenaire" peuvent être publiés');
      showErrorModal({
        code: 'VALIDATION_ERROR',
        message: 'Type de template invalide',
        context: 'Seuls les templates "Mes traductions" et "Traductions partenaire" peuvent être publiés',
        httpStatus: 400
      });
      return {ok:false, error:'invalid_template_type'};
    }

    setPublishInProgress(true);
    setLastPublishResult(null);

    try{
      await logger.info('Préparation du payload');
      const mainPayload: any = { title, content, tags, template: templateType };
      
      // Add edit mode info if updating
      if(isEditMode) {
        mainPayload.threadId = editingPostData.threadId;
        mainPayload.messageId = editingPostData.messageId;
        mainPayload.isUpdate = true;
        await logger.info('Mode édition activé', {
          threadId: editingPostData.threadId,
          messageId: editingPostData.messageId
        });
      }
      
      // Process all images (not just main image)
      if(uploadedImages.length > 0) {
        await logger.info(`Traitement de ${uploadedImages.length} image(s)`);
        const images = [];
        for(const img of uploadedImages) {
          if(!img.path) continue;
          try {
            // Read image from filesystem
            const imgResult = await tauriAPI.readImage(img.path);
            if(imgResult.ok && imgResult.buffer) {
              // Convert array back to Uint8Array then to base64
              const buffer = new Uint8Array(imgResult.buffer);
              const base64 = btoa(String.fromCharCode(...buffer));
              const ext = (img.path.split('.').pop() || 'png').toLowerCase();
              // Support for all modern image formats
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
                filename: img.path.split('_').slice(2).join('_'), // Remove timestamp prefix
                isMain: img.isMain
              });
            }
          } catch(e) {
            console.error('Failed to read image:', img.path, e);
          }
        }
        if(images.length > 0) {
          mainPayload.images = images;
          await logger.info(`${images.length} image(s) traitée(s) avec succès`);
        }
      }

      await logger.api('POST', '/api/publish', mainPayload);
      const res = await tauriAPI.publishPost(mainPayload);
      
      await logger.info('Réponse de l\'API reçue', {
        ok: res.ok,
        status: res.status,
        hasData: !!res.data,
        error: res.error
      });
      
      if(!res.ok){ 
        setLastPublishResult('Erreur interne');
        showErrorModal({
          code: 'INTERNAL_ERROR',
          message: 'Impossible de communiquer avec l\'API locale',
          context: 'Communication IPC avec le processus principal',
          httpStatus: 500
        });
        return {ok:false, error:'internal'}; 
      }
      if(!res.ok){ 
        setLastPublishResult('Erreur API: '+(res.error||'unknown'));
        
        // Special handling for network errors - API not accessible
        const isNetworkError = !res.status || res.status === 0 || 
                              (res.error && (res.error.includes('fetch') || res.error.includes('network')));
        
        showErrorModal({
          code: res.error || 'API_ERROR',
          message: isNetworkError 
            ? 'L\'API locale n\'est pas accessible. Vérifiez que l\'application s\'est lancée correctement.' 
            : (res.error || 'Erreur inconnue'),
          context: isEditMode ? 'Mise à jour du post Discord' : 'Publication du post Discord',
          httpStatus: res.status || 0,
          discordError: res.data
        });
        return {ok:false, error:res.error};
      }
      
      // Build success message with rate limit info
      let successMsg = isEditMode ? 'Mise à jour réussie' : 'Publication réussie';
      if(res.rateLimit?.remaining !== null && res.rateLimit?.limit !== null) {
        successMsg += ` (${res.rateLimit?.remaining ?? 0}/${res.rateLimit?.limit ?? 0} requêtes restantes)`;
      }
      setLastPublishResult(successMsg);
      
      await logger.success('Publication terminée', {
        threadId: res.data?.thread_id,
        messageId: res.data?.message_id,
        discordUrl: res.data?.thread_url || res.data?.url,
        rateLimit: res.rateLimit
      });
      
      // Save to history or update existing post
      if(res.data && res.data.thread_id && res.data.message_id) {
        if(isEditMode && editingPostId) {
          // Update existing post in history
          const updatedPost: Partial<PublishedPost> = {
            timestamp: Date.now(), // Update timestamp
            title,
            content,
            tags,
            template: templateType,
            imagePath: uploadedImages.find(i=>i.isMain)?.path,
            discordUrl: res.data.thread_url || res.data.url || editingPostData.discordUrl
          };
          updatePublishedPost(editingPostId, updatedPost);
          
          // Clear edit mode
          setEditingPostId(null);
          setEditingPostData(null);
        } else {
          // Add new post to history
          const newPost: PublishedPost = {
            id: `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            title,
            content,
            tags,
            template: templateType,
            imagePath: uploadedImages.find(i=>i.isMain)?.path,
            threadId: res.data.thread_id,
            messageId: res.data.message_id,
            discordUrl: res.data.thread_url || res.data.url || '',
            forumId: res.data.forum_id || 0
          };
          addPublishedPost(newPost);
        }
      }
      
      return {ok:true, data: res.data};
    }catch(e:any){
      await logger.error('Exception lors de la publication', e);
      setLastPublishResult('Erreur envoi: '+String(e?.message || e));
      showErrorModal({
        code: 'NETWORK_ERROR',
        message: String(e?.message || e),
        context: 'Exception lors de la publication',
        httpStatus: 0
      });
      return {ok:false, error: String(e?.message || e)};
    }finally{
      setPublishInProgress(false);
    }
  }


  useEffect(()=>{
    localStorage.setItem('customVariables', JSON.stringify(allVarsConfig));
  },[allVarsConfig]);

  useEffect(()=>{
    localStorage.setItem('savedTags', JSON.stringify(savedTags));
  },[savedTags]);

  useEffect(()=>{
    localStorage.setItem('savedInputs', JSON.stringify(inputs));
  },[inputs]);

  useEffect(()=>{
    localStorage.setItem('savedInstructions', JSON.stringify(savedInstructions));
  },[savedInstructions]);

  useEffect(()=>{
    localStorage.setItem('savedTraductors', JSON.stringify(savedTraductors));
  },[savedTraductors]);

  useEffect(()=>{
    localStorage.setItem('uploadedImages', JSON.stringify(uploadedImages));
  },[uploadedImages]);

  function addTemplate(t: Template){
    setTemplates(prev => [...prev, t]);
  }
  function updateTemplate(idx:number, t:Template){
    setTemplates(prev => { const copy = [...prev]; copy[idx]=t; return copy; });
  }
  function deleteTemplate(idx:number){
    setTemplates(prev => { const copy = [...prev]; copy.splice(idx,1); return copy; });
    setCurrentTemplateIdx(0);
  }

  function addVarConfig(v: VarConfig){
    setAllVarsConfig(prev => [...prev, {...v, isCustom: true}]);
  }
  function updateVarConfig(idx: number, v: VarConfig){
    setAllVarsConfig(prev => { const copy = [...prev]; copy[idx] = {...v, isCustom: copy[idx].isCustom}; return copy; });
  }
  function deleteVarConfig(idx: number){
    const varName = allVarsConfig[idx]?.name;
    setAllVarsConfig(prev => { const copy = [...prev]; copy.splice(idx, 1); return copy; });
    // Nettoyer l'input associé
    if(varName){
      setInputs(prev => { const copy = {...prev}; delete copy[varName]; return copy; });
    }
  }

  function setInput(name:string, value:string){
    setInputs(prev => ({...prev, [name]: value}));
  }

  function addSavedTag(t:Tag){
    setSavedTags(prev => [...prev, t]);
  }
  function deleteSavedTag(idx:number){
    setSavedTags(prev => { const copy = [...prev]; copy.splice(idx,1); return copy; });
  }

  // Instructions saved
  function saveInstruction(name:string, text:string){
    setSavedInstructions(prev => ({...prev, [name]: text}));
  }
  function deleteInstruction(name:string){
    setSavedInstructions(prev => { const copy = {...prev}; delete copy[name]; return copy; });
  }

  // Traductors
  function saveTraductor(name:string){
    setSavedTraductors(prev => prev.includes(name) ? prev : [...prev, name]);
  }
  function deleteTraductor(idx:number){
    setSavedTraductors(prev => { const copy = [...prev]; copy.splice(idx,1); return copy; });
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

  async function addImages(files: FileList | File[]){
    const fileArray = Array.from(files as any) as File[];
    for(const file of fileArray) {
      if(!file.type.startsWith('image/')) continue;
      try {
        // Compresser l'image si nécessaire
        const processedFile = await compressImage(file);
        
        // Save image to filesystem via IPC
        const result = await tauriAPI.saveImage((processedFile as any).path || (file as any).path);
        if(result.ok && result.fileName) {
          setUploadedImages(prev => {
            const next = [...prev, {id: Date.now().toString(), path: result.fileName, isMain: prev.length===0}];
            return next;
          });
        }
      } catch(e) {
        console.error('Failed to save image:', e);
      }
    }
  }

  async function removeImage(idx:number){
    const img = uploadedImages[idx];
    if(img?.path) {
      try {
        // Delete image file from filesystem
        await tauriAPI.deleteImage(img.path);
      } catch(e) {
        console.error('Failed to delete image:', e);
      }
    }
    setUploadedImages(prev => { const copy = [...prev]; copy.splice(idx,1); if(copy.length && !copy.some(i=>i.isMain)) copy[0].isMain = true; return copy; });
  }

  function setMainImage(idx:number){
    setUploadedImages(prev => prev.map((i,s) => ({...i, isMain: s===idx})));
  }

  // Debounce des inputs pour éviter de recalculer le preview à chaque frappe
  const debouncedInputs = useDebounce(inputs, 300);
  const debouncedCurrentTemplateIdx = useDebounce(currentTemplateIdx, 100);

  const preview = useMemo(()=>{
    const tpl = templates[debouncedCurrentTemplateIdx];
    if(!tpl) return '';
    const format = (tpl as any).format || 'markdown';

    let content = tpl.content;

    // Replace variables
    allVarsConfig.forEach(varConfig => {
      const name = varConfig.name;
      const val = (debouncedInputs[name] || '').trim();
      let finalVal = val;
      if(format === 'markdown' && name === 'overview' && val){
        const lines = val.split('\n').map(l=>l.trim()).filter(Boolean);
        finalVal = lines.join('\n> ');
        
        // Inject instructions right after overview if present
        const instructionContent = (debouncedInputs['instruction'] || '').trim();
        if(instructionContent) {
          finalVal += '\n\n**Instructions d\'installation :**\n' + instructionContent.split('\n').map(l => l.trim()).filter(Boolean).map(l => '* ' + l).join('\n');
        }
      }
      content = content.split('['+name+']').join(finalVal || '['+name+']');
    });

    // Remove [instruction] placeholder if not already replaced within overview
    content = content.split('[instruction]').join('');

    return content;
  }, [templates, debouncedCurrentTemplateIdx, allVarsConfig, debouncedInputs]);

  const value: AppContextValue = {
    templates,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    currentTemplateIdx,
    setCurrentTemplateIdx,
    allVarsConfig,
    addVarConfig,
    updateVarConfig,
    deleteVarConfig,
    inputs,
    setInput,
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

    // Edit mode
    editingPostId,
    setEditingPostId,
    loadPostForEditing: (post: PublishedPost) => {
      setEditingPostId(post.id);
      setEditingPostData(post);
      setPostTitle(post.title);
      setPostTags(post.tags);
      const templateIdx = templates.findIndex(t => t.type === post.template);
      if(templateIdx !== -1) setCurrentTemplateIdx(templateIdx);
    },
    loadPostForDuplication: (post: PublishedPost) => {
      setEditingPostId(null);
      setEditingPostData(null);
      setPostTitle(post.title);
      setPostTags(post.tags);
      const templateIdx = templates.findIndex(t => t.type === post.template);
      if(templateIdx !== -1) setCurrentTemplateIdx(templateIdx);
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

export function useApp(){
  const ctx = useContext(AppContext);
  if(!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
