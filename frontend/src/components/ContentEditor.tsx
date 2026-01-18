import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DiscordIcon from '../assets/discord-icon.svg';
import { useConfirm } from '../hooks/useConfirm';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { useApp } from '../state/appContext';
import ConfirmModal from './ConfirmModal';
import ImageThumbnail from './ImageThumbnail';
import { useToast } from './ToastProvider';

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
    savedTraductors,
    savedInstructions,
    templates,
    currentTemplateIdx,
    uploadedImages,
    addImages,
    addImageFromPath,
    removeImage,
    setMainImage,
    editingPostId,
    setEditingPostId,
    translationType,
    setTranslationType,
    isIntegrated,
    setIsIntegrated,
    setEditingPostData,
    rateLimitCooldown
  } = useApp();

  const { showToast } = useToast();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const { linkConfigs, setLinkConfig, /* autres... */ } = useApp();
  // 2️⃣ ENSUITE : Calculer les valeurs dérivées
  const currentTemplate = templates[currentTemplateIdx]; // ✅ UNE SEULE FOIS
  const canPublish = (currentTemplate?.type === 'my' || currentTemplate?.type === 'partner') &&
    rateLimitCooldown === null;
  const isEditMode = editingPostId !== null;
  const rateLimitRemaining = rateLimitCooldown ? Math.ceil((rateLimitCooldown - Date.now()) / 1000) : 0;

  // 3️⃣ États locaux
  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [tagSearchQuery, setTagSearchQuery] = useState<string>('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [traductorSearchQuery, setTraductorSearchQuery] = useState<string>('');
  const [showTraductorSuggestions, setShowTraductorSuggestions] = useState(false);
  const [instructionSearchQuery, setInstructionSearchQuery] = useState<string>('');
  const [showInstructionSuggestions, setShowInstructionSuggestions] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const overviewRef = useRef<HTMLTextAreaElement | null>(null);

  // 4️⃣ ENFIN : useEffect (maintenant setInput et currentTemplateIdx sont disponibles)
  useEffect(() => {
    setTraductorSearchQuery('');
    setInstructionSearchQuery('');
    setInput('Traductor', '');
    setInput('instruction', '');
  }, [currentTemplateIdx, editingPostId]);

  // Undo/Redo pour le textarea Synopsis
  const { recordState, undo, redo, reset: resetUndoRedo } = useUndoRedo();

  useEffect(() => {
    recordState(inputs['Overview'] || '');
  }, []);

  const handleOverviewKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      const prevState = undo();
      if (prevState !== null) {
        setInput('Overview', prevState);
      }
    } else if (e.ctrlKey && e.key === 'y') {
      e.preventDefault();
      const nextState = redo();
      if (nextState !== null) {
        setInput('Overview', nextState);
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      recordState(inputs['Overview'] || '');
    }, 500);
    return () => clearTimeout(timer);
  }, [inputs['Overview']]);

  const currentTemplateId = templates[currentTemplateIdx]?.id || templates[currentTemplateIdx]?.name;

  // Variables déjà affichées en dur dans le formulaire (à exclure de visibleVars)
  const hardcodedVarNames = [
    'Game_name', 'Game_version', 'Game_link', 'Translate_version', 'Translate_link',
    'Traductor', 'Developpeur', 'Overview', 'is_modded_game', 'Mod_link', 'instruction'
  ];

  const visibleVars = useMemo(() => {
    return allVarsConfig.filter(v => {
      // Exclure les variables déjà affichées en dur
      if (hardcodedVarNames.includes(v.name)) return false;

      // Filtrer par template si nécessaire
      if (!v.templates || v.templates.length === 0) return true;
      return v.templates.includes(currentTemplateId);
    });
  }, [allVarsConfig, currentTemplateId]);

  const visibleTags = useMemo(() => {
    return savedTags.filter(t => {
      if (!t.template) return true;
      return t.template === currentTemplateId;
    });
  }, [savedTags, currentTemplateId]);

  const filteredTags = useMemo(() => {
    if (!tagSearchQuery.trim()) return visibleTags;
    const query = tagSearchQuery.toLowerCase();
    return visibleTags.filter(t =>
      t.name.toLowerCase().includes(query) ||
      (t.id && t.id.toLowerCase().includes(query))
    );
  }, [visibleTags, tagSearchQuery]);

  const filteredTraductors = useMemo(() => {
    if (!traductorSearchQuery.trim()) return savedTraductors;
    const query = traductorSearchQuery.toLowerCase();
    return savedTraductors.filter(t => t.toLowerCase().includes(query));
  }, [savedTraductors, traductorSearchQuery]);

  const filteredInstructions = useMemo(() => {
    if (!instructionSearchQuery.trim()) return Object.keys(savedInstructions);
    const query = instructionSearchQuery.toLowerCase();
    return Object.keys(savedInstructions).filter(name => name.toLowerCase().includes(query));
  }, [savedInstructions, instructionSearchQuery]);

