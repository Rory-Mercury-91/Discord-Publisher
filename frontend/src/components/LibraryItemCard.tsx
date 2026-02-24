// frontend/src/components/LibraryItemCard.tsx
import { useState } from 'react';
import GameDetailModal from './GameDetailModal';

interface LibraryItemCardProps {
  game: any;
  displayMode: 'compact' | 'enriched';
  onLoadForEditing?: (game: any) => void;
}

export default function LibraryItemCard({ game, displayMode, onLoadForEditing }: LibraryItemCardProps) {
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Extraction des données (compatible avec LibraryView + mode traducteur)
  const title = game.title || game.nom_du_jeu || 'Sans titre';
  const imagePath = game.image_path || game.image || '';
  const savedInputs = game.saved_inputs || {};
  const gameVersion = savedInputs.Game_version || game.version || 'N/A';
  const translateVersion = savedInputs.Translate_version || game.trad_ver || 'N/A';
  const translationType = game.translation_type || savedInputs.translation_type || 'N/A';
  const gameLink = savedInputs.Game_link || game.nom_url || '';
  const translateLink = savedInputs.Translate_link || game.lien_trad || '';

  // Badge statut (depuis tags)
  const statusBadge = game.tags?.split(',').find((t: string) =>
    t.includes('Completed') || t.includes('Ongoing') || t.includes('Abandoned')
  ) || '';

  // Badge moteur (depuis tags)
  const engineBadge = game.tags?.split(',').find((t: string) =>
    t.includes('Ren\'Py') || t.includes('RPGM') || t.includes('Unity') || t.includes('Unreal')
  ) || '';

  // Traducteur (depuis tags)
  const translatorTag = game.tags?.split(',').find((t: string) =>
    t.includes('translator') || t.includes('Traducteur')
  ) || 'N/A';

  // Date de mise à jour
  const updatedAt = game.updated_at
    ? new Date(game.updated_at).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
    : 'N/A';

  // Couleur du badge moteur
  const getEngineColor = (engine: string) => {
    if (engine.includes('Ren\'Py')) return { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', text: '#ef4444' };
    if (engine.includes('RPGM')) return { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.4)', text: '#3b82f6' };
    if (engine.includes('Unity')) return { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.4)', text: '#a855f7' };
    if (engine.includes('Unreal')) return { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)', text: '#10b981' };
    return { bg: 'rgba(156,163,175,0.15)', border: 'rgba(156,163,175,0.4)', text: '#9ca3af' };
  };

  const engineColors = getEngineColor(engineBadge);

  const handleOpenLink = (url: string) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // ═══════════════════════════════════════════════════════════════
  // MODE COMPACT
  // ═══════════════════════════════════════════════════════════════
  if (displayMode === 'compact') {
    return (
      <div
        style={{
          background: 'var(--panel)',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--border)',
          transition: 'all 0.2s',
          cursor: onLoadForEditing ? 'pointer' : 'default'
        }}
        onClick={() => onLoadForEditing?.(game)}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.3)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {/* Image + Badges */}
        <div
          style={{
            position: 'relative',
            height: 180,
            background: `linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.5)), url(${imagePath}) center/cover`,
            display: 'flex',
            alignItems: 'flex-end',
            padding: 12
          }}
        >
          {statusBadge && (
            <div
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 700,
                background: statusBadge.includes('Completed')
                  ? 'rgba(16,185,129,0.9)'
                  : statusBadge.includes('Ongoing')
                    ? 'rgba(59,130,246,0.9)'
                    : 'rgba(239,68,68,0.9)',
                color: '#fff',
                textTransform: 'uppercase'
              }}
            >
              {statusBadge}
            </div>
          )}

          {engineBadge && (
            <div
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 700,
                background: engineColors.bg,
                border: `1px solid ${engineColors.border}`,
                color: engineColors.text,
                backdropFilter: 'blur(4px)'
              }}
            >
              {engineBadge}
            </div>
          )}
        </div>

        {/* Contenu */}
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--text)',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {title}
          </h3>

          <div
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span>🎮 {gameVersion}</span>
            <span>→</span>
            <span>🇫🇷 {translateVersion}</span>
          </div>

          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

          <div
            style={{
              fontSize: 11,
              color: 'var(--muted)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>👤 {translatorTag}</span>
              <span>{translationType}</span>
            </div>
            <div>📅 {updatedAt}</div>
          </div>

          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

          <div style={{ display: 'flex', gap: 6 }}>
            {gameLink && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenLink(gameLink);
                }}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'rgba(99,102,241,0.1)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  color: 'var(--accent)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.1)'; }}
              >
                🎮 Jeu
              </button>
            )}
            {translateLink && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenLink(translateLink);
                }}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  color: '#10b981',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.1)'; }}
              >
                🇫🇷 Traduction
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // MODE ENRICHI
  // ═══════════════════════════════════════════════════════════════
  return (
    <>
      <div
        style={{
          background: 'var(--panel)',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--border)',
          transition: 'all 0.2s',
          cursor: 'pointer'
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.3)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {/* Image + Badges */}
        <div
          style={{
            position: 'relative',
            height: 180,
            background: `linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.5)), url(${imagePath}) center/cover`
          }}
        >
          {statusBadge && (
            <div
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 700,
                background: statusBadge.includes('Completed')
                  ? 'rgba(16,185,129,0.9)'
                  : statusBadge.includes('Ongoing')
                    ? 'rgba(59,130,246,0.9)'
                    : 'rgba(239,68,68,0.9)',
                color: '#fff',
                textTransform: 'uppercase'
              }}
            >
              {statusBadge}
            </div>
          )}
        </div>

        {/* Contenu */}
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--text)',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {title}
          </h3>

          <div
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span>🎮 {gameVersion}</span>
            <span>→</span>
            <span>🇫🇷 {translateVersion}</span>
          </div>

          {engineBadge && (
            <div
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 700,
                background: engineColors.bg,
                border: `1px solid ${engineColors.border}`,
                color: engineColors.text,
                display: 'inline-block',
                width: 'fit-content'
              }}
            >
              {engineBadge}
            </div>
          )}

          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

          <button
            onClick={() => setShowDetailModal(true)}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(102,126,234,0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <span>ℹ️</span>
            <span>Plus d'informations</span>
          </button>
        </div>
      </div>

      {/* Modale de détails */}
      {showDetailModal && (
        <GameDetailModal
          game={game}
          onClose={() => setShowDetailModal(false)}
        />
      )}
    </>
  );
}
