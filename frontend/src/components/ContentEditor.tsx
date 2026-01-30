import React, { useEffect, useMemo, useRef, useState } from 'react';
import DiscordIcon from '../assets/discord-icon.svg';
import { useConfirm } from '../hooks/useConfirm';
import { tauriAPI } from '../lib/tauri-api';
import { useApp } from '../state/appContext';
import { useAuth } from '../state/authContext';
import ConfirmModal from './ConfirmModal';
import ImageThumbnail from './ImageThumbnail';
import TagSelectorModal from './TagSelectorModal';
import { useToast } from './ToastProvider';
// Si tu n'as pas de composant "Button" personnalisé, on utilisera des balises <button> normales
export default function ContentEditor() {
  // 1️⃣ D'ABORD : Extraire toutes les valeurs du context
  const {
    allVarsConfig,
    inputs,
    setInput,
    preview,
    postTitle,
    setPostTitle,
    postTags,
    setPostTags,
    publishPost,
    publishInProgress,
    lastPublishResult,
    savedTags,
    savedInstructions,
    templates,
    currentTemplateIdx,
    uploadedImages,
    addImageFromUrl,
    removeImage,
    editingPostId,
    editingPostData,
    setEditingPostId,
    translationType,
    setTranslationType,
    isIntegrated,
    setIsIntegrated,
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
    deleteAdditionalModLink
  } = useApp();

  const { profile } = useAuth();
  const { showToast } = useToast();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const { linkConfigs, setLinkConfig, /* autres... */ } = useApp();
  // 2️⃣ ENSUITE : Calculer les valeurs dérivées
  const currentTemplate = templates[currentTemplateIdx]; // ✅ UNE SEULE FOIS
  const canPublish = currentTemplate?.type === 'my' &&
    rateLimitCooldown === null;
  const isEditMode = editingPostId !== null;
  const rateLimitRemaining = rateLimitCooldown ? Math.ceil((rateLimitCooldown - Date.now()) / 1000) : 0;

  // 3️⃣ États locaux
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [tagSelectorPosition, setTagSelectorPosition] = useState<{ top: number; left: number; width: number } | undefined>();
  const tagButtonRef = useRef<HTMLButtonElement | null>(null);
  const [instructionSearchQuery, setInstructionSearchQuery] = useState<string>('');
  const [showInstructionSuggestions, setShowInstructionSuggestions] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState<string>('');
  const overviewRef = useRef<HTMLTextAreaElement | null>(null);

  // 4️⃣ ENFIN : useEffect
  useEffect(() => {
    // Si les valeurs dans le contexte sont vides, on reset les barres de recherche locales
    if (!inputs['instruction']) setInstructionSearchQuery('');
  }, [inputs['instruction']]);

  // On garde celui-ci pour les changements de templates/posts
  useEffect(() => {
    setInstructionSearchQuery('');
    setInput('instruction', '');
  }, [currentTemplateIdx, editingPostId]);

  const currentTemplateId = templates[currentTemplateIdx]?.id || templates[currentTemplateIdx]?.name;

  // Variables présentes dans le contenu du template : champs désactivés si la variable n’y figure pas
  const varsUsedInTemplate = useMemo(() => {
    const content = currentTemplate?.content ?? '';
    const matches = content.matchAll(/\[([^\]]+)\]/g);
    const set = new Set<string>();
    for (const m of matches) set.add((m[1] as string).trim());
    if (content.includes('[TRANSLATION_LINKS_LINE]')) set.add('Translate_link');
    if (content.includes('[MOD_LINKS_LINE]')) set.add('Mod_link');
    return set;
  }, [currentTemplate?.content]);

  // Variables déjà affichées en dur dans le formulaire (à exclure de visibleVars)
  const hardcodedVarNames = [
    'Game_name', 'Game_version', 'Game_link', 'Translate_version', 'Translate_link',
    'Overview', 'is_modded_game', 'Mod_link', 'instruction'
  ];

  const visibleVars = useMemo(() => {
    const fromConfig = allVarsConfig.filter(v => {
      if (hardcodedVarNames.includes(v.name)) return false;
      if (!v.templates || v.templates.length === 0) return true;
      return v.templates.includes(currentTemplateId);
    });

    // Réafficher les variables supprimées de allVarsConfig si elles ont une valeur (post rechargé ou dupliqué)
    const source = editingPostData?.savedInputs ?? inputs;
    const configNames = new Set(allVarsConfig.map(v => v.name));
    const orphanNames = Object.keys(source).filter(
      name => varsUsedInTemplate.has(name) && !configNames.has(name) && !hardcodedVarNames.includes(name) && (source[name] ?? '').toString().trim() !== ''
    );
    const orphanVars: Array<{ name: string; label: string; type?: 'text' | 'textarea'; placeholder?: string }> = orphanNames.map(name => ({
      name,
      label: name.replace(/_/g, ' '),
      type: 'text'
    }));

    return [...fromConfig, ...orphanVars];
  }, [allVarsConfig, currentTemplateId, editingPostData?.savedInputs, inputs, varsUsedInTemplate]);

  // Calculer les IDs des tags sélectionnés
  const selectedTagIds = useMemo(() => {
    return postTags ? postTags.split(',').map(s => s.trim()).filter(Boolean) : [];
  }, [postTags]);

  // Fonction pour ouvrir la modale de sélection des tags
  const handleOpenTagSelector = () => {
    // Trouver l'élément preview pour obtenir sa position exacte
    const previewElement = document.querySelector('[data-preview-container]') as HTMLElement;

    if (previewElement) {
      const previewRect = previewElement.getBoundingClientRect();
      // Positionner la modale juste au-dessus du preview, alignée à gauche du preview
      setTagSelectorPosition({
        top: previewRect.top - 10, // Juste au-dessus du preview
        left: previewRect.left + 16,
        width: Math.min(previewRect.width - 32, 500)
      });
    } else {
      // Fallback : utiliser les valeurs par défaut basées sur le layout
      const previewLeft = window.innerWidth * 0.65;
      const previewWidth = window.innerWidth * 0.35;
      setTagSelectorPosition({
        top: 120,
        left: previewLeft + 16,
        width: Math.min(previewWidth - 32, 500)
      });
    }
    setShowTagSelector(true);
  };

  // Fonction pour sélectionner un tag
  const handleSelectTag = (tagId: string) => {
    const currentTags = postTags ? postTags.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (!currentTags.includes(tagId)) {
      setPostTags([...currentTags, tagId].join(','));
    }
  };


  const filteredInstructions = useMemo(() => {
    if (!instructionSearchQuery.trim()) return Object.keys(savedInstructions);
    const query = instructionSearchQuery.toLowerCase();
    return Object.keys(savedInstructions).filter(name => name.toLowerCase().includes(query));
  }, [savedInstructions, instructionSearchQuery]);

  function LinkField({
    label,
    linkName,
    placeholder,
    disabled = false,
    showLabel = true,
    customLabelContent,
    hideSourceSelect = true,
    /** Met Label (col 1) et Lien (col 2) sur la même ligne. */
    inlineFirstColumn,
    /** Affiche uniquement l'input (pas de label ni prévisualisation au-dessus). */
    inputOnly = false
  }: {
    label: string;
    linkName: 'Game_link' | 'Translate_link' | 'Mod_link';
    placeholder: string;
    disabled?: boolean;
    showLabel?: boolean;
    customLabelContent?: React.ReactNode;
    hideSourceSelect?: boolean;
    inlineFirstColumn?: React.ReactNode;
    inputOnly?: boolean;
  }) {
    const config = linkConfigs[linkName];

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = e.target.value;

      // Détection automatique du type : uniquement F95/Lewd si l'URL en fait partie
      // Sinon (Proton, autre domaine, etc.) → Autre pour ne pas préfixer avec f95zone/lewdcorner
      const lowerVal = val.toLowerCase();
      let detectedSource: 'F95' | 'Lewd' | 'Autre' = config.source;

      if (lowerVal.includes('f95zone.to')) {
        detectedSource = 'F95';
      } else if (lowerVal.includes('lewdcorner.com')) {
        detectedSource = 'Lewd';
      } else if (lowerVal.includes('http') || lowerVal.includes('://')) {
        // URL d'un autre type (Proton, Drive, etc.) : forcer Autre
        detectedSource = 'Autre';
      }

      // Extraction de l'ID du thread si c'est une URL F95 ou Lewd (format threads/3281/ ou threads/xxx.3281/)
      if (detectedSource !== 'Autre') {
        const threadIdMatch = val.match(/threads\/(?:[^/]*\.)?(\d+)\/?/);
        if (threadIdMatch && threadIdMatch[1]) {
          val = threadIdMatch[1];
        } else if (/^\d+$/.test(val.trim())) {
          val = val.trim();
        }
      }

      setLinkConfig(linkName, detectedSource, val);
    };

    // Ne pas préfixer F95/Lewd si la valeur est déjà une URL d'un autre domaine (Proton, etc.)
    const valueLower = (config.value || '').toLowerCase();
    const isOtherFullUrl = valueLower.startsWith('http') && !valueLower.includes('f95zone.to') && !valueLower.includes('lewdcorner.com');

    // Construction de l'URL finale : uniquement préfixer F95/Lewd si la valeur n'est PAS déjà une URL d'un autre domaine
    const finalUrl = isOtherFullUrl
      ? config.value || '...'
      : config.source === 'F95' && !isOtherFullUrl
        ? `https://f95zone.to/threads/${config.value || '...'}/`
        : config.source === 'Lewd' && !isOtherFullUrl
          ? `https://lewdcorner.com/threads/${config.value || '...'}/`
          : config.value || '...';

    // Affichage dans le champ : URL complète nettoyée pour F95/Lewd, sinon valeur brute
    const displayValue = isOtherFullUrl || config.source === 'Autre'
      ? config.value
      : (config.source === 'F95' || config.source === 'Lewd') && config.value.trim()
        ? (config.source === 'F95' ? `https://f95zone.to/threads/${config.value.trim()}/` : `https://lewdcorner.com/threads/${config.value.trim()}/`)
        : config.value;

    const previewNode = finalUrl && !finalUrl.includes('...') ? (
      <div
        onClick={async () => {
          const result = await tauriAPI.openUrl(finalUrl);
          if (!result.ok) console.error('Erreur ouverture URL:', result.error);
        }}
        style={{
          fontSize: 11,
          color: '#5865F2',
          fontFamily: 'monospace',
          padding: '2px 8px',
          background: 'rgba(88, 101, 242, 0.1)',
          borderRadius: 4,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          display: 'inline-block',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(88, 101, 242, 0.2)';
          e.currentTarget.style.textDecoration = 'underline';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(88, 101, 242, 0.1)';
          e.currentTarget.style.textDecoration = 'none';
        }}
        title="Cliquer pour ouvrir dans le navigateur externe"
      >
        🔗 {finalUrl}
      </div>
    ) : (
      <div style={{
        fontSize: 11,
        color: '#5865F2',
        fontFamily: 'monospace',
        padding: '2px 8px',
        background: 'rgba(88, 101, 242, 0.1)',
        borderRadius: 4,
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}>
        🔗 {finalUrl}
      </div>
    );

    const linkInput = (
      <input
        type="text"
        value={displayValue}
        onChange={handleInputChange}
        placeholder={config.source === 'Autre' ? placeholder : 'Collez l\'ID ou l\'URL complète'}
        disabled={disabled}
        style={{
          height: '40px',
          boxSizing: 'border-box',
          borderRadius: 6,
          padding: '0 12px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          opacity: disabled ? 0.5 : 1,
          width: '100%'
        }}
      />
    );

    // Mode inputOnly : uniquement l'input (pour Lien du jeu + bouton 🔗 ou ligne Label|Lien|🔗|🗑️)
    if (inputOnly) {
      return (
        <div style={{ minWidth: 0, width: '100%', height: 40, display: 'flex', alignItems: 'center' }}>
          {linkInput}
        </div>
      );
    }

    // Mode inline : prévisualisation au-dessus, puis ligne Label | Lien
    if (inlineFirstColumn != null) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginBottom: 0 }}>
          <div style={{ minHeight: 28 }}>{previewNode}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'center' }}>
            {inlineFirstColumn}
            <div style={{ minWidth: 0 }}>{linkInput}</div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', width: '100%' }}>
        {/* LIGNE 1 : Label/Custom content et Prévisualisation du lien final */}
        {(showLabel || customLabelContent) && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 8,
            alignItems: 'flex-start',
            marginBottom: 8,
            minHeight: 32,
            width: '100%'
          }}>
            {customLabelContent ? customLabelContent : (
              <>
                <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                  {label}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                  {previewNode}
                </div>
              </>
            )}
          </div>
        )}

        {/* Ligne 2 : Input (select source masqué si hideSourceSelect, logique F95/Lewd conservée) */}
        <div style={{ display: 'grid', gridTemplateColumns: hideSourceSelect ? '1fr' : '100px 1fr', gap: 8, alignItems: 'start', width: '100%' }}>
          {!hideSourceSelect && (
            <select
              value={config.source}
              onChange={(e) => setLinkConfig(linkName, e.target.value as any, config.value)}
              disabled={disabled}
              style={{
                height: '38px',
                borderRadius: 6,
                padding: '0 8px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: 13,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1
              }}
            >
              <option value="F95">F95</option>
              <option value="Lewd">Lewd</option>
              <option value="Autre">Autre</option>
            </select>
          )}
          {linkInput}
        </div>
      </div>
    );
  }

  // Fonction pour importer les données du scraper (F95/LC)
  const handlePasteImport = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const data = JSON.parse(text);

      // ✅ Champs simples (inputs)
      if (data.name) setInput('Game_name', data.name);
      if (data.version) setInput('Game_version', data.version);

      // ✅ IMPORTANT : ton UI "Lien du jeu" utilise linkConfigs + setLinkConfig
      const rawLink = typeof data.link === 'string' ? data.link.trim() : '';
      const rawId =
        typeof data.id === 'string' || typeof data.id === 'number'
          ? String(data.id).trim()
          : '';

      const detectSource = (link: string): 'F95' | 'Lewd' | 'Autre' => {
        const l = link.toLowerCase();
        if (l.includes('f95zone.to')) return 'F95';
        if (l.includes('lewdcorner.com')) return 'Lewd';
        return 'Autre';
      };

      const extractThreadId = (link: string): string => {
        // Ex: https://f95zone.to/threads/xxxxx.232384/
        const m = link.match(/threads\/.*\.(\d+)\/?/i);
        return m?.[1] ?? '';
      };

      // Priorité: data.id -> id depuis l'url -> si link = "232384" -> fallback url en "Autre"
      let idToUse = rawId || (rawLink ? extractThreadId(rawLink) : '');
      let sourceToUse: 'F95' | 'Lewd' | 'Autre' = rawLink ? detectSource(rawLink) : 'F95';

      if (!idToUse && rawLink && /^\d+$/.test(rawLink)) {
        idToUse = rawLink;
      }

      if (idToUse) {
        // On met l'ID dans l'input du lien
        if (sourceToUse === 'Autre') sourceToUse = 'F95'; // le scraper vient en général de F95
        setLinkConfig('Game_link', sourceToUse, idToUse);
      } else if (rawLink) {
        // Secours : garder l'URL complète si on n'a pas l'ID
        setLinkConfig('Game_link', 'Autre', rawLink);
      }

      showToast('Données importées !', 'success');
    } catch (err) {
      showToast('Erreur : Presse-papier invalide', 'error');
    }
  };

  // Fonction pour synchroniser les versions
  const syncVersion = () => {
    const gameVer = inputs['Game_version'] || '';
    setInput('Translate_version', gameVer);
  };

  // Définir un lien principal à partir d'une URL brute (pour promotion d'un lien additionnel en premier)
  const setTranslateLinkFromUrl = (url: string) => {
    const u = url.trim();
    let source: 'F95' | 'Lewd' | 'Autre' = 'Autre';
    let value = u;
    if (u.toLowerCase().includes('f95zone.to')) {
      source = 'F95';
      const m = u.match(/threads\/(?:[^/]*\.)?(\d+)\/?/);
      value = m?.[1] ?? u;
    } else if (u.toLowerCase().includes('lewdcorner.com')) {
      source = 'Lewd';
      const m = u.match(/threads\/(?:[^/]*\.)?(\d+)\/?/);
      value = m?.[1] ?? u;
    }
    setLinkConfig('Translate_link', source, value);
  };
  const setModLinkFromUrl = (url: string) => {
    const u = url.trim();
    let source: 'F95' | 'Lewd' | 'Autre' = 'Autre';
    let value = u;
    if (u.toLowerCase().includes('f95zone.to')) {
      source = 'F95';
      const m = u.match(/threads\/(?:[^/]*\.)?(\d+)\/?/);
      value = m?.[1] ?? u;
    } else if (u.toLowerCase().includes('lewdcorner.com')) {
      source = 'Lewd';
      const m = u.match(/threads\/(?:[^/]*\.)?(\d+)\/?/);
      value = m?.[1] ?? u;
    }
    setLinkConfig('Mod_link', source, value);
  };

  return (
    <div style={{ padding: '10px 15px', position: 'relative', height: '100%', minHeight: 0, overflow: 'auto', boxSizing: 'border-box', width: '100%', maxWidth: '100%' }}>

      {/* LIGNE 1 : Titre */}
      <h4 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        📝 Contenu du post Discord
        {editingPostId && (
          <span style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--accent)',
            background: 'rgba(125, 211, 252, 0.15)',
            padding: '4px 10px',
            borderRadius: 6
          }}>
            ✏️ Mode modification
          </span>
        )}
      </h4>

      <div style={{ display: 'grid', gap: 16, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>

        {/* Layout: Ligne 1 (Titre + Tags) | Ligne 2 (Nom du jeu + Lien image) | Colonne droite (Image sur 2 lignes) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 200px', gridTemplateRows: 'auto auto', gap: 12, width: '100%', maxWidth: '100%' }}>

          {/* LIGNE 1 - Col 1 : Titre du post */}
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
              Titre du post
            </label>
            <input
              readOnly
              value={postTitle}
              style={{
                width: '100%',
                height: '40px',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '0 12px',
                background: 'rgba(255,255,255,0.03)',
                cursor: 'default'
              }}
            />
          </div>

          {/* LIGNE 1 - Col 2 : Tags — bouton puis tags sur la même ligne */}
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
              Tags
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                ref={tagButtonRef}
                type="button"
                onClick={handleOpenTagSelector}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s',
                  flexShrink: 0
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(74, 158, 255, 0.1)';
                  e.currentTarget.style.borderColor = '#4a9eff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--panel)';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                ➕ Ajouter
              </button>
              {selectedTagIds.map((tagId) => {
                const tag = savedTags.find(t => (t.id || t.name) === tagId || String(t.discordTagId ?? '') === tagId);
                return (
                  <div
                    key={tagId}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 14px',
                      borderRadius: 999,
                      background: 'rgba(99, 102, 241, 0.14)',
                      border: '1px solid rgba(99, 102, 241, 0.35)',
                      fontSize: 13,
                      lineHeight: 1.2,
                      fontWeight: 600,
                      flexShrink: 0
                    }}
                  >
                    <span style={{ color: 'var(--text)' }}>{tag?.name || tagId}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const newTags = selectedTagIds.filter(t => t !== tagId);
                        setPostTags(newTags.join(','));
                      }}
                      title="Retirer"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--muted)',
                        cursor: 'pointer',
                        padding: 0,
                        lineHeight: 1,
                        fontSize: 14,
                        display: 'inline-flex',
                        alignItems: 'center'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* LIGNE 1-2 - Col 3 : Miniature de l'image (rowspan 2) - À DROITE */}
          <div style={{ gridColumn: 3, gridRow: '1 / 3', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start' }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
              Image
            </label>
            {uploadedImages.length > 0 ? (
              <ImageThumbnail
                imagePath={uploadedImages[0].path || uploadedImages[0].url || ''}
                isMain={true}
                onSetMain={() => { }}
                onCopyName={() => { }}
                onDelete={async () => {
                  const ok = await confirm({ title: 'Supprimer', message: 'Supprimer cette image ?', type: 'danger' });
                  if (ok) removeImage(0);
                }}
                onChange={() => { }}
              />
            ) : (
              <div style={{
                width: '100%',
                minHeight: '120px',
                border: '2px dashed var(--border)',
                borderRadius: 6,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.02)',
                color: 'var(--muted)',
                padding: '12px',
                gap: '8px'
              }}>
                <div style={{ fontSize: 32 }}>🖼️</div>
                <div style={{ fontSize: 11, textAlign: 'center' }}>Aucune image</div>
              </div>
            )}
          </div>

          {/* LIGNE 2 - Col 1 : Nom du jeu */}
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
              Nom du jeu
            </label>
            <input
              value={inputs['Game_name'] || ''}
              onChange={e => setInput('Game_name', e.target.value)}
              disabled={!varsUsedInTemplate.has('Game_name')}
              style={{
                width: '100%',
                height: '40px',
                borderRadius: 6,
                padding: '0 12px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                opacity: varsUsedInTemplate.has('Game_name') ? 1 : 0.6,
                cursor: varsUsedInTemplate.has('Game_name') ? 'text' : 'not-allowed'
              }}
              placeholder="Nom du jeu"
            />
          </div>

          {/* LIGNE 2 - Col 2 : Lien de l'image */}
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
              Lien de l'image
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const url = imageUrlInput.trim();
                    if (url) {
                      addImageFromUrl(url);
                      setImageUrlInput('');
                    }
                  }
                }}
                placeholder="URL de l'image (https://...)"
                style={{
                  flex: 1,
                  height: '40px',
                  borderRadius: 6,
                  padding: '0 12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)'
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const url = imageUrlInput.trim();
                  if (url) {
                    addImageFromUrl(url);
                    setImageUrlInput('');
                  }
                }}
                disabled={!imageUrlInput.trim()}
                style={{
                  height: '40px',
                  padding: '0 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: imageUrlInput.trim() ? 'pointer' : 'not-allowed',
                  opacity: imageUrlInput.trim() ? 1 : 0.5,
                  background: imageUrlInput.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border)',
                  color: 'white'
                }}
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>

        {/* LIGNE 4 : Version du jeu et Version de la trad */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
              Version du jeu
            </label>
            <input
              value={inputs['Game_version'] || ''}
              onChange={e => setInput('Game_version', e.target.value)}
              disabled={!varsUsedInTemplate.has('Game_version')}
              style={{
                width: '100%',
                height: '40px',
                borderRadius: 6,
                padding: '0 12px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                opacity: varsUsedInTemplate.has('Game_version') ? 1 : 0.6,
                cursor: varsUsedInTemplate.has('Game_version') ? 'text' : 'not-allowed'
              }}
              placeholder="v1.0.4"
            />
          </div>

          <div style={{ paddingBottom: '4px' }}>
            <button
              type="button"
              onClick={syncVersion}
              title="Copier vers version traduction"
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                width: '32px',
                height: '32px',
                borderRadius: '4px',
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ⇆
            </button>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
              Version de la trad
            </label>
            <input
              value={inputs['Translate_version'] || ''}
              onChange={e => setInput('Translate_version', e.target.value)}
              disabled={!varsUsedInTemplate.has('Translate_version')}
              style={{
                width: '100%',
                height: '40px',
                borderRadius: 6,
                padding: '0 12px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                opacity: varsUsedInTemplate.has('Translate_version') ? 1 : 0.6,
                cursor: varsUsedInTemplate.has('Translate_version') ? 'text' : 'not-allowed'
              }}
              placeholder="v1.0"
            />
          </div>
        </div> {/* FIN LIGNE 5 */}

        {/* Grille 2 colonnes : Lien du jeu (input + 🔗) | Type de traduction — labels et lignes input alignés */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'stretch' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ minHeight: 32, display: 'flex', alignItems: 'center' }}>
              <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, margin: 0 }}>
                Lien du jeu
              </label>
            </div>
            <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0, height: 40, display: 'flex', alignItems: 'center' }}>
                <LinkField
                  label="Lien du jeu"
                  linkName="Game_link"
                  placeholder="https://..."
                  disabled={!varsUsedInTemplate.has('Game_link')}
                  inputOnly
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  const cfg = linkConfigs.Game_link;
                  const url = cfg.source === 'F95' ? `https://f95zone.to/threads/${cfg.value || ''}/` : cfg.source === 'Lewd' ? `https://lewdcorner.com/threads/${cfg.value || ''}/` : cfg.value || '';
                  if (url && !url.includes('...')) {
                    const result = await tauriAPI.openUrl(url);
                    if (!result.ok) console.error('Erreur ouverture URL:', result.error);
                  }
                }}
                title="Ouvrir le lien"
                style={{
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,0.05)',
                  cursor: 'pointer',
                  fontSize: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                🔗
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              minHeight: 32,
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 8,
              alignItems: 'center'
            }}>
              <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, margin: 0 }}>
                Type de traduction
              </label>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                userSelect: 'none',
                fontSize: 12,
                color: 'var(--text)',
                fontWeight: 600,
                margin: 0
              }}>
                <input
                  type="checkbox"
                  checked={isIntegrated}
                  onChange={e => setIsIntegrated(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <span>Traduction intégrée au jeu</span>
              </label>
            </div>
            <div style={{
              height: 40,
              display: 'flex',
              gap: 4,
              padding: 4,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.03)',
              alignItems: 'center'
            }}>
              {(['Automatique', 'Semi-automatique', 'Manuelle'] as const).map((opt) => {
                const active = translationType === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setTranslationType(opt)}
                    style={{
                      flex: 1,
                      height: '32px',
                      borderRadius: 6,
                      border: 'none',
                      cursor: 'pointer',
                      background: active ? 'var(--accent)' : 'transparent',
                      color: active ? 'white' : 'var(--muted)',
                      fontSize: 13,
                      fontWeight: active ? 700 : 600,
                      transition: 'all 0.15s'
                    }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Grille 2 colonnes : Traductions (label, lien, additionnels) | Mod (checkbox, label, lien, additionnels) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
          {/* Colonne 1 : Traductions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                Traductions
              </label>
              <button
                type="button"
                onClick={addAdditionalTranslationLink}
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  height: 32,
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: 'transparent',
                  color: 'var(--text)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)';
                  e.currentTarget.style.borderColor = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                ➕ Ajouter un lien additionnel
              </button>
            </div>
            {/* En-têtes Label | Lien | 🔗 | 🗑️ — toutes les lignes affichées de la même manière */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,3fr) auto auto', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Label</label>
              <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Lien</label>
              <span style={{ width: 40 }} />
              <span style={{ width: 40 }} />
            </div>
            {/* Ligne 0 : lien principal traduction (même style que les suivantes) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,3fr) auto auto', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                value={inputs['main_translation_label'] ?? ''}
                onChange={(e) => setInput('main_translation_label', e.target.value)}
                placeholder="Traduction"
                disabled={!varsUsedInTemplate.has('Translate_link')}
                style={{
                  height: '40px',
                  borderRadius: 6,
                  padding: '0 12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  opacity: varsUsedInTemplate.has('Translate_link') ? 1 : 0.6
                }}
              />
              <LinkField
                label="Lien"
                linkName="Translate_link"
                placeholder="https://..."
                disabled={!varsUsedInTemplate.has('Translate_link')}
                inputOnly
              />
              <button
                type="button"
                onClick={async () => {
                  const cfg = linkConfigs.Translate_link;
                  const url = cfg.source === 'F95' ? `https://f95zone.to/threads/${cfg.value || ''}/` : cfg.source === 'Lewd' ? `https://lewdcorner.com/threads/${cfg.value || ''}/` : cfg.value || '';
                  if (url && !url.includes('...')) {
                    const result = await tauriAPI.openUrl(url);
                    if (!result.ok) console.error('Erreur ouverture URL:', result.error);
                  }
                }}
                title="Ouvrir le lien"
                style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                🔗
              </button>
              <button
                type="button"
                onClick={() => {
                  if (additionalTranslationLinks.length > 0) {
                    setInput('main_translation_label', additionalTranslationLinks[0].label);
                    setTranslateLinkFromUrl(additionalTranslationLinks[0].link);
                    deleteAdditionalTranslationLink(0);
                  } else {
                    setInput('main_translation_label', '');
                    setLinkConfig('Translate_link', 'Autre', '');
                  }
                }}
                disabled={additionalTranslationLinks.length === 0}
                title="Supprimer ce lien"
                style={{
                  width: 40, height: 40, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--error)', cursor: additionalTranslationLinks.length === 0 ? 'not-allowed' : 'pointer', opacity: additionalTranslationLinks.length === 0 ? 0.4 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
                }}
              >
                🗑️
              </button>
            </div>
            {additionalTranslationLinks.map((link, index) => {
              const totalRows = 1 + additionalTranslationLinks.length;
              const isOnlyRow = totalRows === 1;
              return (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,3fr) auto auto', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={link.label}
                    onChange={(e) => updateAdditionalTranslationLink(index, { ...link, label: e.target.value })}
                    placeholder="Saison 1"
                    style={{ height: '40px', borderRadius: 6, padding: '0 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <input
                    type="text"
                    value={link.link}
                    onChange={(e) => updateAdditionalTranslationLink(index, { ...link, link: e.target.value })}
                    placeholder="https://..."
                    style={{ height: '40px', borderRadius: 6, padding: '0 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <button
                    type="button"
                    onClick={async () => { if (link.link.trim()) { const r = await tauriAPI.openUrl(link.link.trim()); if (!r.ok) console.error(r.error); } }}
                    title="Ouvrir le lien"
                    style={{ width: 40, height: 40, borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    🔗
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteAdditionalTranslationLink(index)}
                    disabled={isOnlyRow}
                    title="Supprimer ce lien"
                    style={{
                      width: 40, height: 40, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--error)',
                      cursor: isOnlyRow ? 'not-allowed' : 'pointer', opacity: isOnlyRow ? 0.4 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
                    }}
                  >
                    🗑️
                  </button>
                </div>
              );
            })}
          </div>

          {/* Colonne 2 : Mod */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: varsUsedInTemplate.has('is_modded_game') ? 'pointer' : 'default',
                  userSelect: 'none',
                  fontSize: 13,
                  color: 'var(--muted)',
                  fontWeight: 600,
                  opacity: varsUsedInTemplate.has('is_modded_game') ? 1 : 0.6
                }}
              >
                <input
                  type="checkbox"
                  checked={inputs['is_modded_game'] === 'true'}
                  onChange={e => setInput('is_modded_game', e.target.checked ? 'true' : 'false')}
                  disabled={!varsUsedInTemplate.has('is_modded_game')}
                  style={{
                    width: 16,
                    height: 16,
                    cursor: varsUsedInTemplate.has('is_modded_game') ? 'pointer' : 'not-allowed'
                  }}
                />
                <span>Mod compatible</span>
              </label>
              <button
                type="button"
                onClick={addAdditionalModLink}
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  height: 32,
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: 'transparent',
                  color: 'var(--text)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)';
                  e.currentTarget.style.borderColor = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                ➕ Ajouter un lien additionnel
              </button>
            </div>
            {/* En-têtes Label | Lien | 🔗 | 🗑️ — toutes les lignes affichées de la même manière */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,3fr) auto auto', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Label</label>
              <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Lien</label>
              <span style={{ width: 40 }} />
              <span style={{ width: 40 }} />
            </div>
            {/* Ligne 0 : lien principal mod (même style que les suivantes). Affiché dans le template seulement si une URL est renseignée. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,3fr) auto auto', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                value={inputs['main_mod_label'] ?? ''}
                onChange={(e) => setInput('main_mod_label', e.target.value)}
                placeholder="Mod"
                disabled={!varsUsedInTemplate.has('Mod_link')}
                style={{
                  height: '40px',
                  borderRadius: 6,
                  padding: '0 12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  opacity: varsUsedInTemplate.has('Mod_link') ? 1 : 0.6
                }}
              />
              <LinkField
                label="Lien"
                linkName="Mod_link"
                placeholder="ID du thread ou URL..."
                disabled={!varsUsedInTemplate.has('Mod_link')}
                inputOnly
              />
              <button
                type="button"
                onClick={async () => {
                  const cfg = linkConfigs.Mod_link;
                  const url = cfg.source === 'F95' ? `https://f95zone.to/threads/${cfg.value || ''}/` : cfg.source === 'Lewd' ? `https://lewdcorner.com/threads/${cfg.value || ''}/` : cfg.value || '';
                  if (url && !url.includes('...')) {
                    const result = await tauriAPI.openUrl(url);
                    if (!result.ok) console.error('Erreur ouverture URL:', result.error);
                  }
                }}
                title="Ouvrir le lien"
                style={{ width: 40, height: 40, borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                🔗
              </button>
              <button
                type="button"
                onClick={() => {
                  if (additionalModLinks.length > 0) {
                    setInput('main_mod_label', additionalModLinks[0].label);
                    setModLinkFromUrl(additionalModLinks[0].link);
                    deleteAdditionalModLink(0);
                  } else {
                    setInput('main_mod_label', '');
                    setLinkConfig('Mod_link', 'Autre', '');
                  }
                }}
                disabled={additionalModLinks.length === 0}
                title="Supprimer ce lien"
                style={{
                  width: 40, height: 40, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--error)', cursor: additionalModLinks.length === 0 ? 'not-allowed' : 'pointer', opacity: additionalModLinks.length === 0 ? 0.4 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
                }}
              >
                🗑️
              </button>
            </div>
            {additionalModLinks.map((link, index) => {
              const totalRows = 1 + additionalModLinks.length;
              const isOnlyRow = totalRows === 1;
              return (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,3fr) auto auto', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={link.label}
                    onChange={(e) => updateAdditionalModLink(index, { ...link, label: e.target.value })}
                    placeholder="Label (ex: Walkthrough Mod)"
                    style={{ height: '40px', borderRadius: 6, padding: '0 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <input
                    type="text"
                    value={link.link}
                    onChange={(e) => updateAdditionalModLink(index, { ...link, link: e.target.value })}
                    placeholder="https://..."
                    style={{ height: '40px', borderRadius: 6, padding: '0 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <button
                    type="button"
                    onClick={async () => { if (link.link.trim()) { const r = await tauriAPI.openUrl(link.link.trim()); if (!r.ok) console.error(r.error); } }}
                    title="Ouvrir le lien"
                    style={{ width: 40, height: 40, borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    🔗
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteAdditionalModLink(index)}
                    disabled={isOnlyRow}
                    title="Supprimer ce lien"
                    style={{
                      width: 40, height: 40, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--error)',
                      cursor: isOnlyRow ? 'not-allowed' : 'pointer', opacity: isOnlyRow ? 0.4 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
                    }}
                  >
                    🗑️
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* LIGNE 8 : Variables Custom — type text = input, type textarea = textarea multiligne */}
        {visibleVars.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {visibleVars.map((v) => {
              const used = varsUsedInTemplate.has(v.name);
              const isTextarea = v.type === 'textarea';
              return (
                <div key={v.name} style={isTextarea ? { gridColumn: '1 / -1' } : undefined}>
                  <label style={{
                    display: 'block',
                    fontSize: 13,
                    color: used ? 'var(--muted)' : 'var(--muted)',
                    marginBottom: 6,
                    fontWeight: 600,
                    opacity: used ? 1 : 0.7
                  }}>
                    {v.label || v.name}
                  </label>
                  {isTextarea ? (
                    <textarea
                      value={inputs[v.name] || ''}
                      onChange={e => setInput(v.name, e.target.value)}
                      disabled={!used}
                      placeholder={v.placeholder || ''}
                      style={{
                        width: '100%',
                        minHeight: 100,
                        borderRadius: 6,
                        padding: 12,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontFamily: 'inherit',
                        fontSize: 14,
                        lineHeight: 1.5,
                        resize: 'vertical',
                        opacity: used ? 1 : 0.6,
                        cursor: used ? 'text' : 'not-allowed'
                      }}
                      className="styled-scrollbar"
                    />
                  ) : (
                    <input
                      value={inputs[v.name] || ''}
                      onChange={e => setInput(v.name, e.target.value)}
                      disabled={!used}
                      style={{
                        width: '100%',
                        height: '40px',
                        borderRadius: 6,
                        padding: '0 12px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        opacity: used ? 1 : 0.6,
                        cursor: used ? 'text' : 'not-allowed'
                      }}
                      placeholder={v.placeholder || ''}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* LIGNE 9 : Synopsis et Instructions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
          {/* Synopsis (gauche) - prend toute la hauteur */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '150px' }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
              Synopsis
            </label>
            <textarea
              ref={overviewRef}
              value={inputs['Overview'] || ''}
              onChange={e => setInput('Overview', e.target.value)}
              disabled={!varsUsedInTemplate.has('Overview')}
              style={{
                width: '100%',
                flex: 1,
                minHeight: 0,
                borderRadius: 6,
                padding: '12px',
                fontFamily: 'inherit',
                fontSize: 14,
                lineHeight: 1.5,
                resize: 'none',
                overflowY: 'auto',
                opacity: varsUsedInTemplate.has('Overview') ? 1 : 0.6,
                cursor: varsUsedInTemplate.has('Overview') ? 'text' : 'not-allowed'
              }}
              className="styled-scrollbar"
              placeholder="Décrivez le jeu..."
            />
          </div>

          {/* Instructions (droite) - 2 lignes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', minHeight: '150px' }}>
            {/* Ligne 1 : Dropdown */}
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
                Instructions d'installation
              </label>
              <input
                type="text"
                placeholder="Rechercher une instruction..."
                value={instructionSearchQuery}
                onChange={e => {
                  setInstructionSearchQuery(e.target.value);
                  setShowInstructionSuggestions(true);
                }}
                onFocus={() => setShowInstructionSuggestions(true)}
                disabled={!varsUsedInTemplate.has('instruction')}
                style={{
                  width: '100%',
                  height: '40px',
                  borderRadius: 6,
                  padding: '0 12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  opacity: varsUsedInTemplate.has('instruction') ? 1 : 0.6,
                  cursor: varsUsedInTemplate.has('instruction') ? 'text' : 'not-allowed'
                }}
              />
              {showInstructionSuggestions && filteredInstructions.length > 0 && (
                <div
                  className="suggestions-dropdown"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 1001,
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}
                >
                  {filteredInstructions.map((name, idx) => (
                    <div
                      key={idx}
                      className="suggestion-item"
                      onClick={() => {
                        setInput('instruction', savedInstructions[name]);
                        setInstructionSearchQuery(name);
                        setShowInstructionSuggestions(false);
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{name}</div>
                      <div style={{ fontSize: 11, opacity: 0.7 }}>
                        {savedInstructions[name].substring(0, 50)}...
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ligne 2 : Textarea - prend la hauteur restante */}
            <textarea
              value={inputs['instruction'] || ''}
              onChange={e => setInput('instruction', e.target.value)}
              disabled={!varsUsedInTemplate.has('instruction')}
              style={{
                width: '100%',
                flex: 1,
                minHeight: 0,
                borderRadius: 6,
                padding: '12px',
                fontFamily: 'monospace',
                fontSize: 13,
                lineHeight: 1.5,
                resize: 'none',
                overflowY: 'auto',
                opacity: varsUsedInTemplate.has('instruction') ? 1 : 0.6,
                cursor: varsUsedInTemplate.has('instruction') ? 'text' : 'not-allowed'
              }}
              className="styled-scrollbar"
              placeholder="Tapez ou sélectionnez une instruction..."
            />
          </div>
        </div>

        {/* LIGNE 10 : Footer & Publication */}
        <div style={{
          marginTop: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          paddingTop: 12,
          borderTop: '1px solid var(--border)'
        }}>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handlePasteImport}
              style={{
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                color: '#818cf8',
                padding: '10px 16px',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span>📥</span>
              Importer Data
            </button>
            <button
              type="button"
              onClick={() => {
                showToast('X X l’aperçu et le rendu Discord.', 'success');
              }}
              title=""
              style={{
                display: 'none'
              }}
            >
              { }
            </button>
            <button
              type="button"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Vider le formulaire',
                  message: 'Voulez-vous vraiment vider tous les champs du formulaire ? Cette action est irréversible.',
                  confirmText: 'Vider',
                  cancelText: 'Annuler',
                  type: 'danger'
                });
                if (ok) {
                  resetAllFields();
                  showToast('Formulaire vidé', 'success');
                }
              }}
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                padding: '10px 16px',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span>🗑️</span>
              Vider le formulaire
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {rateLimitCooldown !== null && (
              <div style={{ color: 'var(--error)', fontSize: 13, fontWeight: 700 }}>
                ⏳ Rate limit : {rateLimitCooldown}s
              </div>
            )}

            {editingPostId && (
              <button
                type="button"
                onClick={() => { setEditingPostId(null); setEditingPostData(null); showToast('Mode édition annulé', 'info'); }}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--muted)',
                  padding: '10px 20px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                ❌ Annuler l'édition
              </button>
            )}

            <button
              disabled={publishInProgress}
              onClick={async () => {
                const ok = await confirm({
                  title: editingPostId ? 'Mettre à jour' : 'Publier',
                  message: editingPostId ? 'Modifier ce post sur Discord ?' : 'Envoyer ce nouveau post sur Discord ?'
                });
                if (ok) {
                  const res = await publishPost(profile?.discord_id);
                  if (res && res.ok) {
                    showToast('Terminé !', 'success');
                    if (editingPostId) {
                      setEditingPostId(null);
                      setEditingPostData(null);
                    }
                  }
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '12px 32px',
                fontSize: 15,
                fontWeight: 700,
                background: publishInProgress ? 'var(--muted)' : (editingPostId ? '#f59e0b' : '#5865F2'),
                color: 'white',
                minWidth: '220px',
                cursor: publishInProgress ? 'not-allowed' : 'pointer',
                border: 'none',
                borderRadius: 6
              }}
            >
              {publishInProgress ? (
                <span>⏳ Patientez...</span>
              ) : editingPostId ? (
                <>
                  <span style={{ fontSize: 18 }}>✏️</span>
                  <span>Mettre à jour le post</span>
                </>
              ) : (
                <>
                  <img
                    src={DiscordIcon}
                    alt="Discord"
                    style={{ width: 20, height: 20, filter: 'brightness(0) invert(1)' }}
                  />
                  <span>Publier sur Discord</span>
                </>
              )}
            </button>
          </div>
        </div> {/* FIN LIGNE 10 */}

        {/* Overlay global pour fermer les suggestions */}
        {showInstructionSuggestions && (
          <div
            onClick={() => {
              setShowInstructionSuggestions(false);
            }}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
          />
        )}

        {/* Modale de sélection des tags */}
        <TagSelectorModal
          isOpen={showTagSelector}
          onClose={() => setShowTagSelector(false)}
          onSelectTag={handleSelectTag}
          selectedTagIds={selectedTagIds}
          position={tagSelectorPosition}
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
    </div>
  );
}
