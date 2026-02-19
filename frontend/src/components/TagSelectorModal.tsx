import { useEffect, useMemo, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { useApp } from '../state/appContext';
import { useAuth } from '../state/authContext';
import type { TagType } from '../state/types';

interface TagSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTag: (tagId: string) => void;
  selectedTagIds: string[];
  position?: { top: number; left: number; width: number };
  /** Traducteur sélectionné depuis ContentEditor (mode contrôlé) */
  controlledTranslatorId?: string;
  controlledTranslatorKind?: 'profile' | 'external';
}

export default function TagSelectorModal({
  isOpen, onClose, onSelectTag, selectedTagIds, position,
  controlledTranslatorId, controlledTranslatorKind,
}: TagSelectorModalProps) {
  const { savedTags } = useApp();
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  useEscapeKey(() => { if (isOpen) { onClose(); setSearchQuery(''); } }, isOpen);
  useModalScrollLock(isOpen);
  useEffect(() => { if (!isOpen) setSearchQuery(''); }, [isOpen]);

  // ── Mode contrôlé vs autonome ──────────────────────────────────────────────
  const isControlled = !!controlledTranslatorId;
  const activeTranslatorId = isControlled ? controlledTranslatorId! : (profile?.id ?? '');
  const activeTranslatorKind = isControlled ? (controlledTranslatorKind ?? 'profile') : 'profile';

  // ── Tags secondaires du traducteur actif ────────────────────────────────────
  const myTags = useMemo(() => {
    if (!activeTranslatorId) return [];

    // Tags liés via profileId / externalTranslatorId (nouveau système)
    const personal = savedTags.filter(t =>
      activeTranslatorKind === 'profile'
        ? t.profileId === activeTranslatorId
        : t.externalTranslatorId === activeTranslatorId
    );
    if (personal.length > 0) return personal;

    // Fallback legacy : tags sans profileId pour le propre profil de l'utilisateur connecté
    if (activeTranslatorId === profile?.id)
      return savedTags.filter(t => t.tagType !== 'translator');

    return [];
  }, [savedTags, activeTranslatorId, activeTranslatorKind, profile?.id]);

  const availableTags = useMemo(
    () => myTags.filter(t => {
      // Exclure les tags traducteurs (auto-injectés) et déjà sélectionnés
      if (t.tagType === 'translator') return false;
      const tagId = t.id || t.name;
      return !selectedTagIds.includes(tagId);
    }),
    [myTags, selectedTagIds]
  );

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const removeLeadingEmojis = (text: string) =>
    text.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\s]+/gu, '').trim();

  const sortTags = (tags: typeof savedTags) =>
    [...tags].sort((a, b) => removeLeadingEmojis(a.name).localeCompare(removeLeadingEmojis(b.name)));

  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return availableTags;
    const q = searchQuery.toLowerCase();
    return availableTags.filter(t =>
      removeLeadingEmojis(t.name).toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      (t.id || '').toLowerCase().includes(q)
    );
  }, [availableTags, searchQuery]);

  const GROUP_ORDER: Exclude<TagType, 'translator'>[] = ['translationType', 'sites', 'gameStatus', 'other'];
  const tagTypeLabels: Record<Exclude<TagType, 'translator'>, string> = {
    translationType: '📋 Type de traduction',
    gameStatus: '🎮 Statut du jeu',
    sites: '🌐 Sites',
    other: '📦 Autres',
  };

  const grouped = useMemo(() => ({
    translationType: sortTags(filteredTags.filter(t => t.tagType === 'translationType')),
    gameStatus: sortTags(filteredTags.filter(t => t.tagType === 'gameStatus')),
    sites: sortTags(filteredTags.filter(t => t.tagType === 'sites')),
    other: sortTags(filteredTags.filter(t => t.tagType === 'other')),
  }), [filteredTags]);

  const hasAnyTag = GROUP_ORDER.some(k => grouped[k].length > 0);

  if (!isOpen) return null;

  // ── Indicateur de contexte ──────────────────────────────────────────────────
  const translatorName = isControlled
    ? undefined // le nom est géré dans ContentEditor
    : (profile?.id === activeTranslatorId ? 'Moi' : undefined);

  const modalStyle: React.CSSProperties = {
    position: 'fixed',
    top: position ? `${position.top}px` : '50%',
    left: position ? `${position.left}px` : '50%',
    width: position ? `${position.width}px` : '500px',
    maxWidth: '90vw', maxHeight: '70vh',
    transform: position ? 'none' : 'translate(-50%, -50%)',
    zIndex: 2000, display: 'flex', flexDirection: 'column',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflow: 'hidden',
  };

  const tagCardStyle: React.CSSProperties = {
    flex: '0 0 auto', padding: '10px 12px',
    border: '1px solid var(--border)', borderRadius: 6,
    background: 'rgba(255,255,255,0.03)', cursor: 'pointer',
    transition: 'all 0.2s', whiteSpace: 'nowrap',
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1999 }} />

      <div className="panel" onClick={e => e.stopPropagation()} style={modalStyle}>

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0
        }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>🏷️ Sélectionner un tag</h3>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--text)',
            fontSize: 24, cursor: 'pointer', padding: '0 8px', lineHeight: 1
          }}>×</button>
        </div>

        {/* Bannière d'info tags secondaires */}
        {isControlled && (
          <div style={{
            padding: '8px 16px', flexShrink: 0,
            background: 'rgba(88,101,242,0.06)', borderBottom: '1px solid rgba(88,101,242,0.2)',
          }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🔒</span>
              <span>Tags secondaires du traducteur sélectionné — le tag Traducteur est déjà injecté automatiquement.</span>
            </div>
          </div>
        )}

        {/* Info limite */}
        <div style={{
          padding: '10px 16px', flexShrink: 0,
          background: 'rgba(255,193,7,0.08)', borderBottom: '1px solid rgba(255,193,7,0.25)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span>⚠️</span>
            <span>
              <strong>Limite :</strong> max <strong>5 tags</strong>.{' '}
              <strong>Obligatoires :</strong> un Site + un Type de traduction.
              {selectedTagIds.length > 0 && (
                <span style={{
                  marginLeft: 8, fontWeight: 600,
                  color: selectedTagIds.length >= 5 ? '#ff4444' : '#4a9eff'
                }}>
                  ({selectedTagIds.length}/5)
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Recherche */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <input
            type="text"
            placeholder="🔍 Rechercher un tag…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--panel)',
              color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Contenu scrollable */}
        <div className="styled-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px', minHeight: 0 }}>
          {!hasAnyTag ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontStyle: 'italic' }}>
              {searchQuery.trim()
                ? 'Aucun tag ne correspond à votre recherche'
                : myTags.length === 0
                  ? 'Aucun tag secondaire configuré pour ce traducteur'
                  : 'Tous les tags ont été ajoutés'}
            </div>
          ) : (
            GROUP_ORDER.map(tagType => {
              const tagsInType = grouped[tagType];
              if (tagsInType.length === 0) return null;
              return (
                <div key={tagType} style={{ marginBottom: 24 }}>
                  <h4 style={{
                    margin: '0 0 12px 0', fontSize: 13, fontWeight: 600, color: 'var(--muted)',
                    display: 'flex', alignItems: 'center', gap: 8,
                    paddingBottom: 8, borderBottom: '1px solid var(--border)',
                  }}>
                    {tagTypeLabels[tagType]}
                    <span style={{ fontSize: 11, fontWeight: 'normal' }}>({tagsInType.length})</span>
                  </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {tagsInType.map(tag => {
                      const tagId = tag.id || tag.name;
                      return (
                        <div
                          key={tagId}
                          onClick={() => onSelectTag(tagId)}
                          style={tagCardStyle}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLDivElement).style.background = 'rgba(74,158,255,0.1)';
                            (e.currentTarget as HTMLDivElement).style.borderColor = '#4a9eff';
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)';
                            (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{tag.name}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text)', cursor: 'pointer'
          }}>
            🚪 Fermer
          </button>
        </div>
      </div>
    </>
  );
}
