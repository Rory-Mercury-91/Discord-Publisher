import React, { DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DiscordIcon from '../assets/discord-icon.svg';
import { useConfirm } from '../hooks/useConfirm';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { useApp } from '../state/appContext';
import ConfirmModal from './ConfirmModal';
import ImageThumbnail from './ImageThumbnail';
import { useToast } from './ToastProvider';

export default function ContentEditor() {
  const { allVarsConfig, inputs, setInput, preview,
    postTitle, setPostTitle, postTags, setPostTags, publishPost, publishInProgress, lastPublishResult,
    savedTags, savedTraductors, savedInstructions, templates, currentTemplateIdx,
    uploadedImages, addImages, addImageFromPath, removeImage, setMainImage, editingPostId, setEditingPostId,
    translationType, setTranslationType, isIntegrated, setIsIntegrated, setEditingPostData, rateLimitCooldown } = useApp();

  const { showToast } = useToast();
  const { confirm, confirmState, closeConfirm } = useConfirm();

  // Vérifier si le template actuel permet la publication (my/partner uniquement)
  const currentTemplate = templates[currentTemplateIdx];
  const canPublish = (currentTemplate?.type === 'my' || currentTemplate?.type === 'partner') &&
    rateLimitCooldown === null; // Désactiver si rate limit actif
  const isEditMode = editingPostId !== null;
  const rateLimitRemaining = rateLimitCooldown ? Math.ceil((rateLimitCooldown - Date.now()) / 1000) : 0;

  // Fonction pour réinitialiser tous les champs
  const resetAllFields = async () => {
    const ok = await confirm({
      title: 'Réinitialiser tous les champs',
      message: 'Voulez-vous vraiment vider tous les champs (variables, tags, images) ? Cette action est irréversible.',
      confirmText: 'Réinitialiser',
      type: 'danger'
    });

    if (!ok) return;

    // Reset toutes les variables
    allVarsConfig.forEach(v => setInput(v.name, ''));
    // Reset instruction
    setInput('instruction', '');
    // Reset titre et tags
    setPostTitle('');
    setPostTags('');
    // Reset images (supprimer toutes)
    while (uploadedImages.length > 0) {
      removeImage(0);
    }
    // Reset query states
    setTraductorSearchQuery('');
    setInstructionSearchQuery('');
    // Reset translation type and integration
    setTranslationType('Automatique');
    setIsIntegrated(false);

    showToast('Tous les champs ont été réinitialisés', 'success');
  };

  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [tagSearchQuery, setTagSearchQuery] = useState<string>('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [traductorSearchQuery, setTraductorSearchQuery] = useState<string>('');
  const [showTraductorSuggestions, setShowTraductorSuggestions] = useState(false);
  const [instructionSearchQuery, setInstructionSearchQuery] = useState<string>('');
  const [showInstructionSuggestions, setShowInstructionSuggestions] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const overviewRef = useRef<HTMLTextAreaElement | null>(null);

  // Undo/Redo pour le textarea Synopsis
  const { recordState, undo, redo, reset: resetUndoRedo } = useUndoRedo();

  // Enregistrer l'état initial
  useEffect(() => {
    recordState(inputs['Overview'] || '');
  }, []);

  // Gérer Ctrl+Z et Ctrl+Y dans le textarea Synopsis
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

  // Enregistrer l'état à chaque changement du Synopsis (avec debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      recordState(inputs['Overview'] || '');
    }, 500);
    return () => clearTimeout(timer);
  }, [inputs['Overview']]);

  // Filtrer les variables selon le template actuel
  const currentTemplateId = templates[currentTemplateIdx]?.id || templates[currentTemplateIdx]?.name;
  const visibleVars = useMemo(() => {
    return allVarsConfig.filter(v => {
      // Si la variable n'a pas de templates spécifiés, elle est visible partout
      if (!v.templates || v.templates.length === 0) return true;
      // Sinon, vérifier si le template actuel est dans la liste
      return v.templates.includes(currentTemplateId);
    });
  }, [allVarsConfig, currentTemplateId]);

  // Filtrer les tags selon le template actuel
  const visibleTags = useMemo(() => {
    return savedTags.filter(t => {
      // Si le tag n'a pas de template spécifié, il est visible partout
      if (!t.template) return true;
      // Sinon, vérifier si le template actuel correspond
      return t.template === currentTemplateId;
    });
  }, [savedTags, currentTemplateId]);

  // Filtrer les tags selon la recherche
  const filteredTags = useMemo(() => {
    if (!tagSearchQuery.trim()) return visibleTags;
    const query = tagSearchQuery.toLowerCase();
    return visibleTags.filter(t =>
      t.name.toLowerCase().includes(query) ||
      (t.id && t.id.toLowerCase().includes(query))
    );
  }, [visibleTags, tagSearchQuery]);

  // Filtrer les traducteurs selon la recherche
  const filteredTraductors = useMemo(() => {
    if (!traductorSearchQuery.trim()) return savedTraductors;
    const query = traductorSearchQuery.toLowerCase();
    return savedTraductors.filter(t => t.toLowerCase().includes(query));
  }, [savedTraductors, traductorSearchQuery]);

  // Filtrer les instructions selon la recherche
  const filteredInstructions = useMemo(() => {
    if (!instructionSearchQuery.trim()) return Object.keys(savedInstructions);
    const query = instructionSearchQuery.toLowerCase();
    return Object.keys(savedInstructions).filter(name => name.toLowerCase().includes(query));
  }, [savedInstructions, instructionSearchQuery]);

  // ============================================
  // DRAG & DROP SYSTEM - Gestion globale sur window
  // ============================================
  const [isDragging, setIsDragging] = useState(false);

  // Handlers globaux pour le drag & drop sur toute la fenêtre
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
      // Désactiver uniquement si on sort vraiment de la fenêtre
      if (!e.relatedTarget || (e.relatedTarget as Node).nodeName === 'HTML') {
        setIsDragging(false);
      }
    };

    const handleDrop = (e: globalThis.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        addImages(e.dataTransfer.files);
      }
    };

    // Attacher les listeners sur window
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
  }, [addImages]);

  // Handlers locaux pour le conteneur (fallback)
  function onImageDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files) addImages(e.dataTransfer.files);
  }
  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }
  function onDragEnter(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.types.includes('Files')) {
      setIsDragging(true);
    }
  }
  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (e.currentTarget === e.target && (!relatedTarget || !e.currentTarget.contains(relatedTarget))) {
      setIsDragging(false);
    }
  }

  return (
    <div
      onDrop={onImageDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      style={{ position: 'relative' }}
    >
      {/* Overlay drag & drop - Rendu via portail pour être au-dessus de tout */}
      {isDragging && createPortal(
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(79, 70, 229, 0.15)',
          border: '3px dashed rgba(79, 70, 229, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          pointerEvents: 'none',
          backdropFilter: 'blur(2px)'
        }}>
          <div style={{
            textAlign: 'center',
            background: 'rgba(79, 70, 229, 0.9)',
            padding: '24px 48px',
            borderRadius: 12,
            color: 'white',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
              Déposez vos images ici
            </div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>
              Les images seront ajoutées automatiquement
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Badge mode édition */}
      {isEditMode && (
        <div style={{
          background: 'rgba(125, 211, 252, 0.15)',
          border: '1px solid var(--accent)',
          borderRadius: 6,
          padding: 12,
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>
              ✏️ Mode édition
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Vous modifiez un post existant. Les modifications seront envoyées à Discord.
            </div>
          </div>
          <button
            onClick={() => {
              setEditingPostId(null);
              showToast('Mode édition annulé', 'info');
            }}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            ❌ Annuler
          </button>
        </div>
      )}

      <h4>📝 Contenu du post Discord</h4>
      <div style={{ display: 'grid', gap: 12 }}>
        {/* Titre, Tags et Image - Sur la même ligne */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr auto', gap: 12, alignItems: 'end' }}>
          {/* Titre */}
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Titre du post</label>
            <input
              placeholder="Titre (optionnel)"
              value={postTitle}
              onChange={e => setPostTitle(e.target.value)}
              style={{
                width: '100%',
                border: postTitle.trim() === '' ? '2px solid var(--error)' : undefined,
                outline: postTitle.trim() === '' ? 'none' : undefined
              }}
            />
          </div>

          {/* Tags */}
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Tags</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={selectedTagId}
                onChange={e => setSelectedTagId(e.target.value)}
                style={{ flex: 1, color: selectedTagId ? 'inherit' : 'var(--placeholder)' }}
              >
                <option value="">— Sélectionner un tag —</option>
                {visibleTags.map((t, idx) => (<option key={idx} value={t.id || t.name}>{t.name} ({t.id})</option>))}
              </select>
              <button onClick={() => {
                if (!selectedTagId) return;
                const currentTags = postTags ? postTags.split(',').map(s => s.trim()).filter(Boolean) : [];
                if (!currentTags.includes(selectedTagId)) {
                  setPostTags([...currentTags, selectedTagId].join(','));
                }
                setSelectedTagId('');
              }}>➕</button>
            </div>
          </div>

          {/* Image */}
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Image</label>
            <button onClick={() => imageInputRef.current?.click()}>🖼️ Parcourir</button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.avif,.bmp,.svg,.ico,.tiff,.tif"
              style={{ display: 'none' }}
              multiple
              onChange={async (e) => {
                if (e.target.files) {
                  // Essayer d'utiliser les chemins si disponibles (Tauri peut les exposer)
                  const files = Array.from(e.target.files);
                  for (const file of files) {
                    // Vérifier si le fichier a un chemin (via Tauri)
                    const filePath = (file as any).path;
                    if (filePath) {
                      // Utiliser le chemin directement (comme dans la version legacy)
                      await addImageFromPath(filePath);
                    } else {
                      // Sinon, utiliser addImages qui gère le base64
                      await addImages([file]);
                    }
                  }
                  // Réinitialiser l'input pour permettre de ré-ajouter le même fichier
                  if (e.target) {
                    e.target.value = '';
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Première ligne : Tags actifs */}
        {postTags && postTags.trim() && (
          <div style={{ padding: 8, background: 'rgba(74, 158, 255, 0.05)', borderRadius: 4, border: '1px solid rgba(74, 158, 255, 0.2)' }}>
            <div style={{ fontSize: 12, color: '#4a9eff', marginBottom: 6, fontWeight: 'bold' }}>Tags actifs :</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {postTags.split(',').map(s => s.trim()).filter(Boolean).map((tagId, idx) => {
                const tag = savedTags.find(t => (t.id || t.name) === tagId);
                return (
                  <div key={idx} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'rgba(74, 158, 255, 0.2)',
                    border: '1px solid #4a9eff',
                    borderRadius: 4,
                    padding: '4px 8px',
                    fontSize: 13
                  }}>
                    <span>{tag?.name || tagId}</span>
                    <button
                      onClick={() => {
                        const currentTags = postTags.split(',').map(s => s.trim()).filter(Boolean);
                        const newTags = currentTags.filter(t => t !== tagId);
                        setPostTags(newTags.join(','));
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ff6b6b',
                        cursor: 'pointer',
                        padding: '0 2px',
                        fontSize: 14
                      }}
                      title="Retirer"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Deuxième ligne : Vignettes des images */}
        {uploadedImages.length > 0 ? (
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6, fontWeight: 'bold' }}>
              Images ({uploadedImages.length}) :
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {uploadedImages.map((img, idx) => (
                <ImageThumbnail
                  key={img.id}
                  imagePath={img.path}
                  isMain={img.isMain}
                  onSetMain={() => setMainImage(idx)}
                  onCopyName={async () => {
                    await navigator.clipboard.writeText(img.path);
                    showToast('Nom copié dans le presse-papier', 'success');
                  }}
                  onDelete={async () => {
                    const ok = await confirm({
                      title: 'Supprimer l\'image',
                      message: 'Voulez-vous vraiment supprimer cette image ?',
                      confirmText: 'Supprimer',
                      type: 'danger'
                    });
                    if (ok) {
                      removeImage(idx);
                      showToast('Image supprimée', 'success');
                    }
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
            Aucune image uploadée. Glissez-déposez des images ici ou utilisez le bouton "Parcourir".
          </div>
        )}

        {/* Variables par défaut en grille 2 colonnes */}
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {/* Ligne 1 : Game_name | Traductor */}
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Nom du jeu</label>
              <input value={inputs['Game_name'] || ''} onChange={e => setInput('Game_name', e.target.value)} style={{ width: '100%' }} placeholder="Ex: Lost Solace" />
            </div>
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Traducteur</label>
              <input
                type="text"
                placeholder="Rechercher un traducteur..."
                value={traductorSearchQuery || inputs['Traductor'] || ''}
                onChange={e => {
                  setTraductorSearchQuery(e.target.value);
                  setInput('Traductor', e.target.value);
                  setShowTraductorSuggestions(true);
                }}
                onFocus={() => setShowTraductorSuggestions(true)}
                style={{ width: '100%' }}
              />
              {/* Suggestions traducteurs */}
              {showTraductorSuggestions && filteredTraductors.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  maxHeight: '200px',
                  overflowY: 'auto',
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderTop: 'none',
                  borderRadius: '0 0 4px 4px',
                  zIndex: 1000,
                  boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                }}>
                  {filteredTraductors.map((t, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setInput('Traductor', t);
                        setTraductorSearchQuery(t);
                        setShowTraductorSuggestions(false);
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: idx < filteredTraductors.length - 1 ? '1px solid #333' : 'none',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(74, 158, 255, 0.2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontWeight: 500 }}>{t}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ligne 2 : Game_version | Game_link */}
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Version du jeu</label>
              <input value={inputs['Game_version'] || ''} onChange={e => setInput('Game_version', e.target.value)} style={{ width: '100%' }} placeholder="v0.1" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Lien du jeu</label>
              <input value={inputs['Game_link'] || ''} onChange={e => setInput('Game_link', e.target.value)} style={{ width: '100%' }} placeholder="https://..." />
            </div>

            {/* Ligne 3 : Translate_version | Translate_link */}
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Version de la traduction</label>
              <input value={inputs['Translate_version'] || ''} onChange={e => setInput('Translate_version', e.target.value)} style={{ width: '100%' }} placeholder="v0.1" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                Lien de la traduction
                {isIntegrated && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', fontStyle: 'italic' }}>
                    (Fusionné avec le lien du jeu)
                  </span>
                )}
              </label>
              <input
                value={inputs['Translate_link'] || ''}
                onChange={e => setInput('Translate_link', e.target.value)}
                style={{
                  width: '100%',
                  opacity: isIntegrated ? 0.5 : 1,
                  cursor: isIntegrated ? 'not-allowed' : 'text'
                }}
                placeholder="https://..."
                readOnly={isIntegrated}
                title={isIntegrated ? 'Le lien est fusionné avec le lien du jeu car la traduction est intégrée' : ''}
              />
            </div>
          </div>

          {/* Nouvelle section : Type de traduction et intégration */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Type de traduction</label>
              <select
                value={translationType}
                onChange={e => setTranslationType(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="Automatique">Automatique</option>
                <option value="Semi-automatique">Semi-automatique</option>
                <option value="Manuelle">Manuelle</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: 'var(--muted)',
                cursor: 'pointer',
                userSelect: 'none'
              }}>
                <input
                  type="checkbox"
                  checked={isIntegrated}
                  onChange={e => setIsIntegrated(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <span>Traduction intégrée au jeu (VF incluse)</span>
                {isIntegrated && (
                  <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }} title="Le lien de traduction sera fusionné avec le lien du jeu">
                    ℹ️
                  </span>
                )}
              </label>
            </div>

            {/* Nouvelle section : Jeu modé */}
            <div style={{ gridColumn: '1 / -1', marginTop: 12 }}>
              <div style={{
                padding: 12,
                background: 'rgba(168, 85, 247, 0.1)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: 6
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}>
                    <input
                      type="checkbox"
                      checked={inputs['is_modded_game'] === 'true'}
                      onChange={e => setInput('is_modded_game', e.target.checked ? 'true' : 'false')}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                    <span>🎮 Jeu modé</span>
                  </label>
                </div>

                {inputs['is_modded_game'] === 'true' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                      Lien du mod
                    </label>
                    <input
                      value={inputs['mod_link'] || ''}
                      onChange={e => setInput('mod_link', e.target.value)}
                      style={{ width: '100%' }}
                      placeholder="https://..."
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Information sur le nettoyage automatique des liens */}
            <div style={{
              gridColumn: '1 / -1',
              fontSize: 11,
              color: 'var(--muted)',
              fontStyle: 'italic',
              padding: '8px 12px',
              background: 'rgba(74, 158, 255, 0.05)',
              borderRadius: 4,
              border: '1px solid rgba(74, 158, 255, 0.2)'
            }}>
              💡 <strong>Info :</strong> Les liens F95Zone et LewdCorner sont automatiquement raccourcis (uniquement l'ID du thread est conservé).
            </div>

            {/* Variables personnalisées (on filtre les nouveaux noms par défaut) */}
            {visibleVars.filter(v => !['Game_name', 'Game_version', 'Translate_version', 'Game_link', 'Translate_link', 'Traductor', 'Overview', 'instruction'].includes(v.name)).map((v, idx) => (
              <div key={v.name} style={v.fullWidth ? { gridColumn: '1 / -1' } : {}}>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>{v.label}</label>
                {v.type === 'textarea' ? (
                  <textarea value={inputs[v.name] || ''} onChange={e => setInput(v.name, e.target.value)} rows={3} style={{ width: '100%' }} placeholder={v.placeholder} spellCheck={true} lang="fr-FR" />
                ) : (
                  <input value={inputs[v.name] || ''} onChange={e => setInput(v.name, e.target.value)} style={{ width: '100%' }} placeholder={v.placeholder} />
                )}
              </div>
            ))}
          </div>

          {/* Synopsis en pleine largeur */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
              Synopsis
              <span style={{ fontSize: 10, marginLeft: 8, opacity: 0.5 }}>Ctrl+Z / Ctrl+Y pour annuler/refaire</span>
            </label>
            <textarea
              ref={overviewRef}
              value={inputs['Overview'] || ''}
              onChange={e => setInput('Overview', e.target.value)}
              onKeyDown={handleOverviewKeyDown}
              rows={6}
              style={{ width: '100%' }}
              placeholder="Synopsis du jeu..."
              spellCheck={true}
              lang="fr-FR"
            />
          </div>

          {/* Instruction (optionnelle) */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
              Instruction (optionnelle)
              <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.6 }}>
                💡 Variable : [instruction]
              </span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Rechercher une instruction..."
                value={instructionSearchQuery || inputs['instruction'] || ''}
                onChange={e => {
                  setInstructionSearchQuery(e.target.value);
                  setInput('instruction', e.target.value);
                  setShowInstructionSuggestions(true);
                }}
                onFocus={() => setShowInstructionSuggestions(true)}
                style={{ width: '100%' }}
              />

              {showInstructionSuggestions && filteredInstructions.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  maxHeight: '200px',
                  overflowY: 'auto',
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderTop: 'none',
                  borderRadius: '0 0 4px 4px',
                  zIndex: 1000,
                  boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                }}>
                  {filteredInstructions.map((name, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setInput('instruction', savedInstructions[name]);
                        setInstructionSearchQuery(name);
                        setShowInstructionSuggestions(false);
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: idx < filteredInstructions.length - 1 ? '1px solid #333' : 'none',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(74, 158, 255, 0.2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontWeight: 500 }}>{name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {savedInstructions[name].substring(0, 60)}...
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bouton Publier - aligné à droite */}
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
          {lastPublishResult && <div style={{ color: lastPublishResult.startsWith('❌') || lastPublishResult.startsWith('Erreur') ? 'var(--error)' : 'var(--success)', fontSize: 14 }}>{lastPublishResult}</div>}
          {rateLimitCooldown !== null && (
            <div style={{ color: 'var(--error)', fontSize: 14, fontWeight: 600 }}>
              ⏳ Rate limit actif: {rateLimitRemaining}s restantes
            </div>
          )}
          {!canPublish && rateLimitCooldown === null && (
            <div style={{ color: 'var(--muted)', fontSize: 14, fontStyle: 'italic' }}>
              📋 Ce template est réservé à la copie. Seuls "Mes traductions" et "Traductions partenaire" peuvent être publiés.
            </div>
          )}
          {isEditMode && (
            <button
              onClick={async () => {
                const ok = await confirm({
                  title: 'Annuler l\'édition',
                  message: 'Voulez-vous annuler l\'édition et revenir au mode création ?',
                  confirmText: 'Annuler l\'édition',
                  cancelText: 'Continuer',
                  type: 'warning'
                });
                if (!ok) return;

                setEditingPostId(null);
                setEditingPostData(null);
                showToast('Édition annulée', 'info');
              }}
              style={{
                padding: '12px 24px',
                fontSize: 16,
                fontWeight: 600,
                background: 'transparent',
                color: 'var(--muted)',
                border: '1px solid var(--border)',
                cursor: 'pointer'
              }}
            >
              ❌ Annuler l'édition
            </button>
          )}
          <button
            onClick={async () => {
              if (publishInProgress || !canPublish) return;

              const confirmMessage = isEditMode
                ? 'Voulez-vous mettre à jour ce post sur Discord ?'
                : 'Voulez-vous publier ce post sur l\'API Publisher ?';

              const ok = await confirm({
                title: isEditMode ? 'Mettre à jour le post' : 'Publier sur Discord',
                message: confirmMessage,
                confirmText: isEditMode ? 'Mettre à jour' : 'Publier',
                type: 'info'
              });
              if (!ok) return;

              const res = await publishPost();
              if (res.ok) {
                showToast(isEditMode ? 'Mise à jour réussie !' : 'Publication réussie !', 'success', 5000);
                if (isEditMode) {
                  setEditingPostId(null);
                  setEditingPostData(null);
                }
              } else {
                showToast('Erreur: ' + (res.error || 'inconnue'), 'error', 5000);
              }
            }}
            style={{
              padding: '12px 24px',
              fontSize: 16,
              fontWeight: 600,
              background: (publishInProgress || !canPublish) ? 'var(--muted)' : '#5865F2',
              color: '#ffffff',
              cursor: (publishInProgress || !canPublish) ? 'not-allowed' : 'pointer',
              opacity: !canPublish ? 0.5 : 1
            }}
            disabled={publishInProgress || !canPublish}
            title={!canPublish ? 'Seuls les templates "Mes traductions" et "Traductions partenaire" peuvent être publiés' : ''}
          >
            {publishInProgress
              ? (isEditMode ? '⏳ Mise à jour en cours...' : '⏳ Publication en cours...')
              : (isEditMode ? '✏️ Mettre à jour le post' : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={DiscordIcon} alt="Discord" style={{ width: 20, height: 20, filter: 'brightness(0) invert(1)' }} />
                  Publier sur Discord
                </span>
              ))}
          </button>
        </div>
      </div>

      {/* Overlay pour fermer les suggestions */}
      {(showTagSuggestions || showTraductorSuggestions || showInstructionSuggestions) && (
        <div
          onClick={() => {
            setShowTagSuggestions(false);
            setShowTraductorSuggestions(false);
            setShowInstructionSuggestions(false);
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999
          }}
        />
      )}

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        type={confirmState.type}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}
