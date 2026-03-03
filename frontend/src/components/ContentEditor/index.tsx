// frontend/src/components/ContentEditor/index.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCallback } from 'react';
import { useConfirm } from '../../hooks/useConfirm';
import { apiFetch } from '../../lib/api-helpers';
import { getSupabase } from '../../lib/supabase';
import { useApp } from '../../state/appContext';
import { useAuth } from '../../state/authContext';
import { useTranslatorSelector } from '../../state/hooks/useTranslatorSelector';
import ConfirmModal from '../Modals/ConfirmModal';
import { TagSelectorModal } from '../tags';
import { useToast } from '../shared/ToastProvider';

import { DISCORD_TAG_ALIASES } from '../tags/tags-modal-constants';
import CustomVarsSection from './components/CustomVarsSection';
import EditorHeader from './components/EditorHeader';
import GameLinkAndTranslationTypeSection from './components/GameLinkAndTranslationTypeSection';
import HeaderGridSection from './components/HeaderGridSection';
import InstructionsSection from './components/InstructionsSection';
import LinksSection from './components/LinksSection';
import PublishFooter from './components/PublishFooter';
import SynopsisSection from './components/SynopsisSection';
import VersionsSection from './components/VersionsSection';

/** Mappe le statut exporté (Tampermonkey / F95) vers la clé du tag "Statut du jeu". */
function statusExportToGameStatusKey(status: string): 'ongoing' | 'completed' | 'abandoned' | null {
  const k = (status || '').toUpperCase().trim();
  if (/EN COURS|ONGOING|IN PROGRESS|ACTIF/.test(k)) return 'ongoing';
  if (/TERMINÉ|TERMINE|COMPLET|COMPLETED|FINI/.test(k)) return 'completed';
  if (/ABANDONNÉ|ABANDONNE|ABANDONED/.test(k)) return 'abandoned';
  return null;
}

