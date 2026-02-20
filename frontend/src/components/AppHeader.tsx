declare global { interface Window { __TAURI__?: any; } }

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import rootPkg from '../../../package.json';
import type { PublishedPost } from '../state/appContext';
import { useApp } from '../state/appContext';
import { useAuth } from '../state/authContext';
import ApiStatusBadge from './ApiStatusBadge';
import { useToast } from './ToastProvider';

const APP_VERSION = rootPkg.version;
const STORAGE_KEY_MASTER_ADMIN = 'discord-publisher:master-admin-code';

export type AppMode = 'translator' | 'user';

export interface AppHeaderProps {
  mode: AppMode;
  onModeChange: (m: AppMode) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenTemplates: () => void;
  onOpenTags: () => void;
  onOpenInstructions: () => void;
  onOpenHistory: () => void;
  onOpenStats: () => void;
  onOpenConfig: () => void;
  onOpenHelp: () => void;
  onOpenLogs: () => void;
  onLogout: () => void;
}

export default function AppHeader({
  mode, onModeChange, theme, onToggleTheme,
  onOpenTemplates, onOpenTags, onOpenInstructions,
  onOpenHistory, onOpenStats, onOpenConfig, onOpenHelp,
  onOpenLogs, onLogout,
}: AppHeaderProps) {
  const { profile } = useAuth();
  const { publishedPosts, savedTags, loadPostForEditing } = useApp();
  const { showToast } = useToast();

  // ── Master admin ────────────────────────────────────────────────────────────
  const [masterAdmin, setMasterAdmin] = useState(() =>
    !!localStorage.getItem(STORAGE_KEY_MASTER_ADMIN)
  );
  useEffect(() => {
    const sync = () => setMasterAdmin(!!localStorage.getItem(STORAGE_KEY_MASTER_ADMIN));
    window.addEventListener('masterAdminUnlocked', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('masterAdminUnlocked', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // ── Recherche ───────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node))
        setShowDrop(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const results = useMemo((): PublishedPost[] => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return publishedPosts
      .filter(p => (p.title || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, publishedPosts]);

  const getTranslators = useCallback((post: PublishedPost): string => {
    const ids = (post.tags || '').split(',').map(s => s.trim()).filter(Boolean);
    const names = savedTags
      .filter(t => t.tagType === 'translator' && ids.includes(String(t.discordTagId ?? '')))
      .map(t => t.name);
    return names.length ? names.join(', ') : '—';
  }, [savedTags]);

  const handleSelect = useCallback((post: PublishedPost) => {
    const canEdit = post.authorDiscordId === profile?.discord_id || masterAdmin;
    if (canEdit) {
      loadPostForEditing(post);
      showToast('Post chargé en mode édition', 'info');
      setShowDrop(false);
      setQuery('');
    }
  }, [profile?.discord_id, loadPostForEditing, showToast, masterAdmin]);

  // ── Avatar ──────────────────────────────────────────────────────────────────
  const pseudo = profile?.pseudo || 'Utilisateur';
  const initials = useMemo(() => {
    const w = pseudo.trim().split(/\s+/);
    return (w.length >= 2 ? w[0][0] + w[1][0] : pseudo.slice(0, 2)).toUpperCase();
  }, [pseudo]);
  const avatarColor = useMemo(() => {
    const palette = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];
    let h = 0;
    for (const ch of pseudo) h = (h << 5) - h + ch.charCodeAt(0);
    return palette[Math.abs(h) % palette.length];
  }, [pseudo]);

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  // ── Fermeture Tauri ─────────────────────────────────────────────────────────
  const handleClose = async () => {
    try {
      if (window.__TAURI__) {
        try {
          const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow' as any);
          await getCurrentWebviewWindow().close();
        } catch {
          const { getCurrentWindow } = await import('@tauri-apps/api/window' as any);
          await getCurrentWindow().close();
        }
      } else { window.close(); }
    } catch (e) { console.error('Erreur fermeture:', e); }
  };

  // ── Style helpers ───────────────────────────────────────────────────────────
  const iconBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    width: 32, height: 32, padding: 0, fontSize: 15,
    border: '1px solid var(--border)', background: 'transparent',
    borderRadius: 7, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    ...extra,
  });

  const vSep: React.CSSProperties = {
    width: 1, height: 18, background: 'var(--border)', flexShrink: 0,
  };

  const toolBtn = (active = false): React.CSSProperties => ({
    fontSize: 12, padding: '4px 11px', borderRadius: 6, height: 28,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text)',
    cursor: 'pointer', fontWeight: active ? 600 : 500,
    display: 'flex', alignItems: 'center', gap: 5,
    transition: 'all 0.15s', flexShrink: 0,
  });

  return (
    <header style={{
      background: 'var(--panel)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>

      {/* ═══════════════════════════════════════════════════════════════════════
          LIGNE 1 — Identité · Recherche · Actions système
      ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px' }}>

        {/* Branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, minWidth: 210 }}>
          <span style={{
            fontSize: 20, lineHeight: 1,
            fontFamily: 'Noto Color Emoji, Segoe UI Emoji, Apple Color Emoji',
          }}>🇫🇷</span>
          <div style={{ lineHeight: 1.3 }}>
            <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em' }}>
              Générateur de publication
            </span>
            <span style={{
              fontSize: 10, color: 'var(--muted)', marginLeft: 6,
              padding: '1px 5px', borderRadius: 4,
              background: 'rgba(255,255,255,0.07)', verticalAlign: 'middle',
            }}>v{APP_VERSION}</span>
          </div>
        </div>

        {/* Barre de recherche (flex center) */}
        <div ref={searchWrapRef} style={{ flex: 1, maxWidth: 520, margin: '0 auto', position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              fontSize: 12, color: 'var(--muted)', pointerEvents: 'none',
            }}>🔍</span>
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setShowDrop(true); }}
              onFocus={() => query.trim() && setShowDrop(true)}
              placeholder={mode === 'translator' ? 'Rechercher parmi mes publications…' : 'Rechercher une traduction…'}
              style={{
                width: '100%', padding: '7px 12px 7px 30px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)',
                color: 'var(--text)', fontSize: 13, boxSizing: 'border-box',
              }}
            />
          </div>

          {showDrop && query.trim() && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
              background: 'var(--panel)', border: '1px solid var(--border)',
              borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
              zIndex: 9999, overflow: 'hidden',
            }}>
              {results.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
                  Aucune publication trouvée
                </div>
              ) : results.map(post => {
                const canEdit = post.authorDiscordId === profile?.discord_id || masterAdmin;
                return (
                  <div
                    key={post.id}
                    onClick={() => handleSelect(post)}
                    style={{
                      display: 'flex', height: 68,
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      cursor: canEdit ? 'pointer' : 'default',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (canEdit) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                  >
                    <div style={{ width: 68, height: 68, flexShrink: 0, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                      {post.imagePath
                        ? <img src={post.imagePath} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: 'var(--muted)' }}>🎮</div>
                      }
                    </div>
                    <div style={{ flex: 1, padding: '9px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {post.title || 'Sans titre'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        👤 {getTranslators(post)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>📅 {fmtDate(post.timestamp)}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', paddingRight: 12, fontSize: 13 }}>
                      {canEdit
                        ? <span style={{ color: 'var(--accent)' }}>✏️</span>
                        : <span title="Vous n'êtes pas l'auteur" style={{ opacity: 0.3 }}>🔒</span>
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions système (droite) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto', flexShrink: 0 }}>
          <button onClick={onOpenConfig} style={iconBtn()} title="Configuration">⚙️</button>
          <button onClick={onOpenHelp} style={iconBtn()} title="Aide & raccourcis clavier">❓</button>
          <button
            onClick={onToggleTheme}
            style={iconBtn()}
            title={theme === 'dark' ? 'Passer en mode jour' : 'Passer en mode nuit'}
          >{theme === 'dark' ? '☀️' : '🌙'}</button>

          <div style={{ ...vSep, margin: '0 3px' }} />

          <button
            onClick={handleClose}
            style={iconBtn({
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              color: '#ef4444', fontWeight: 700, fontSize: 13,
            })}
            title="Fermer l'application"
          >✕</button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          LIGNE 2 — Outils · Mode · Identité
      ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 16px 8px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>

        {/* Outils */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { label: '📄 Templates', onClick: onOpenTemplates },
            { label: '📋 Instructions', onClick: onOpenInstructions },
            { label: '📜 Historique', onClick: onOpenHistory },
            { label: '📈 Statistiques', onClick: onOpenStats },
          ].map(({ label, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              style={toolBtn()}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.borderColor = 'var(--accent)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >{label}</button>
          ))}
          {masterAdmin && (
            <button
              onClick={onOpenTags}
              style={toolBtn()}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.borderColor = 'var(--accent)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >🏷️ Tags</button>
          )}
        </div>

        <div style={vSep} />

        {/* Switch de mode */}
        <div style={{
          display: 'flex', flexShrink: 0,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border)',
          borderRadius: 7, overflow: 'hidden',
        }}>

          {(['translator', 'user'] as const).map((m, i) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              title={m === 'translator' ? 'Mode traducteur' : 'Mode utilisateur – Bibliothèque des jeux'}
              style={{
                padding: '4px 12px', fontSize: 12,
                fontWeight: mode === m ? 700 : 400,
                background: mode === m ? 'var(--accent)' : 'transparent',
                color: mode === m ? '#fff' : 'var(--muted)',
                border: 'none', cursor: 'pointer',
                borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {m === 'translator' ? '✏️ Traducteur' : '📚 Bibliothèque'}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Identité + statut API */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <ApiStatusBadge onOpenLogs={onOpenLogs} />

          <div style={vSep} />

          {/* Pill utilisateur */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '3px 10px 3px 4px', borderRadius: 20,
            background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: avatarColor, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, color: '#fff',
            }}>
              {initials}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{pseudo}</span>
          </div>

          {/* Déconnexion */}
          <button
            onClick={onLogout}
            style={{
              height: 30, padding: '0 10px', fontSize: 12, fontWeight: 600,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              color: '#ef4444', borderRadius: 7, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              transition: 'background 0.15s',
            }}
            title="Se déconnecter"
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.16)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
          >
            ↩️ <span>Déconnexion</span>
          </button>
        </div>
      </div>
    </header>
  );
}
