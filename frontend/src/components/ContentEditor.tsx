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
  const { allVarsConfig, inputs, setInput, preview,
    postTitle, setPostTitle, postTags, setPostTags, publishPost, publishInProgress, lastPublishResult,
    savedTags, savedTraductors, savedInstructions, templates, currentTemplateIdx,
    uploadedImages, addImages, addImageFromPath, removeImage, setMainImage, editingPostId, setEditingPostId,
    translationType, setTranslationType, isIntegrated, setIsIntegrated, setEditingPostData, rateLimitCooldown } = useApp();

  const { showToast } = useToast();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  const currentTemplate = templates[currentTemplateIdx];
  const canPublish = (currentTemplate?.type === 'my' || currentTemplate?.type === 'partner') &&
    rateLimitCooldown === null;
  const isEditMode = editingPostId !== null;
  const rateLimitRemaining = rateLimitCooldown ? Math.ceil((rateLimitCooldown - Date.now()) / 1000) : 0;

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
  const visibleVars = useMemo(() => {
    return allVarsConfig.filter(v => {
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
        addImages(e.dataTransfer.files);
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
  }, [addImages]);

  return (
    <div style={{ position: 'relative' }}>
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
            <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>📸 Déposez vos images ici</div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>Les images seront ajoutées automatiquement</div>
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

      <h4 style={{ marginBottom: 16 }}>📝 Contenu du post Discord</h4>

      <div style={{ display: 'grid', gap: 16 }}>

        {/* ========== LIGNE 1 : TITRE - TAGS - IMAGES ========== */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr', gap: 12 }}>

          {/* TITRE */}
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
              Titre du post
            </label>
            <input
              placeholder="Titre (requis)"
              value={postTitle}
              onChange={e => setPostTitle(e.target.value)}
              style={{
                width: '100%',
                height: '40px',
                border: postTitle.trim() === '' ? '1px solid var(--error)' : '1px solid var(--border)',
                borderRadius: 6,
                padding: '0 12px'
              }}
            />
          </div>

          {/* TAGS */}
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
              Tags
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={tagSearchQuery}
                onChange={(e) => {
                  const v = e.target.value;
                  setTagSearchQuery(v);
                  setShowTagSuggestions(true);
                  if (!v.trim()) setSelectedTagId('');
                }}
                onFocus={() => setShowTagSuggestions(true)}
                placeholder="Rechercher un tag..."
                style={{
                  flex: 1,
                  width: '100%',
                  height: '40px',
                  borderRadius: 6,
                  padding: '0 12px'
                }}
              />

              <button
                type="button"
                onClick={() => {
                  if (!selectedTagId) return;
                  const currentTags = postTags ? postTags.split(',').map(s => s.trim()).filter(Boolean) : [];
                  if (!currentTags.includes(selectedTagId)) {
                    setPostTags([...currentTags, selectedTagId].join(','));
                  }
                  setSelectedTagId('');
                  setTagSearchQuery('');
                  setShowTagSuggestions(false);
                }}
                style={{
                  padding: '0 16px',
                  height: '40px',
                  borderRadius: 6,
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                ➕
              </button>
            </div>

            {showTagSuggestions && filteredTags.length > 0 && (
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
                {filteredTags.map((t, idx) => {
                  const tagId = (t.id || t.name);
                  return (
                    <div
                      key={idx}
                      className="suggestion-item"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSelectedTagId(tagId);
                        setTagSearchQuery(t.name);
                        setShowTagSuggestions(false);
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{t.name}</div>
                      {t.id && <div style={{ fontSize: 11, opacity: 0.7 }}>{t.id}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ZONE IMAGES */}
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
              Images ({uploadedImages.length})
            </label>

            <div
              onClick={() => imageInputRef.current?.click()}
              style={{
                height: '40px',
                border: '2px dashed var(--border)',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.02)',
                transition: 'all 0.2s',
                color: 'var(--muted)',
                fontSize: 13,
                fontWeight: 600
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
              {uploadedImages.length > 0 ? (
                `✓ ${uploadedImages.length} image${uploadedImages.length > 1 ? 's' : ''}`
              ) : (
                '🖼️ Glisser ou cliquer'
              )}
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              multiple
              onChange={async (e) => {
                if (e.target.files) {
                  const files = Array.from(e.target.files);
                  for (const file of files) {
                    const filePath = (file as any).path;
                    filePath ? await addImageFromPath(filePath) : await addImages([file]);
                  }
                  e.target.value = '';
                }
              }}
            />
          </div>
        </div>

        {/* AFFICHAGE TAGS ACTIFS */}
        {postTags && postTags.trim() && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            padding: '12px 16px',
            background: 'rgba(99, 102, 241, 0.05)',
            borderRadius: 8,
            border: '1px solid rgba(99, 102, 241, 0.2)'
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
                    padding: '6px 12px',
                    borderRadius: 999,
                    background: 'rgba(99, 102, 241, 0.14)',
                    border: '1px solid rgba(99, 102, 241, 0.35)',
                    fontSize: 12,
                    lineHeight: 1,
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

        {/* AFFICHAGE IMAGES UPLOADÉES */}
        {uploadedImages.length > 0 && (
          <div style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            padding: '12px 16px',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 8,
            border: '1px solid var(--border)'
          }}>
            {uploadedImages.map((img, idx) => (
              <ImageThumbnail
                key={img.id}
                imagePath={img.path}
                isMain={img.isMain}
                onSetMain={() => setMainImage(idx)}
                onCopyName={async () => {
                  await navigator.clipboard.writeText(img.path);
                  showToast('Chemin copié', 'success');
                }}
                onDelete={async () => {
                  const ok = await confirm({ title: 'Supprimer', message: 'Supprimer cette image ?', type: 'danger' });
                  if (ok) removeImage(idx);
                }}
              />
            ))}
          </div>
        )}

        {/* ========== SECTION INFOS PRINCIPALES ========== */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

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
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
              Version Traduction
            </label>
            <input
              value={inputs['Translate_version'] || ''}
              onChange={e => setInput('Translate_version', e.target.value)}
              style={{ width: '100%', height: '40px', borderRadius: 6, padding: '0 12px' }}
              placeholder="v1.0"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
              Lien du jeu
            </label>
            <input
              value={inputs['Game_link'] || ''}
              onChange={e => setInput('Game_link', e.target.value)}
              style={{ width: '100%', height: '40px', borderRadius: 6, padding: '0 12px' }}
              placeholder="https://f95zone.to/threads/..."
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
              Lien Traduction {isIntegrated && <span style={{ color: 'var(--accent)', fontSize: 11 }}>(Fusionné)</span>}
            </label>
            <input
              value={inputs['Translate_link'] || ''}
              onChange={e => setInput('Translate_link', e.target.value)}
              style={{ width: '100%', height: '40px', borderRadius: 6, padding: '0 12px', opacity: isIntegrated ? 0.5 : 1 }}
              disabled={isIntegrated}
              placeholder={isIntegrated ? "Inutile (Traduction intégrée)" : "https://mega.nz/..."}
            />
          </div>
        </div>

        {/* ========== TYPE & MOD & INSTRUCTIONS & SYNOPSIS ========== */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          {/* COLONNE GAUCHE : TYPE TRADUCTION + SYNOPSIS */}
          <div style={{ display: 'grid', gap: 12 }}>

            {/* TYPE DE TRADUCTION + CHECKBOX INTÉGRATION */}
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

            {/* SYNOPSIS */}
            <div style={{ flex: 1 }}>
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
                  height: 'calc(100% - 28px)',
                  minHeight: '180px',
                  borderRadius: 6,
                  padding: '12px',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  lineHeight: 1.5,
                  resize: 'none'
                }}
                placeholder="Décrivez le jeu..."
              />
            </div>
          </div>

          {/* COLONNE DROITE : JEU MODÉ + INSTRUCTIONS */}
          <div style={{ display: 'grid', gap: 12 }}>

            {/* JEU MODÉ */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                  Lien du mod
                </label>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  userSelect: 'none',
                  fontSize: 12,
                  color: 'var(--text)',
                  fontWeight: 700
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

              <input
                value={inputs['mod_link'] || ''}
                onChange={e => setInput('mod_link', e.target.value)}
                disabled={inputs['is_modded_game'] !== 'true'}
                style={{
                  width: '100%',
                  height: '40px',
                  borderRadius: 6,
                  padding: '0 12px',
                  opacity: inputs['is_modded_game'] === 'true' ? 1 : 0.5,
                  cursor: inputs['is_modded_game'] === 'true' ? 'text' : 'not-allowed'
                }}
                placeholder={inputs['is_modded_game'] === 'true' ? "https://..." : "Activez 'Jeu modé' pour saisir un lien"}
              />
            </div>

            {/* INSTRUCTIONS D'INSTALLATION */}
            <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
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
                  minHeight: '138px',
                  borderRadius: 6,
                  padding: '12px',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  lineHeight: 1.5,
                  resize: 'none'
                }}
                placeholder="Tapez ou sélectionnez une instruction..."
              />
            </div>
          </div>
        </div>

        {/* ========== ACTIONS FINALES ========== */}
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
                <span>{isEditMode ? 'Mettre à jour' : 'Publier sur Discord'}</span>
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
