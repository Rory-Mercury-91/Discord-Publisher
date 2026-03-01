import type { SyncStatus } from '../library-types';

interface VersionBadgeProps {
  game: string;
  trad: string;
  sync: SyncStatus;
}

export default function VersionBadge({ game, trad, sync }: VersionBadgeProps) {
  if (!game && !trad) return <div className="library-version-text">Versions inconnues</div>;
  return (
    <div className="library-version-badge" data-sync={sync}>
      <span className="library-version-muted">🎮</span>
      <code className="library-version-code">{game || '?'}</code>
      <span className="library-version-arrow">→</span>
      <span className="library-version-muted">🇫🇷</span>
      <code className="library-version-code library-version-code--trad">{trad || '?'}</code>
    </div>
  );
}