export default function ContentEditor() {
  const {
    allVarsConfig,
    inputs,
    setInput,
    postTitle,
    postTags,
    setPostTags,
    publishPost,
    publishInProgress,
    savedTags,
    savedInstructions,
    instructionOwners,
    templates,
    currentTemplateIdx,
    uploadedImages,
    addImageFromUrl,
    removeImage,
    editingPostId,
    editingPostData,
    setEditingPostId,
    setEditingPostData,
    rateLimitCooldown,
    resetAllFields,
    additionalTranslationLinks,
    addAdditionalTranslationLink,
    updateAdditionalTranslationLink,
    deleteAdditionalTranslationLink,
    additionalModLinks,
    addAdditionalModLink,
    updateAdditionalModLink,
    deleteAdditionalModLink,
    linkConfigs,
    setLinkConfig,
    buildFinalLink,
    translationType,
    setTranslationType,
    isIntegrated,
    setIsIntegrated,
    apiUrl,
  } = useApp();

  const { profile } = useAuth();
  const { showToast } = useToast();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  const {
    options: translatorOptions,
    selectedId: selectedTranslatorId,
    selectedKind: selectedTranslatorKind,
    translatorTagId,
    loaded: translatorLoaded,
    select: selectTranslator,
    selectByAuthor: selectTranslatorByAuthor,
  } = useTranslatorSelector(profile?.id);

  // États locaux
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [tagSelectorPosition, setTagSelectorPosition] = useState<{ top: number; left: number; width: number } | undefined>();
  const [instructionSearchQuery, setInstructionSearchQuery] = useState('');
  const [showInstructionSuggestions, setShowInstructionSuggestions] = useState(false);
  const [silentUpdateMode, setSilentUpdateMode] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState<string>('');
  const [translatingOverview, setTranslatingOverview] = useState(false);

  const overviewRef = useRef<HTMLTextAreaElement>(null);
  /** Données F95 importées (tags, status, type) pour les réutiliser dans l'export formulaire liste */
  const lastImportedF95Ref = useRef<{ tags: string[]; status: string; type: string }>({ tags: [], status: '', type: '' });

  // Restaurer lastImportedF95Ref depuis saved_inputs quand on charge un post pour édition
  useEffect(() => {
    const rawTags = inputs['_f95_tags'];
    const status = inputs['_f95_status'] ?? '';
    const type = inputs['_f95_type'] ?? '';
    if (rawTags != null || status || type) {
      let tags: string[] = [];
      if (typeof rawTags === 'string' && rawTags) {
        try {
          const parsed = JSON.parse(rawTags);
          tags = Array.isArray(parsed) ? parsed : [];
        } catch { /* ignore */ }
      }
      lastImportedF95Ref.current = { tags, status, type };
    }
  }, [inputs['_f95_tags'], inputs['_f95_status'], inputs['_f95_type']]);

  // Calculs
  const currentTemplate = templates[currentTemplateIdx];

  const selectedTagIds = useMemo(() =>
    postTags ? postTags.split(',').map(s => s.trim()).filter(Boolean) : [],
    [postTags]);

  const handleTranslateSynopsis = useCallback(async () => {
    const text = (inputs['Overview'] || '').trim();
    if (!text) return;
    const base = (localStorage.getItem('apiBase') || apiUrl || '').replace(/\/+$/, '');
    if (!base) {
      showToast('URL de l’API non configurée', 'error');
      return;
    }
    const apiKey = localStorage.getItem('apiKey') || '';
    if (!apiKey) {
      showToast('Clé API non configurée', 'error');
      return;
    }
    setTranslatingOverview(true);
    try {
      const res = await apiFetch(`${base}/api/translate`, apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, source_lang: 'en', target_lang: 'fr' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data?.error || 'Traduction échouée', 'error');
        return;
      }
      if (data.translated) {
        setInput('Overview', data.translated);
        showToast('Synopsis traduit (EN → FR)', 'success');
      }
    } catch (e) {
      showToast((e as Error)?.message || 'Erreur réseau', 'error');
    } finally {
      setTranslatingOverview(false);
    }
  }, [inputs['Overview'], apiUrl, setInput, showToast]);

  const hasRequiredTags = useMemo(() => {
    const hasSite = selectedTagIds.some(id =>
      savedTags.some(t => ((t.id || t.name) === id || String(t.discordTagId ?? '') === id) && t.tagType === 'sites')
    );
    const hasTranslationType = selectedTagIds.some(id =>
      savedTags.some(t => ((t.id || t.name) === id || String(t.discordTagId ?? '') === id) && t.tagType === 'translationType')
    );
    return hasSite && hasTranslationType;
  }, [selectedTagIds, savedTags]);

  const missingRequiredTagLabels = useMemo(() => {
    const labels: string[] = [];
    const hasSite = selectedTagIds.some(id =>
      savedTags.some(t => ((t.id || t.name) === id || String(t.discordTagId ?? '') === id) && t.tagType === 'sites')
    );
    const hasTranslationType = selectedTagIds.some(id =>
      savedTags.some(t => ((t.id || t.name) === id || String(t.discordTagId ?? '') === id) && t.tagType === 'translationType')
    );
    if (!hasSite) labels.push('Site');
    if (!hasTranslationType) labels.push('Type de traduction');
    return labels;
  }, [selectedTagIds, savedTags]);

  const canPublish = currentTemplate?.type === 'my' && rateLimitCooldown === null && hasRequiredTags;

  const publishTooltipText = (() => {
    if (publishInProgress) return 'Publication en cours…';
    if (currentTemplate?.type !== 'my') return 'Template en lecture seule';
    if (rateLimitCooldown !== null) return `Rate limit : patientez ${Math.ceil((rateLimitCooldown - Date.now()) / 1000)}s`;
    if (missingRequiredTagLabels.length > 0) return `Tags obligatoires manquants : ${missingRequiredTagLabels.join(', ')}`;
    return '';
  })();

  const varsUsedInTemplate = useMemo(() => {
    const content = currentTemplate?.content ?? '';
    const matches = content.matchAll(/\[([^\]]+)\]/g);
    const set = new Set<string>();
    for (const m of matches) set.add((m[1] as string).trim());

    // Cas spéciaux pour les lignes de liens multiples
    if (content.includes('[TRANSLATION_LINKS_LINE]')) set.add('Translate_link');
    if (content.includes('[MOD_LINKS_LINE]')) set.add('Mod_link');

    return set;
  }, [currentTemplate?.content]);

  const visibleVars = useMemo(() => {
    const hardcoded = ['Game_name', 'Game_version', 'Translate_version', 'Game_link', 'Translate_link', 'Mod_link', 'Overview', 'instruction', 'is_modded_game'];
    return allVarsConfig.filter(v => !hardcoded.includes(v.name) && varsUsedInTemplate.has(v.name));
  }, [allVarsConfig, varsUsedInTemplate]);

  const filteredInstructions = useMemo(() => {
    const prefix = (k: 'profile' | 'external') => (k === 'profile' ? 'p:' : 'e:');
    const ownerKey = selectedTranslatorId && selectedTranslatorKind
      ? prefix(selectedTranslatorKind) + selectedTranslatorId
      : (profile?.id ? 'p:' + profile.id : null);
    const normalizeStored = (stored: string | undefined): string => {
      if (!stored) return profile?.id ? 'p:' + profile.id : '';
      if (stored.startsWith('p:') || stored.startsWith('e:')) return stored;
      return 'p:' + stored;
    };
    let names = Object.keys(savedInstructions);
    // Admin : afficher toutes les instructions ; sinon filtrer par propriétaire (traducteur sélectionné)
    if (!profile?.is_master_admin && ownerKey && instructionOwners) {
      names = names.filter(name => normalizeStored(instructionOwners[name]) === ownerKey);
    }
    if (!instructionSearchQuery.trim()) return names;
    const q = instructionSearchQuery.toLowerCase();
    return names.filter(name => name.toLowerCase().includes(q));
  }, [savedInstructions, instructionOwners, instructionSearchQuery, selectedTranslatorId, selectedTranslatorKind, profile?.id, profile?.is_master_admin]);

  // Tags du traducteur actif (mêmes règles que TagSelectorModal)
  const activeTranslatorId = selectedTranslatorId;
  const activeTranslatorKind = selectedTranslatorKind;
  const myTags = useMemo(() => {
    if (!activeTranslatorId) return [] as typeof savedTags;

    const personal = savedTags.filter(t =>
      activeTranslatorKind === 'profile'
        ? (t as any).profileId === activeTranslatorId
        : (t as any).externalTranslatorId === activeTranslatorId
    );
    if (personal.length > 0) return personal;

    // Fallback : tous les tags non-translator
    return savedTags.filter(t => t.tagType !== 'translator');
  }, [savedTags, activeTranslatorId, activeTranslatorKind]);

  // ==================== REFS ====================
  const translatorInjectedRef = useRef(false);
  const prevEditingPostIdRef = useRef<string | null | undefined>(undefined);
  const prevTemplateIdxRef = useRef(currentTemplateIdx);

  // ==================== USEEFFECTS ====================

  // Injection du tag traducteur
  useEffect(() => {
    if (!translatorLoaded || !translatorTagId) return;

    if (!translatorInjectedRef.current) {
      translatorInjectedRef.current = true;
      const curr = postTags ? postTags.split(',').map(s => s.trim()).filter(Boolean) : [];
      const others = curr.filter(id => {
        const t = savedTags.find(tag => (tag.id || tag.name) === id || String(tag.discordTagId ?? '') === id);
        return t?.tagType !== 'translator';
      });
      setPostTags([translatorTagId, ...others].join(','));
    } else {
      const curr = postTags ? postTags.split(',').map(s => s.trim()).filter(Boolean) : [];
      const others = curr.filter(id => {
        const t = savedTags.find(tag => (tag.id || tag.name) === id || String(tag.discordTagId ?? '') === id);
        return t?.tagType !== 'translator';
      });
      setPostTags([translatorTagId, ...others].join(','));
    }
  }, [translatorTagId, translatorLoaded, postTags, savedTags, setPostTags]);

  // Re-injection à la sortie du mode édition
  useEffect(() => {
    if (prevEditingPostIdRef.current === undefined) {
      prevEditingPostIdRef.current = editingPostId;
      return;
    }
    const wasEditing = prevEditingPostIdRef.current !== null;
    prevEditingPostIdRef.current = editingPostId;

    if (wasEditing && editingPostId === null) {
      translatorInjectedRef.current = false;
      if (translatorLoaded && translatorTagId) setPostTags(translatorTagId);
    }
  }, [editingPostId, translatorLoaded, translatorTagId, setPostTags]);

  useEffect(() => {
    if (!editingPostId) setSilentUpdateMode(false);
  }, [editingPostId]);

  // Quand on charge un post depuis l'historique : mettre « Publié pour » sur l'auteur du post (évite duplication tags traducteur)
  useEffect(() => {
    if (!editingPostData || !translatorLoaded) return;
    selectTranslatorByAuthor(editingPostData.authorDiscordId, editingPostData.authorExternalTranslatorId);
  }, [editingPostData, translatorLoaded, selectTranslatorByAuthor]);

  // Synchronisation champ de recherche d'instructions <-> valeur de contexte
  useEffect(() => {
    if (!inputs['instruction']) setInstructionSearchQuery('');
  }, [inputs['instruction']]);

  // Restaurer le nom de l'instruction depuis selected_instruction_key
  useEffect(() => {
    const selectedKey = inputs['selected_instruction_key'];
    if (selectedKey && savedInstructions[selectedKey]) {
      if (inputs['instruction'] === savedInstructions[selectedKey]) {
        setInstructionSearchQuery(selectedKey);
      }
    }
  }, [inputs['selected_instruction_key'], savedInstructions, inputs['instruction']]);

  // Ne vider l'instruction que lors du changement de template
  // ou lors de la sortie du mode édition (pas lors de l'entrée)
  useEffect(() => {
    const templateChanged = prevTemplateIdxRef.current !== currentTemplateIdx;
    const exitingEditMode = prevEditingPostIdRef.current !== null && editingPostId === null;

    if (templateChanged || exitingEditMode) {
      setInstructionSearchQuery('');
      setInput('instruction', '');
      setInput('selected_instruction_key', '');
    }

    prevTemplateIdxRef.current = currentTemplateIdx;
    prevEditingPostIdRef.current = editingPostId;
  }, [currentTemplateIdx, editingPostId, setInput]);

  // ==================== BIDIRECTIONNALITÉ TYPE DE TRADUCTION ====================
  const LABEL_KEY_BY_TRANSLATION_TYPE: Record<string, string> = {
    'Manuelle': 'manual',
    'Semi-automatique': 'semi_auto',
    'Automatique': 'auto',
  };

  const TRANSLATION_TYPE_BY_LABEL_KEY: Record<string, string> = {
    manual: 'Manuelle',
    semi_auto: 'Semi-automatique',
    auto: 'Automatique',
  };

  // Type de traduction (boutons) → tag translationType correspondant
  useEffect(() => {
    const labelKey = LABEL_KEY_BY_TRANSLATION_TYPE[translationType];
    if (!labelKey) return;

    const currentIds = postTags.split(',').map(s => s.trim()).filter(Boolean);

    const translationTagsSource = (myTags.length > 0 ? myTags : savedTags)
      .filter(t => t.tagType === 'translationType');

    const targetTag = translationTagsSource.find(t => (t as any).labelKey === labelKey);
    if (!targetTag) return;

    const tagId = targetTag.id || targetTag.name;

    const withoutTranslationType = currentIds.filter(id => {
      const t = savedTags.find(st =>
        (st.id || st.name) === id || String(st.discordTagId ?? '') === id
      );
      return t?.tagType !== 'translationType';
    });

    if (withoutTranslationType.length === currentIds.length - 1 && currentIds.includes(tagId)) {
      return;
    }

    setPostTags([...withoutTranslationType, tagId].join(','));
  // On ne dépend volontairement pas de postTags pour éviter des boucles
  }, [translationType, myTags, savedTags, setPostTags]);

  // ==================== DÉDUCTION AUTOMATIQUE DU TAG SITES ====================
  const syncingSiteTagRef = useRef(false);
  useEffect(() => {
    if (syncingSiteTagRef.current) return;

    const gameLink = buildFinalLink(linkConfigs.Game_link);
    const translateLink = buildFinalLink(linkConfigs.Translate_link);

    const checkLink = (link: string) => {
      if (!link) return null;
      const lower = link.toLowerCase();
      if (lower.includes('f95zone.to')) return 'F95';
      if (lower.includes('lewdcorner.com')) return 'LewdCorner';
      return 'Autres Sites';
    };

    const detectedSiteTag = checkLink(gameLink) || checkLink(translateLink);
    if (!detectedSiteTag) return;

    // Tags "sites" pour le traducteur actif, ou fallback global
    const siteTagsSource = (myTags.length > 0
      ? myTags
      : savedTags
    ).filter(t => t.tagType === 'sites');

    const siteTag = siteTagsSource.find(t =>
      t.name.includes(detectedSiteTag) ||
      t.name === `🔞 ${detectedSiteTag}` ||
      t.name === `⛔ ${detectedSiteTag}` ||
      t.name === `🔗 ${detectedSiteTag}`
    );

    if (!siteTag) return;

    const currentIds = postTags.split(',').map(s => s.trim()).filter(Boolean);
    const tagId = siteTag.id || siteTag.name;

    if (currentIds.includes(tagId)) return;

    const withoutSites = currentIds.filter(id => {
      const tag = savedTags.find(t => (t.id || t.name) === id || String(t.discordTagId ?? '') === id);
      return tag?.tagType !== 'sites';
    });

    syncingSiteTagRef.current = true;
    setPostTags([...withoutSites, tagId].join(','));
    setTimeout(() => { syncingSiteTagRef.current = false; }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkConfigs.Game_link, linkConfigs.Translate_link, savedTags, postTags]);

  // ==================== HANDLERS ====================
  const handleOpenTagSelector = () => {
    const previewElement = document.querySelector('[data-preview-container]') as HTMLElement;
    if (previewElement) {
      const rect = previewElement.getBoundingClientRect();
      setTagSelectorPosition({
        top: rect.top - 10,
        left: rect.left + 16,
        width: Math.min(rect.width - 32, 500)
      });
    } else {
      setTagSelectorPosition({ top: 120, left: window.innerWidth * 0.65 + 16, width: 500 });
    }
    setShowTagSelector(true);
  };

  const handleSelectTag = (tagId: string) => {
    const current = postTags ? postTags.split(',').map(s => s.trim()).filter(Boolean) : [];

    // Récupérer le tag complet (pour connaître sa catégorie)
    const tag = savedTags.find(t =>
      (t.id || t.name) === tagId || String(t.discordTagId ?? '') === tagId
    );

    if (!tag) {
      // Fallback : comportement simple (ajout si absent)
      if (!current.includes(tagId)) {
        setPostTags([...current, tagId].join(','));
      }
      return;
    }

    // Un seul tag "sites", "translationType" et "gameStatus" à la fois
    let nextIds = current;
    if (tag.tagType === 'translationType' || tag.tagType === 'sites' || tag.tagType === 'gameStatus') {
      nextIds = current.filter(id => {
        const t = savedTags.find(st =>
          (st.id || st.name) === id || String(st.discordTagId ?? '') === id
        );
        return t?.tagType !== tag.tagType;
      });
    }

    // Interdire de désélectionner un tag de type de traduction (toujours au moins un)
    if (tag.tagType === 'translationType' && nextIds.includes(tagId)) {
      return;
    }

    const willSelect = !nextIds.includes(tagId);
    const finalIds = willSelect ? [...nextIds, tagId] : nextIds;
    setPostTags(finalIds.join(','));

    // Tags translationType → mettre à jour le toggle
    if (tag.tagType === 'translationType') {
      const key = (tag as any).labelKey as string | undefined;
      const mappedType = key ? TRANSLATION_TYPE_BY_LABEL_KEY[key] : undefined;
      if (mappedType && mappedType !== translationType) {
        setTranslationType(mappedType);
      }
    }
  };

  const handleRemoveTag = (tagId: string) => {
    const tag = savedTags.find(t =>
      (t.id || t.name) === tagId || String(t.discordTagId ?? '') === tagId
    );

    // Interdire la suppression du Traducteur, du Site et du Type de traduction
    if (tag?.tagType === 'translator' || tag?.tagType === 'sites' || tag?.tagType === 'translationType') {
      return;
    }

    const newTags = selectedTagIds.filter(t => t !== tagId);
    setPostTags(newTags.join(','));
  };

  const handlePasteImport = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return showToast('Presse-papier vide', 'error');

      const data = JSON.parse(text);

      if (data.name) setInput('Game_name', data.name.trim());
      if (data.version) {
        const v = data.version.trim();
        const versionClean = (v.startsWith('[') && v.endsWith(']')) ? v.slice(1, -1) : v;
        setInput('Game_version', versionClean);
      }
      if (data.synopsis) setInput('Overview', data.synopsis.trim());

      if (data.link) {
        const source = data.link.toLowerCase().includes('f95zone.to') ? 'F95' :
          data.link.toLowerCase().includes('lewdcorner.com') ? 'Lewd' : 'Autre';
        setLinkConfig('Game_link', source, data.link.trim());
      }

      if (data.image && data.image.includes('f95zone.to')) {
        addImageFromUrl(data.image);
      }

      if (data.tags != null || data.status != null || data.type != null) {
        const tagsArr = Array.isArray(data.tags) ? data.tags : (typeof data.tags === 'string' && data.tags ? data.tags.split(/,\s*/) : []);
        const statusStr = typeof data.status === 'string' ? data.status : '';
        const typeStr = typeof data.type === 'string' ? data.type : '';
        lastImportedF95Ref.current = { tags: tagsArr, status: statusStr, type: typeStr };
        setInput('_f95_tags', JSON.stringify(tagsArr));
        setInput('_f95_status', statusStr);
        setInput('_f95_type', typeStr);
      }

      // Mapper le statut importé (EN COURS, Terminé, Abandonnée) vers le tag utilisateur "Statut du jeu"
      const statusKey = statusExportToGameStatusKey(typeof data.status === 'string' ? data.status : '');
      if (statusKey && savedTags?.length) {
        const aliasEntry = DISCORD_TAG_ALIASES.find(
          a => a.section === 'gameStatus' && a.key === statusKey
        );
        const gameStatusTag = savedTags.find(t => {
          if (t.tagType !== 'gameStatus') return false;
          const name = (t.name || '').toLowerCase().replace(/\p{Emoji}/gu, '').trim();
          return aliasEntry?.aliases.some(a => name.includes(a) || a.includes(name)) ?? false;
        });
        if (gameStatusTag) {
          const tagId = gameStatusTag.id || gameStatusTag.name || String(gameStatusTag.discordTagId ?? '');
          const currentIds = postTags ? postTags.split(',').map(s => s.trim()).filter(Boolean) : [];
          const withoutGameStatus = currentIds.filter(id => {
            const t = savedTags.find(st =>
              (st.id || st.name) === id || String(st.discordTagId ?? '') === id
            );
            return t?.tagType !== 'gameStatus';
          });
          setPostTags([...withoutGameStatus, tagId].join(','));
        }
      }

      showToast('Données importées avec succès !', 'success');
    } catch {
      showToast('Format JSON invalide', 'error');
    }
  };

  const handleResetForm = () => {
    resetAllFields();
    translatorInjectedRef.current = false;
    lastImportedF95Ref.current = { tags: [], status: '', type: '' };
    setInput('_f95_tags', '');
    setInput('_f95_status', '');
    setInput('_f95_type', '');
    // Ré-injecter le tag traducteur + le tag Type de traduction « Automatique »
    const autoTag = myTags.find(t => t.tagType === 'translationType' && (t as any).labelKey === 'auto')
      ?? savedTags.find(t => t.tagType === 'translationType' && (t as any).labelKey === 'auto');
    const autoTagId = autoTag ? (autoTag.id || autoTag.name) : '';
    const parts = translatorTagId ? [translatorTagId] : [];
    if (autoTagId) parts.push(autoTagId);
    setPostTags(parts.join(','));
    showToast('Formulaire vidé', 'success');
  };

  const syncVersion = () => {
    setInput('Translate_version', inputs['Game_version'] || '');
  };

  const handleAddImage = () => {
    const url = imageUrlInput.trim();
    if (!url) return;
    addImageFromUrl(url);
    setImageUrlInput('');
  };

  /** Export des données au format formulaire liste : id, domain, name, version, status, tags (string), type, ac, link (court), image (preview). */
  const handleExportListManager = async () => {
    const gameLink = buildFinalLink(linkConfigs.Game_link);
    const translateLink = buildFinalLink(linkConfigs.Translate_link);
    const lower = (gameLink || '').toLowerCase();
    let domain = 'Autre';
    if (lower.includes('f95zone.to')) domain = 'F95z';
    else if (lower.includes('lewdcorner.com')) domain = 'LewdCorner';
    const idMatch = gameLink?.match(/threads\/(?:[^/]*\.)?(\d+)/);
    const id = idMatch ? parseInt(idMatch[1], 10) : 0;
    const baseUrl = lower.includes('lewdcorner.com') ? 'https://lewdcorner.com' : 'https://f95zone.to';
    const linkShort = id ? `${baseUrl}/threads/${id}` : gameLink || '';

    const f95 = lastImportedF95Ref.current;
    let statusVal = (f95.status || (inputs['_f95_status'] ?? '')).trim();
    if (statusVal) statusVal = statusVal.toUpperCase();
    let tagsVal = Array.isArray(f95.tags) ? f95.tags.join(', ') : '';
    if (!tagsVal && typeof inputs['_f95_tags'] === 'string' && inputs['_f95_tags']) {
      try {
        const arr = JSON.parse(inputs['_f95_tags']);
        tagsVal = Array.isArray(arr) ? arr.join(', ') : '';
      } catch { /* ignore */ }
    }
    const typeVal = (f95.type || (inputs['_f95_type'] ?? '')).trim();

    let versionVal = (inputs['Game_version'] ?? '').trim();
    if (versionVal && !versionVal.startsWith('[')) versionVal = '[' + versionVal + ']';

    let imageVal = uploadedImages.find(img => img.isMain)?.url ?? uploadedImages[0]?.url ?? '';
    if (imageVal && imageVal.includes('attachments.f95zone.to')) imageVal = imageVal.replace('attachments.f95zone.to', 'preview.f95zone.to');
    if (imageVal && imageVal.includes('attachments.lewdcorner.com')) imageVal = imageVal.replace('attachments.lewdcorner.com', 'preview.lewdcorner.com');

    const translatorTag = savedTags.find(t =>
      t.tagType === 'translator' && selectedTagIds.some(id => (t.id || t.name) === id || String(t.discordTagId ?? '') === id)
    );
    const translationTypeTag = savedTags.find(t =>
      t.tagType === 'translationType' && selectedTagIds.some(id => (t.id || t.name) === id || String(t.discordTagId ?? '') === id)
    );

    const payload: Record<string, unknown> = {
      id,
      domain,
      name: (inputs['Game_name'] ?? '').trim(),
      version: versionVal,
      status: statusVal,
      tags: tagsVal,
      type: typeVal,
      ac: false,
      link: linkShort,
      image: imageVal,
    };

    // Traducteur : concordance formulaire du profil (valeur f95_jeux.traducteur) si définie, sinon nom du tag
    let traducteurName: string | undefined;
    if (profile?.id) {
      const sb = getSupabase();
      if (sb) {
        const { data: row } = await sb.from('translator_forum_mappings').select('list_form_traducteur').eq('profile_id', profile.id).maybeSingle();
        const listFormTraducteur = (row as { list_form_traducteur?: string | null } | null)?.list_form_traducteur;
        if (listFormTraducteur?.trim()) traducteurName = listFormTraducteur.trim();
      }
    }
    if (traducteurName === undefined && translatorTag?.name) traducteurName = (translatorTag.listFormName && translatorTag.listFormName.trim()) ? translatorTag.listFormName.trim() : translatorTag.name;
    if (traducteurName) payload.traducteur = traducteurName;

    // Type de traduction : tri automatique selon le type (🤖 Auto → Traduction Automatique, etc.)
    if (translationTypeTag?.name) {
      const labelKey = (translationTypeTag as { labelKey?: string }).labelKey;
      if (labelKey === 'manual') payload.type_de_traduction = 'Traduction Humaine';
      else if (labelKey === 'semi_auto') payload.type_de_traduction = 'Traduction Semi-Automatique';
      else if (labelKey === 'auto') payload.type_de_traduction = 'Traduction Automatique';
      else payload.type_de_traduction = (translationTypeTag.listFormName && translationTypeTag.listFormName.trim()) ? translationTypeTag.listFormName.trim() : translationTypeTag.name;
    }
    if (inputs['Translate_version']) payload.tversion = inputs['Translate_version'].trim();
    if (translateLink) payload.tlink = translateLink;
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload));
      showToast('Données exportées dans le presse-papier. Collez-les dans « Insérer les données du jeu ».', 'success');
    } catch {
      showToast('Erreur lors de la copie', 'error');
    }
  };

  const onPublish = async (silentUpdate = false) => {
    const externalIdForHistory =
      selectedTranslatorKind === 'external' ? selectedTranslatorId : undefined;
    const res = await publishPost(profile?.discord_id, externalIdForHistory, { silentUpdate });
    if (res?.ok) {
      showToast(editingPostId ? 'Post mis à jour !' : 'Post publié avec succès !', 'success');
      if (editingPostId) {
        setEditingPostId(null);
        setEditingPostData(null);
      }
    }
  };

  return (
    <div className="editor-main">

      <EditorHeader
        editingPostId={editingPostId}
        translatorOptions={translatorOptions}
        selectedTranslatorId={selectedTranslatorId}
        onTranslatorChange={selectTranslator}
        onImportData={handlePasteImport}
        onResetForm={handleResetForm}
        onExitEditMode={() => { setEditingPostId(null); setEditingPostData(null); }}
        confirm={confirm}
        showExportListManager={profile?.list_manager}
        onExportListManager={handleExportListManager}
      />

      <div className="editor-content-grid">

        <HeaderGridSection
          postTitle={postTitle}
          gameName={inputs['Game_name'] || ''}
          onGameNameChange={(v) => setInput('Game_name', v)}
          gameNameDisabled={!varsUsedInTemplate.has('Game_name')}
          imageUrlInput={imageUrlInput}
          onImageUrlInputChange={setImageUrlInput}
          onAddImage={handleAddImage}
          selectedTagIds={selectedTagIds}
          savedTags={savedTags}
          onOpenTagSelector={handleOpenTagSelector}
          onRemoveTag={handleRemoveTag}
          uploadedImages={uploadedImages}
          removeImage={removeImage}
        />

        {/* Versions */}
        <VersionsSection
          gameVersion={inputs['Game_version'] || ''}
          onGameVersionChange={(v) => setInput('Game_version', v)}
          translateVersion={inputs['Translate_version'] || ''}
          onTranslateVersionChange={(v) => setInput('Translate_version', v)}
          canEditGameVersion={varsUsedInTemplate.has('Game_version')}
          canEditTranslateVersion={varsUsedInTemplate.has('Translate_version')}
          onSyncVersion={syncVersion}
        />

        <GameLinkAndTranslationTypeSection
          gameLinkConfig={linkConfigs.Game_link}
          setLinkConfig={setLinkConfig}
          buildFinalLink={buildFinalLink}
          gameLinkDisabled={!varsUsedInTemplate.has('Game_link')}
          translationType={translationType}
          setTranslationType={setTranslationType}
          isIntegrated={isIntegrated}
          setIsIntegrated={setIsIntegrated}
        />

        {/* Liens Traduction + Mod */}
        <LinksSection
          linkConfigs={linkConfigs}
          setLinkConfig={setLinkConfig}
          buildFinalLink={buildFinalLink}
          additionalTranslationLinks={additionalTranslationLinks}
          addAdditionalTranslationLink={addAdditionalTranslationLink}
          updateAdditionalTranslationLink={updateAdditionalTranslationLink}
          deleteAdditionalTranslationLink={deleteAdditionalTranslationLink}
          additionalModLinks={additionalModLinks}
          addAdditionalModLink={addAdditionalModLink}
          updateAdditionalModLink={updateAdditionalModLink}
          deleteAdditionalModLink={deleteAdditionalModLink}
          varsUsedInTemplate={varsUsedInTemplate}
          inputs={inputs}
          setInput={setInput}
        />

        {/* Variables personnalisées */}
        <CustomVarsSection
          visibleVars={visibleVars}
          inputs={inputs}
          setInput={setInput}
          varsUsedInTemplate={varsUsedInTemplate}
        />

        {/* Synopsis + Instructions */}
        <div className="editor-two-col">
          <SynopsisSection
            ref={overviewRef}
            value={inputs['Overview'] || ''}
            onChange={(v) => setInput('Overview', v)}
            disabled={!varsUsedInTemplate.has('Overview')}
            onTranslate={handleTranslateSynopsis}
            translating={translatingOverview}
          />

          <InstructionsSection
            value={inputs['instruction'] || ''}
            onChange={(v) => setInput('instruction', v)}
            searchQuery={instructionSearchQuery}
            onSearchChange={setInstructionSearchQuery}
            showSuggestions={showInstructionSuggestions}
            onSuggestionsToggle={setShowInstructionSuggestions}
            filteredInstructions={filteredInstructions}
            onSelectInstruction={(name) => {
              setInput('instruction', savedInstructions[name]);
              setInput('selected_instruction_key', name);
              setInstructionSearchQuery(name);
              setTimeout(() => setShowInstructionSuggestions(false), 100);
            }}
            disabled={!varsUsedInTemplate.has('instruction')}
            savedInstructions={savedInstructions}
          />
        </div>

        {/* Overlay pour fermer les suggestions */}
        {showInstructionSuggestions && (
          <div
            className="editor-overlay"
            onClick={() => setShowInstructionSuggestions(false)}
            aria-hidden
          />
        )}

        {/* Footer */}
        <PublishFooter
          canPublish={canPublish}
          publishInProgress={publishInProgress}
          editingPostId={editingPostId}
          silentUpdateMode={silentUpdateMode}
          setSilentUpdateMode={setSilentUpdateMode}
          rateLimitCooldown={rateLimitCooldown}
          publishTooltipText={publishTooltipText}
          onPublish={onPublish}
          confirm={confirm}
        />
      </div>

      <TagSelectorModal
        isOpen={showTagSelector}
        onClose={() => setShowTagSelector(false)}
        onSelectTag={handleSelectTag}
        selectedTagIds={selectedTagIds}
        position={tagSelectorPosition}
        controlledTranslatorId={selectedTranslatorId}
        controlledTranslatorKind={selectedTranslatorKind}
      />

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        type={confirmState.type}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
}
