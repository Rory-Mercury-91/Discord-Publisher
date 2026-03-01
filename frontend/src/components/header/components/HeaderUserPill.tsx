import { useMemo } from 'react';

const AVATAR_PALETTE = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#ef4444',
  '#14b8a6',
];

interface HeaderUserPillProps {
  pseudo: string;
}

export default function HeaderUserPill({ pseudo }: HeaderUserPillProps) {
  const initials = useMemo(() => {
    const w = pseudo.trim().split(/\s+/);
    return (w.length >= 2 ? w[0][0] + w[1][0] : pseudo.slice(0, 2)).toUpperCase();
  }, [pseudo]);

  const avatarColor = useMemo(() => {
    let h = 0;
    for (const ch of pseudo) h = (h << 5) - h + ch.charCodeAt(0);
    return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
  }, [pseudo]);

  return (
    <div className="app-header-user-pill">
      <div
        className="app-header-user-pill__avatar"
        style={{ background: avatarColor }}
      >
        {initials}
      </div>
      <span className="app-header-user-pill__name">{pseudo}</span>
    </div>
  );
}
