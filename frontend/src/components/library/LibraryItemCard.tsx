import { useState } from 'react';
import GameDetailModal from './GameDetailModal';

interface LibraryItemCardProps {
  game: any;
  onLoadForEditing?: (game: any) => void;
}

function getEngineData(engine: string): string {
  if (engine.includes("Ren'Py")) return 'renpy';
  if (engine.includes('RPGM')) return 'rpgm';
  if (engine.includes('Unity')) return 'unity';
  if (engine.includes('Unreal')) return 'unreal';
  return 'default';
}

export default function LibraryItemCard({ game }: LibraryItemCardProps) {
  const [showDetailModal, setShowDetailModal] = useState(false);

  const title = game.title || game.nom_du_jeu || 'Sans titre';
  const imagePath = game.image_path || game.image || '';
  const savedInputs = game.saved_inputs || {};
  const gameVersion = savedInputs.Game_version || game.version || 'N/A';
  const translateVersion = savedInputs.Translate_version || game.trad_ver || 'N/A';
  const engineBadge = game.tags?.split(',').find((t: string) =>
    t.includes("Ren'Py") || t.includes('RPGM') || t.includes('Unity') || t.includes('Unreal')
  ) || '';
  const statusBadge = game.tags?.split(',').find((t: string) =>
    t.includes('Completed') || t.includes('Ongoing') || t.includes('Abandoned')
  ) || '';

  const engineData = getEngineData(engineBadge);
  const heroBg = imagePath
    ? { ['--library-item-hero-bg' as string]: `linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.5)), url(${imagePath}) center/cover` }
    : undefined;
  const statusClass =
    statusBadge.includes('Completed') ? 'library-item-card-status--done' :
    statusBadge.includes('Ongoing') ? 'library-item-card-status--ongoing' :
    'library-item-card-status--abandoned';

  return (
    <>
      <div
        className="library-item-card library-item-card--clickable"
        role="button"
        tabIndex={0}
        onClick={() => setShowDetailModal(true)}
        onKeyDown={e => e.key === 'Enter' && setShowDetailModal(true)}
      >
        <div className="library-item-card-hero" style={heroBg}>
          {statusBadge && (
            <div className={`library-item-card-status ${statusClass}`}>{statusBadge}</div>
          )}
          {engineBadge && (
            <div className="library-item-card-engine" data-engine={engineData}>
              {engineBadge}
            </div>
          )}
        </div>
        <div className="library-item-card-content">
          <h3 className="library-item-card-title">{title}</h3>
          <div className="library-item-card-meta">
            <span>🎮 {gameVersion}</span>
            <span>→</span>
            <span>🇫🇷 {translateVersion}</span>
          </div>
        </div>
      </div>
      {showDetailModal && (
        <GameDetailModal game={game} onClose={() => setShowDetailModal(false)} />
      )}
    </>
  );
}
