import { useEffect, useMemo, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { getSupabase } from '../lib/supabase';
import { useApp } from '../state/appContext';
import { useAuth } from '../state/authContext';
import type { TagType } from '../state/types';

interface TagSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTag: (tagId: string) => void;
  selectedTagIds: string[];
  position?: { top: number; left: number; width: number };
}

export default function TagSelectorModal({
  isOpen,
  onClose,
  onSelectTag,
  selectedTagIds,
  position
}: TagSelectorModalProps) {
  const { savedTags } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const { profile } = useAuth();

  useEscapeKey(() => {
    if (isOpen) {
      onClose();
      setSearchQuery('');
    }
  }, isOpen);
  useModalScrollLock(isOpen);

  // Réinitialiser la recherche quand la modale se ferme
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Pré-sélection automatique du tag traducteur lié au profil connecté
  useEffect(() => {
    if (!isOpen || !profile?.id) return;

    const autoSelect = async () => {
      const sb = getSupabase();
      if (!sb) return;

      try {
        const { data, error } = await sb
          .from('translator_forum_mappings')
          .select('tag_id')
          .eq('profile_id', profile.id)
          .maybeSingle();

        if (error || !data?.tag_id) return;

        // Vérifier que ce tag existe bien dans savedTags
        const tag = savedTags.find(t => t.id === data.tag_id);
        if (!tag) return;

        const tagId = tag.id || tag.name;

        // Ne pré-sélectionner que s'il n'est pas déjà sélectionné
        if (!selectedTagIds.includes(tagId)) {
          onSelectTag(tagId);
        }
      } catch {
        // Non bloquant
      }
    };

    void autoSelect();
  }, [isOpen, profile?.id]);

  // Fonction pour retirer les emojis au début d'un texte
  const removeLeadingEmojis = (text: string): string => {
    return text.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\s]+/gu, '').trim();
  };

  // Séparer les tags génériques et traducteurs
  const genericTags = savedTags.filter(t => t.tagType !== 'translator');
  const translatorTags = savedTags.filter(t => t.tagType === 'translator');

  // Filtrer les tags disponibles (non sélectionnés)
  const availableGenericTags = useMemo(() => {
    return genericTags.filter(t => {
      const tagId = t.id || t.name;
      return !selectedTagIds.includes(tagId);
    });
  }, [genericTags, selectedTagIds]);

  const availableTranslatorTags = useMemo(() => {
    return translatorTags.filter(t => {
      const tagId = t.id || t.name;
      return !selectedTagIds.includes(tagId);
    });
  }, [translatorTags, selectedTagIds]);

  // Filtrer avec recherche
  const filterTags = (tags: typeof savedTags) => {
    if (!searchQuery.trim()) return tags;
    const query = searchQuery.toLowerCase();
    return tags.filter(t => {
      const nameWithoutEmoji = removeLeadingEmojis(t.name).toLowerCase();
      const nameWithEmoji = t.name.toLowerCase();
      const id = (t.id || '').toLowerCase();
      return nameWithoutEmoji.includes(query) || nameWithEmoji.includes(query) || id.includes(query);
    });
  };

  const filteredGenericTags = filterTags(availableGenericTags);
  const filteredTranslatorTags = filterTags(availableTranslatorTags);

  // Trier les tags par nom (sans emojis)
  const sortTags = (tags: typeof savedTags) => {
    return [...tags].sort((a, b) => {
      const nameA = removeLeadingEmojis(a.name);
      const nameB = removeLeadingEmojis(b.name);
      return nameA.localeCompare(nameB);
    });
  };

  // Grouper les tags génériques par type
  const groupedGenericTags = useMemo(() => ({
    translationType: sortTags(filteredGenericTags.filter(t => t.tagType === 'translationType')),
    gameStatus: sortTags(filteredGenericTags.filter(t => t.tagType === 'gameStatus')),
    sites: sortTags(filteredGenericTags.filter(t => t.tagType === 'sites')),
    other: sortTags(filteredGenericTags.filter(t => t.tagType === 'other'))
  }), [filteredGenericTags]);

  const sortedTranslatorTags = sortTags(filteredTranslatorTags);

  // Labels des types de tags
  const tagTypeLabels: Record<Exclude<TagType, 'translator'>, string> = {
    translationType: '📋 Type de traduction',
    gameStatus: '🎮 Statut du jeu',
    sites: '🌐 Sites',
    other: '📦 Autres'
  };

  if (!isOpen) return null;

  const modalStyle: React.CSSProperties = {
    position: 'fixed',
    top: position?.top ? `${position.top}px` : '50%',
    left: position?.left ? `${position.left}px` : '50%',
    width: position?.width ? `${position.width}px` : '500px',
    maxWidth: '90vw',
    maxHeight: '70vh',
    transform: position ? 'none' : 'translate(-50%, -50%)',
    zIndex: 2000,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    overflow: 'hidden'
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 1999
        }}
      />

      {/* Modal */}
      <div className="panel" onClick={e => e.stopPropagation()} style={modalStyle}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0
        }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>🏷️ Sélectionner un tag</h3>
          <button onClick={onClose} style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text)',
            fontSize: 24,
            cursor: 'pointer',
            padding: '0 8px',
            lineHeight: 1
          }}>
            ×
          </button>
        </div>

        {/* Info limite tags */}
        <div style={{
          padding: '12px 16px',
          background: 'rgba(255, 193, 7, 0.1)',
          borderBottom: '1px solid rgba(255, 193, 7, 0.3)',
          flexShrink: 0
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: 'var(--text)'
          }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span>
              <strong>Limite :</strong> Maximum <strong>5 tags</strong> par publication. <strong>Obligatoires :</strong> au moins un Site, un Type de traduction et un Traducteur (Autres et Statut optionnels).
              {selectedTagIds.length > 0 && (
                <span style={{ marginLeft: 8, color: selectedTagIds.length >= 5 ? '#ff4444' : '#4a9eff' }}>
                  ({selectedTagIds.length}/5 sélectionnés)
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Search */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0
        }}>
          <input
            type="text"
            placeholder="🔍 Rechercher un tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              color: 'var(--text)',
              fontSize: 14
            }}
          />
        </div>

        {/* Content - Scrollable */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          minHeight: 0
        }} className="styled-scrollbar">
          {/* 1. Tags traducteurs (en premier) */}
          {sortedTranslatorTags.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h4 style={{
                margin: '0 0 12px 0',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                paddingBottom: 8,
                borderBottom: '1px solid var(--border)'
              }}>
                👤 Tags traducteurs ({sortedTranslatorTags.length})
              </h4>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                marginTop: 12
              }}>
                {sortedTranslatorTags.map((tag) => {
                  const tagId = tag.id || tag.name;
                  return (
                    <div
                      key={tagId}
                      onClick={() => onSelectTag(tagId)}
                      style={{
                        flex: '0 0 auto',
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.03)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        whiteSpace: 'nowrap'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(74, 158, 255, 0.1)';
                        e.currentTarget.style.borderColor = '#4a9eff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                        e.currentTarget.style.borderColor = 'var(--border)';
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                        {tag.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Tags génériques : Type de traduction, Sites, Statut, Autres */}
          {(['translationType', 'sites', 'gameStatus', 'other'] as const).map(tagType => {
            const tagsInType = groupedGenericTags[tagType];
            if (tagsInType.length === 0) return null;

            return (
              <div key={tagType} style={{ marginBottom: 24 }}>
                <h4 style={{
                  margin: '0 0 12px 0',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  paddingBottom: 8,
                  borderBottom: '1px solid var(--border)'
                }}>
                  {tagTypeLabels[tagType]}
                  <span style={{ fontSize: 11, fontWeight: 'normal' }}>
                    ({tagsInType.length})
                  </span>
                </h4>
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginTop: 12
                }}>
                  {tagsInType.map((tag) => {
                    const tagId = tag.id || tag.name;
                    return (
                      <div
                        key={tagId}
                        onClick={() => {
                          onSelectTag(tagId);
                        }}
                        style={{
                          flex: '0 0 auto',
                          padding: '10px 12px',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          background: 'rgba(255,255,255,0.03)',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(74, 158, 255, 0.1)';
                          e.currentTarget.style.borderColor = '#4a9eff';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                          e.currentTarget.style.borderColor = 'var(--border)';
                        }}
                      >
                        <div style={{
                          fontWeight: 600,
                          fontSize: 13,
                          color: 'var(--text)'
                        }}>
                          {tag.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Message si aucun tag disponible */}
          {filteredGenericTags.length === 0 && sortedTranslatorTags.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: 40,
              color: 'var(--muted)',
              fontStyle: 'italic'
            }}>
              {searchQuery.trim() ? (
                <>Aucun tag ne correspond à votre recherche</>
              ) : (
                <>Tous les tags ont été ajoutés</>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end',
          flexShrink: 0
        }}>
          <button onClick={onClose} style={{ padding: '8px 16px' }}>
            🚪 Fermer
          </button>
        </div>
      </div>
    </>
  );
}