function LinkField({
  label,
  linkName,
  placeholder,
  disabled
}: {
  label: string;
  linkName: 'Game_link' | 'Translate_link' | 'Mod_link';
  placeholder: string;
  disabled?: boolean;
}) {
  const config = linkConfigs[linkName];

  // Nettoyage automatique des URLs collées
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (config.source !== 'Autre') {
      const threadIdMatch = val.match(/threads\/.*\.(\d+)\/?/);
      if (threadIdMatch && threadIdMatch[1]) {
        val = threadIdMatch[1];
      }
    }
    setLinkConfig(linkName, config.source, val);
  };

  // Calcul du lien final pour l'affichage
  const finalUrl = config.source === 'F95'
    ? `https://f95zone.to/threads/${config.value || '...'}/`
    : config.source === 'Lewd'
      ? `https://lewdcorner.com/threads/${config.value || '...'}/`
      : config.value || '...';

  return (
    <div style={{ marginBottom: '20px' }}>
      {/* LIGNE 1 : Label et Prévisualisation du lien final */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 8 
      }}>
        <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
          {label}
        </label>
        
        {/* Ton lien nettoyé s'affiche ici, à droite du label */}
        <div style={{
          fontSize: 11,
          color: '#5865F2', // Couleur Blurple Discord pour rappeler un lien
          fontFamily: 'monospace',
          padding: '2px 8px',
          background: 'rgba(88, 101, 242, 0.1)',
          borderRadius: 4,
          maxWidth: '300px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          🔗 {finalUrl}
        </div>
      </div>

      {/* LIGNE 2 : Les contrôles (Dropdown + Input) */}
      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8 }}>
        <select
          value={config.source}
          onChange={(e) => setLinkConfig(linkName, e.target.value as any, config.value)}
          style={{
            height: '38px',
            borderRadius: 6,
            padding: '0 8px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontSize: 13,
            cursor: 'pointer'
          }}
        >
          <option value="F95">F95</option>
          <option value="Lewd">Lewd</option>
          <option value="Autre">Autre</option>
        </select>

        <input
          type="text"
          value={config.value}
          onChange={handleInputChange}
          placeholder={config.source === 'Autre' ? placeholder : 'Collez l\'ID ou l\'URL complète'}
          disabled={disabled}
          style={{
            height: '38px',
            borderRadius: 6,
            padding: '0 12px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            opacity: disabled ? 0.5 : 1
          }}
        />
      </div>
    </div>
  );
}

  // ============================================
  // DRAG & DROP SYSTEM - Global sur toute l'app
  // ============================================
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handleDragOver = (e: globalThis.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDragEnter = (e: globalThis.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: globalThis.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!e.relatedTarget || (e.relatedTarget as Node).nodeName === 'HTML') {
        setIsDragging(false);
      }
    };

    const handleDrop = (e: globalThis.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        // Une seule image : supprimer l'ancienne si elle existe, puis ajouter la nouvelle
        if (uploadedImages.length > 0) {
          removeImage(0);
        }
        const firstFile = e.dataTransfer.files[0];
        const filePath = (firstFile as any).path;
        if (filePath) {
          addImageFromPath(filePath);
        } else {
          addImages([firstFile]);
        }
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [addImages, addImageFromPath, removeImage, uploadedImages]);

  return (
    <div style={{ position: 'relative', height: '100%', minHeight: 0, overflow: 'auto', boxSizing: 'border-box', width: '100%', maxWidth: '100%' }}>
      {/* Overlay drag & drop global */}
      {isDragging && createPortal(
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(79, 70, 229, 0.15)',
          border: '3px dashed #5865F2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          pointerEvents: 'none',
          backdropFilter: 'blur(2px)'
        }}>
          <div style={{
            textAlign: 'center',
            background: '#5865F2',
            padding: '24px 48px',
            borderRadius: 12,
            color: 'white',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>📸 Déposez votre image ici</div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>L'image remplacera l'image actuelle si elle existe</div>
          </div>
        </div>,
        document.body
      )}

      {/* Badge mode édition */}
      {isEditMode && (
        <div style={{
          background: 'rgba(125, 211, 252, 0.1)',
          border: '1px solid var(--accent)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: 2 }}>✏️ Mode édition</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Vous modifiez un post existant sur Discord.</div>
          </div>
          <button
            onClick={() => {
              setEditingPostId(null);
              showToast('Mode édition annulé', 'info');
            }}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            ❌ Annuler
          </button>
        </div>
      )}

      {/* LIGNE 1 : Titre */}
      <h4 style={{ marginBottom: 16 }}>📝 Contenu du post Discord</h4>

      <div style={{ display: 'grid', gap: 16, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>

        {/* LIGNE 2 : Grid 3 colonnes - Infos clés / Tags / Média */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 12, width: '100%', maxWidth: '100%' }}>

          {/* Col 1 : Infos clés */}
          <div style={{ display: 'grid', gap: 12 }}>
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
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
                Nom du jeu
              </label>
              <input
                value={inputs['Game_name'] || ''}
                onChange={e => setInput('Game_name', e.target.value)}
                style={{ width: '100%', height: '40px', borderRadius: 6, padding: '0 12px' }}
                placeholder="Nom du jeu"
              />
            </div>
          </div>

          {/* Col 2 : Tags (Dropdown) */}
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
              Tags
            </label>
            {/* Ligne 1 : Dropdown pour sélectionner un tag */}
            <div style={{ position: 'relative' }}>
              <div
                className="suggestions-dropdown"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 1001,
                  maxHeight: '200px',
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: 'var(--bg)',
                  marginTop: 4,
                  display: showTagSuggestions && visibleTags.length > 0 ? 'block' : 'none'
                }}
              >
                {visibleTags.map((t, idx) => {
                  const tagId = (t.id || t.name);
                  const isSelected = postTags ? postTags.split(',').map(s => s.trim()).includes(tagId) : false;
                  return (
                    <div
                      key={idx}
                      className="suggestion-item"
                      onClick={() => {
                        if (!isSelected) {
                          const currentTags = postTags ? postTags.split(',').map(s => s.trim()).filter(Boolean) : [];
                          setPostTags([...currentTags, tagId].join(','));
                        }
                        setShowTagSuggestions(false);
                        setTagSearchQuery('');
                      }}
                      style={{
                        opacity: isSelected ? 0.5 : 1,
                        cursor: isSelected ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{t.name}</div>
                      {t.id && <div style={{ fontSize: 11, opacity: 0.7 }}>{t.id}</div>}
                      {isSelected && <div style={{ fontSize: 10, opacity: 0.7 }}>✓ Déjà ajouté</div>}
                    </div>
                  );
                })}
              </div>
              <input
                type="text"
                value={tagSearchQuery}
                onChange={(e) => {
                  const v = e.target.value;
                  setTagSearchQuery(v);
                  setShowTagSuggestions(true);
                }}
                onFocus={() => setShowTagSuggestions(true)}
                placeholder="Rechercher un tag..."
                style={{
                  width: '100%',
                  height: '40px',
                  borderRadius: 6,
                  padding: '0 12px',
                  border: '1px solid var(--border)'
                }}
              />
            </div>

            {/* Ligne 2 : Tags actifs affichés (sans conteneur) */}
            {postTags && postTags.trim() && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginTop: 8
              }}>
                {postTags.split(',').map(s => s.trim()).filter(Boolean).map((tagId, idx) => {
                  const tag = savedTags.find(t => (t.id || t.name) === tagId);
                  return (
                    <div
                      key={idx}
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
                        fontWeight: 600
                      }}
                    >
                      <span style={{ color: 'var(--text)' }}>{tag?.name || tagId}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newTags = postTags
                            .split(',')
                            .map(s => s.trim())
                            .filter(t => t && t !== tagId);
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
            )}
          </div>

          {/* Col 3 : Média (Taille de la vignette) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
              Média
            </label>
            {uploadedImages.length === 0 ? (
              <div
                onClick={() => imageInputRef.current?.click()}
                style={{
                  width: '120px',
                  minHeight: '140px',
                  margin: '0 auto',
                  border: '2px dashed var(--border)',
                  borderRadius: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.02)',
                  transition: 'all 0.2s',
                  color: 'var(--muted)',
                  padding: '16px',
                  gap: '12px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.background = 'rgba(99, 102, 241, 0.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                }}
              >
                <div style={{ fontSize: 32 }}>🖼️</div>
                <div style={{ fontSize: 11, fontWeight: 600, textAlign: 'center' }}>
                  Glisser ou cliquer
                </div>
              </div>
            ) : (
              <ImageThumbnail
                imagePath={uploadedImages[0].path}
                isMain={true}
                onSetMain={() => { }}
                onCopyName={() => { }}
                onDelete={async () => {
                  const ok = await confirm({ title: 'Supprimer', message: 'Supprimer cette image ?', type: 'danger' });
                  if (ok) removeImage(0);
                }}
                onChange={() => {
                  imageInputRef.current?.click();
                }}
              />
            )}

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={async (e) => {
                if (e.target.files && e.target.files.length > 0) {
                  // Une seule image : supprimer l'ancienne si elle existe, puis ajouter la nouvelle
                  if (uploadedImages.length > 0) {
                    removeImage(0);
                  }
                  const file = e.target.files[0];
                  const filePath = (file as any).path;
                  if (filePath) {
                    await addImageFromPath(filePath);
                  } else {
                    await addImages([file]);
                  }
                  e.target.value = '';
                }
              }}
            />
          </div>
        </div>

        {/* LIGNE 3 : Grid 2 colonnes - Technique (Jeu / Traduction) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          {/* Col 1 : Jeu */}
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
                Développeur
              </label>
              <input
                value={inputs['Developpeur'] || ''}
                onChange={e => setInput('Developpeur', e.target.value)}
                style={{ width: '100%', height: '40px', borderRadius: 6, padding: '0 12px' }}
                placeholder="Nom du développeur"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
                Version du jeu
              </label>
              <input
                value={inputs['Game_version'] || ''}
                onChange={e => setInput('Game_version', e.target.value)}
                style={{ width: '100%', height: '40px', borderRadius: 6, padding: '0 12px' }}
                placeholder="v1.0.4"
              />
            </div>

            <div>
              <LinkField
                label="Lien du jeu"
                linkName="Game_link"
                placeholder="https://..."
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
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
                  fontWeight: 600
                }}>
                  <input
                    type="checkbox"
                    checked={isIntegrated}
                    onChange={e => setIsIntegrated(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <span>Traduction intégrée (VF incluse)</span>
                </label>
              </div>
              <div style={{
                display: 'flex',
                gap: 4,
                padding: 4,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.03)'
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
                        height: 38,
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

          {/* Col 2 : Traduction */}
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
                Traducteur
              </label>
              <input
                type="text"
                value={traductorSearchQuery || inputs['Traductor'] || ''}
                onChange={e => {
                  setTraductorSearchQuery(e.target.value);
                  setInput('Traductor', e.target.value);
                  setShowTraductorSuggestions(true);
                }}
                onFocus={() => setShowTraductorSuggestions(true)}
                style={{ width: '100%', height: '40px', borderRadius: 6, padding: '0 12px' }}
                placeholder="Nom du traducteur..."
              />
              {showTraductorSuggestions && filteredTraductors.length > 0 && (
                <div
                  className="suggestions-dropdown"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 1001
                  }}
                >
                  {filteredTraductors.map((t, idx) => (
                    <div
                      key={idx}
                      className="suggestion-item"
                      onClick={() => {
                        setInput('Traductor', t);
                        setTraductorSearchQuery(t);
                        setShowTraductorSuggestions(false);
                      }}
                    >
                      {t}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
                Version de la trad
              </label>
              <input
                value={inputs['Translate_version'] || ''}
                onChange={e => setInput('Translate_version', e.target.value)}
                style={{ width: '100%', height: '40px', borderRadius: 6, padding: '0 12px' }}
                placeholder="v1.0"
              />
            </div>

            <div>
              <LinkField
                label={isIntegrated ? "Lien de la trad (Fusionné)" : "Lien de la trad"}
                linkName="Translate_link"
                placeholder="https://..."
              />
            </div>

            <div>
              {/* Conteneur de l'en-tête (Label + Checkbox) */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: 6 
              }}>
                <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                  Lien du mod
                </span>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  userSelect: 'none',
                  fontSize: 12,
                  color: 'var(--text)',
                  fontWeight: 700,
                  background: 'rgba(255, 255, 255, 0.05)', // Un petit fond pour bien détacher l'option
                  padding: '4px 8px',
                  borderRadius: 4
                }}>
                  <input
                    type="checkbox"
                    checked={inputs['is_modded_game'] === 'true'}
                    onChange={e => setInput('is_modded_game', e.target.checked ? 'true' : 'false')}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <span>Jeu modé</span>
                </label>
              </div>

              {/* Le LinkField (qui sera grisé si la case n'est pas cochée) */}
              <LinkField
                label="" // On laisse vide ici car on a fait notre propre label au-dessus
                linkName="Mod_link"
                placeholder="ID du thread ou URL..."
                disabled={inputs['is_modded_game'] !== 'true'}
              />
            </div>
          </div>
        </div>

        {/* LIGNE 4 : Variables Custom (masquer si aucune) */}
        {visibleVars.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {visibleVars.map((v) => (
              <div key={v.name}>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
                  {v.label || v.name}
                </label>
                <input
                  value={inputs[v.name] || ''}
                  onChange={e => setInput(v.name, e.target.value)}
                  style={{ width: '100%', height: '40px', borderRadius: 6, padding: '0 12px' }}
                  placeholder={v.placeholder || ''}
                />
              </div>
            ))}
          </div>
        )}

        {/* LIGNE 5 : Grid 2 colonnes - Synopsis / Instructions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* Synopsis (gauche) */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
              Synopsis
            </label>
            <textarea
              ref={overviewRef}
              value={inputs['Overview'] || ''}
              onChange={e => setInput('Overview', e.target.value)}
              onKeyDown={handleOverviewKeyDown}
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
                overflowY: 'auto'
              }}
              className="styled-scrollbar"
              placeholder="Décrivez le jeu..."
            />
          </div>

          {/* Instructions (droite) */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
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
              style={{
                width: '100%',
                height: '40px',
                borderRadius: 6,
                padding: '0 12px',
                marginBottom: 8
              }}
            />
            {showInstructionSuggestions && filteredInstructions.length > 0 && (
              <div
                className="suggestions-dropdown"
                style={{
                  position: 'absolute',
                  top: '74px',
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
            <textarea
              value={inputs['instruction'] || ''}
              onChange={e => setInput('instruction', e.target.value)}
              style={{
                width: '100%',
                flex: 1,
                minHeight: '100px',
                maxHeight: '140px',
                borderRadius: 6,
                padding: '12px',
                fontFamily: 'monospace',
                fontSize: 13,
                lineHeight: 1.5,
                resize: 'none',
                overflowY: 'auto'
              }}
              className="styled-scrollbar"
              placeholder="Tapez ou sélectionnez une instruction..."
            />
          </div>
        </div>

        {/* Footer & Publication */}
        <div style={{
          marginTop: 8,
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 16,
          paddingTop: 12,
          borderTop: '1px solid var(--border)'
        }}>
          {rateLimitCooldown !== null && (
            <div style={{ color: 'var(--error)', fontSize: 13, fontWeight: 700 }}>
              ⏳ Rate limit : {rateLimitRemaining}s
            </div>
          )}

          {isEditMode && (
            <button
              onClick={() => { setEditingPostId(null); setEditingPostData(null); }}
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
              Annuler l'édition
            </button>
          )}

          <button
            disabled={publishInProgress || !canPublish}
            onClick={async () => {
              const ok = await confirm({
                title: isEditMode ? 'Mettre à jour' : 'Publier',
                message: isEditMode ? 'Modifier ce post sur Discord ?' : 'Envoyer ce nouveau post sur Discord ?'
              });
              if (ok) {
                const res = await publishPost();
                if (res.ok) {
                  showToast('Terminé !', 'success');
                  if (isEditMode) { setEditingPostId(null); setEditingPostData(null); }
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
              background: (publishInProgress || !canPublish) ? 'var(--muted)' : '#5865F2',
              color: 'white',
              minWidth: '220px',
              cursor: (publishInProgress || !canPublish) ? 'not-allowed' : 'pointer',
              border: 'none',
              borderRadius: 6,
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!publishInProgress && canPublish) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(88, 101, 242, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {publishInProgress ? (
              <span>⏳ Patientez...</span>
            ) : (
              <>
                <img
                  src={DiscordIcon}
                  alt="Discord"
                  style={{
                    width: 20,
                    height: 20,
                    filter: 'brightness(0) invert(1)'
                  }}
                />
                <span>Publier</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* Overlay global pour fermer les suggestions */}
      {(showTagSuggestions || showTraductorSuggestions || showInstructionSuggestions) && (
        <div
          onClick={() => {
            setShowTagSuggestions(false);
            setShowTraductorSuggestions(false);
            setShowInstructionSuggestions(false);
          }}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
        />
      )}

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
