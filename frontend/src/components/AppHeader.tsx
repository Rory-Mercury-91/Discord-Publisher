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

  // ── Master admin unlock (réactif) ─────────────────────────────────────────
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

  // ── Recherche ─────────────────────────────────────────────────────────────
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
    const isOwner = profile?.discord_id && post.authorDiscordId === profile.discord_id;
    if (isOwner) {
      loadPostForEditing(post);
      showToast('Post chargé en mode édition', 'info');
      setShowDrop(false);
      setQuery('');
    }
    // Si pas auteur : on ne fait rien (le clic est visuellement désactivé)
  }, [profile?.discord_id, loadPostForEditing, showToast]);

  // ── Avatar utilisateur ────────────────────────────────────────────────────
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

  // ── Fermeture application ─────────────────────────────────────────────────
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
      } else {
        window.close();
      }
    } catch (e) { console.error('Erreur fermeture:', e); }
  };

  // ── Styles utilitaires ────────────────────────────────────────────────────
  const iconBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    width: 34, height: 34, padding: 0, fontSize: 18,
    border: '1px solid var(--border)', background: 'transparent',
    borderRadius: 8, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    ...extra,
  });

  const smallBtn: React.CSSProperties = { fontSize: 12, padding: '5px 10px' };

  return (
    <header style={{ borderBottom: '1px solid var(--border)', background: 'var(--panel)', flexShrink: 0 }}>

      {/* ══════════════════ LIGNE 1 ══════════════════════════════════════════ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>

        {/* ── Titre ── */}
        <div style={{ flexShrink: 0, minWidth: 240, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22, fontFamily: 'Noto Color Emoji, Segoe UI Emoji, Apple Color Emoji' }}>🇫🇷</span>
          <div style={{ lineHeight: 1.25 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Générateur de publication</span>
            <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 6, opacity: 0.8 }}>v{APP_VERSION}</span>
          </div>
        </div>

        {/* ── Recherche ── */}
        <div ref={searchWrapRef} style={{ flex: 1, maxWidth: 520, margin: '0 auto', position: 'relative' }}>
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setShowDrop(true); }}
            onFocus={() => query.trim() && setShowDrop(true)}
            placeholder={mode === 'translator' ? '🔍 Rechercher parmi mes publications…' : '🔍 Rechercher une traduction…'}
            style={{
              width: '100%', padding: '8px 14px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)',
              color: 'var(--text)', fontSize: 13, boxSizing: 'border-box',
            }}
          />

          {/* Dropdown résultats */}
          {showDrop && query.trim() && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
              background: 'var(--panel)', border: '1px solid var(--border)',
              borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
              zIndex: 9999, overflow: 'hidden',
            }}>
              {results.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
                  Aucune publication trouvée
                </div>
              ) : results.map(post => (
                <div
                  key={post.id}
                  onClick={() => handleSelect(post)}
                  style={{
                    display: 'flex', height: 72,
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    // cursor pointer seulement si on est l'auteur
                    cursor: post.authorDiscordId === profile?.discord_id ? 'pointer' : 'default',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => {
                    if (post.authorDiscordId === profile?.discord_id)
                      (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)';
                  }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  {/* Vignette — inchangée */}
                  <div style={{ width: 72, height: 72, flexShrink: 0, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                    {post.imagePath
                      ? <img src={post.imagePath} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: 'var(--muted)' }}>🎮</div>
                    }
                  </div>

                  {/* Infos — inchangées */}
                  <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {post.title || 'Sans titre'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      👤 {getTranslators(post)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      📅 {fmtDate(post.timestamp)}
                    </div>
                  </div>

                  {/* Indicateur action : ✏️ si auteur, cadenas si non */}
                  <div style={{ display: 'flex', alignItems: 'center', paddingRight: 12, fontSize: 12 }}>
                    {post.authorDiscordId === profile?.discord_id
                      ? <span style={{ color: 'var(--accent)' }}>✏️</span>
                      : <span title="Vous n'êtes pas l'auteur" style={{ opacity: 0.35, fontSize: 14 }}>🔒</span>
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Boutons d'action ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button onClick={onOpenConfig} style={iconBtn()} title="Configuration">⚙️</button>
          <button onClick={onOpenHelp} style={iconBtn()} title="Aide & raccourcis clavier">❓</button>
          <button
            onClick={onToggleTheme}
            style={iconBtn()}
            title={theme === 'dark' ? 'Passer en mode jour' : 'Passer en mode nuit'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            onClick={handleClose}
            style={iconBtn({
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#ef4444', fontSize: 14, fontWeight: 700,
            })}
            title="Fermer l'application"
          >➜]</button>
        </div>
      </div>

      {/* ══════════════════ LIGNE 2 ══════════════════════════════════════════ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 16px 10px',
        borderTop: '1px solid rgba(255,255,255,0.04)',
      }}>

        {/* ── Boutons modales ── */}
        <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
          <button onClick={onOpenTemplates} style={smallBtn}>📝 Templates</button>
          {masterAdmin && (
            <button onClick={onOpenTags} style={smallBtn}>🏷️ Tags</button>
          )}
          <button onClick={onOpenInstructions} style={smallBtn}>📋 Instructions</button>
          <button onClick={onOpenHistory} style={smallBtn}>📜 Historique</button>
          <button onClick={onOpenStats} style={smallBtn}>📈 Statistiques</button>
        </div>

        {/* ── Switch de mode (TODO) ── */}
        <div style={{
          flexShrink: 0, display: 'flex',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border)',
          borderRadius: 8, overflow: 'hidden',
        }}>
          {(['translator', 'user'] as const).map((m, i) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              title={m === 'user' ? 'Mode utilisateur — Fonctionnalité à venir' : 'Mode traducteur'}
              style={{
                padding: '5px 12px', fontSize: 12,
                fontWeight: mode === m ? 700 : 400,
                background: mode === m ? 'var(--accent)' : 'transparent',
                color: mode === m ? '#fff' : 'var(--muted)',
                border: 'none', cursor: 'pointer',
                borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {m === 'translator' ? '✏️ Traducteur' : '👁️ Utilisateur'}
              {m === 'user' && (
                <span style={{
                  fontSize: 9, padding: '1px 5px', borderRadius: 3, opacity: 0.75,
                  background: mode === 'user' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
                }}>TODO</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Utilisateur connecté + API ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <ApiStatusBadge onOpenLogs={onOpenLogs} />

          {/* Pill utilisateur */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 10px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: avatarColor, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#fff',
            }}>
              {initials}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{pseudo}</span>
          </div>

          {/* Déconnexion */}
          <button
            onClick={onLogout}
            style={{
              height: 34, padding: '0 10px', fontSize: 13, fontWeight: 600,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)',
              color: '#ef4444', borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
            title="Se déconnecter"
          >
            🔓 <span style={{ fontSize: 12 }}>Déconnexion</span>
          </button>
        </div>
      </div>
    </header>
  );
}
