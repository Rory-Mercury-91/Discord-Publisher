// frontend/src/components/GameDetailModal.tsx
import { useEffect, useState } from 'react';
import { tauriAPI } from '../lib/tauri-api';
import { getSupabase } from '../lib/supabase';
import { trackTranslationClick } from '../lib/api-helpers';
import type { GameF95 } from './LibraryView';

interface GameDetailModalProps {
  game: GameF95;
  onClose: () => void;
}

export default function GameDetailModal({ game, onClose }: GameDetailModalProps) {
  const [tags, setTags] = useState<string[]>([]);
  const [synopsisFr, setSynopsisFr] = useState<string>('');
  const [synopsisEn, setSynopsisEn] = useState<string>('');
  const [downloadCount, setDownloadCount] = useState<number | null>(null);

  useEffect(() => {
    // Tags
    if (game.tags) {
      try {
        const tagList = typeof game.tags === 'string'
          ? game.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
          : game.tags;
        setTags(tagList);
      } catch (e) {
        console.warn('Erreur parsing tags:', e);
      }
    }

    // Synopsis Supabase
    const loadSynopsis = async () => {
      if (!game.nom_url) return;
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY
        );

        const { data, error } = await supabase
          .from('games')
          .select('synopsis_fr, synopsis_en')
          .eq('f95_url', game.nom_url)
          .maybeSingle();

        if (!error && data) {
          if (data.synopsis_fr) setSynopsisFr(data.synopsis_fr);
          if (data.synopsis_en) setSynopsisEn(data.synopsis_en);
        }
      } catch (e) {
        console.warn('Erreur chargement synopsis:', e);
      }
    };

    loadSynopsis();
  }, [game]);

  // Compteur de clics "Lien de la traduction" (téléchargements) pour ce jeu
  useEffect(() => {
    if (!game.nom_url) {
      setDownloadCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const sb = getSupabase();
      if (!sb) return;
      try {
        const { count, error } = await sb
          .from('translation_clicks')
          .select('*', { count: 'exact', head: true })
          .eq('f95_url', game.nom_url);
        if (!cancelled && !error) setDownloadCount(count ?? 0);
      } catch {
        if (!cancelled) setDownloadCount(null);
      }
    })();
    return () => { cancelled = true; };
  }, [game.nom_url]);

  // Ouverture sécurisée des liens (Tauri)
  const openLink = (url: string) => {
    if (!url) return;
    tauriAPI.openUrl(url);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'var(--modal-backdrop)',
        backdropFilter: 'var(--modal-backdrop-blur)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 10000, padding: 20
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--panel)', borderRadius: 16, maxWidth: 900, width: '100%',
          maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          border: '1px solid var(--border)', position: 'relative'
        }}
        className="styled-scrollbar"
        onClick={e => e.stopPropagation()}
      >
        {/* Header avec image */}
        <div style={{
          position: 'relative', height: 300,
          background: game.image
            ? `linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.7)), url(${game.image}) center/cover`
            : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex', alignItems: 'flex-end', padding: 24
        }}>
          <div>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.8)', margin: 0 }}>
              {game.nom_du_jeu || 'Sans titre'}
            </h2>
            <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', fontSize: 14, color: 'rgba(255,255,255,0.9)' }}>
              <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 4 }}>🎮 {game.version || 'v?'}</span>
              <span>→</span>
              <span style={{ background: 'rgba(99,102,241,0.3)', padding: '2px 8px', borderRadius: 4 }}>🇫🇷 {game.trad_ver || 'N/A'}</span>
            </div>
          </div>

          <button onClick={onClose} style={{
            position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: 8,
            background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', fontSize: 20, cursor: 'pointer', backdropFilter: 'blur(4px)'
          }}>✕</button>
        </div>

        {/* Contenu principal : une colonne */}
        <div
          style={{
            padding: 24,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr)',
            gap: 24,
          }}
        >
          {/* Tags */}
          {tags.length > 0 && (
            <div
              style={{
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.25)',
                borderRadius: 12,
                padding: 16,
              }}
            >
              <h3
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#6366f1',
                  marginBottom: 12,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                🏷️ Tags
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {tags.map((tag, i) => (
                  <span
                    key={i}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 500,
                      background: 'rgba(15,23,42,0.85)',
                      color: '#c7d2fe',
                      border: '1px solid rgba(129,140,248,0.6)',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Détails (grille 2x2, sans Mise à jour) */}
          <div
            style={{
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.35)',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <h3
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#34d399',
                marginBottom: 12,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              ℹ️ Détails
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                gap: 12,
                fontSize: 13,
              }}
            >
              <InfoRow label="Statut" value={game.statut} />
              <InfoRow label="Type de trad" value={game.type_de_traduction} />
              <InfoRow label="Traducteur" value={game.traducteur} />
              <InfoRow label="Type de jeu" value={game.type} />
            </div>
          </div>

          {/* Synopsis */}
          <div
            style={{
              background: 'rgba(30,64,175,0.35)',
              border: '1px solid rgba(59,130,246,0.45)',
              borderRadius: 12,
              padding: 16,
              boxShadow: '0 10px 30px rgba(15,23,42,0.6)',
            }}
          >
            <h3
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#bfdbfe',
                marginBottom: 12,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              📖 Synopsis
            </h3>
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: '#e5e7eb',
                whiteSpace: 'pre-wrap',
                maxHeight: 300,
                overflowY: 'auto',
              }}
            >
              {synopsisFr || synopsisEn || 'Aucun synopsis disponible pour le moment.'}
            </div>
          </div>

          {/* Liens utiles (style jaune/orangé, boutons en ligne) */}
          <div
            style={{
              background: 'rgba(251,191,36,0.08)',
              border: '1px solid rgba(251,191,36,0.45)',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <h3
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#fbbf24',
                marginBottom: 12,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              🔗 Liens utiles
            </h3>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              {game.lien_trad && (
                <LinkButton
                  href={game.lien_trad}
                  label="Lien de la traduction"
                  icon="🇫🇷"
                  color="#10b981"
                  bgColor="rgba(16,185,129,0.18)"
                  onBeforeOpen={async () => {
                    if (game.nom_url) {
                      await trackTranslationClick({
                        f95Url: game.nom_url,
                        translationUrl: game.lien_trad,
                        source: 'detail_modal',
                      });
                      setDownloadCount(c => (c ?? 0) + 1);
                    }
                  }}
                />
              )}
              {game.nom_url && (
                <LinkButton
                  href={game.nom_url}
                  label="Lien du jeu original"
                  icon="🎮"
                  color="#6366f1"
                  bgColor="rgba(99,102,241,0.18)"
                />
              )}
              {game.traducteur_url && (
                <LinkButton
                  href={game.traducteur_url}
                  label="Page du traducteur"
                  icon="👤"
                  color="#a855f7"
                  bgColor="rgba(168,85,247,0.18)"
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer : compteur téléchargements + Discord + Fermer */}
        <div style={{
          padding: '16px',
          borderTop: '1px solid var(--border)',
          background: 'rgba(99,102,241,0.03)',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}>
          <div>
            {downloadCount !== null && (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                Ce jeu a été téléchargé {downloadCount} fois.
              </p>
            )}
            <p style={{ margin: downloadCount !== null ? 4 : 0, fontSize: 12, color: 'var(--muted)' }}>
              💬 Une question ? Rejoignez-nous sur{' '}
              <span onClick={() => openLink('https://discord.gg/JuYSbQmxqF')} style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>
                Discord
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ↩️ Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==================== Petits composants utilitaires ==================== */

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value || value === 'N/A') return null;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 2,
        padding: 4,
      }}
    >
      <span style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </span>
      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{value}</span>
    </div>
  );
}

function LinkButton({
  href,
  label,
  icon,
  color,
  bgColor,
  onBeforeOpen,
}: {
  href: string;
  label: string;
  icon: string;
  color: string;
  bgColor?: string;
  onBeforeOpen?: () => void | Promise<void>;
}) {
  const baseBg = bgColor || 'rgba(15,23,42,0.9)';
  return (
    <button
      onClick={async () => {
        try {
          if (onBeforeOpen) await onBeforeOpen();
        } finally {
          tauriAPI.openUrl(href);
        }
      }}
      style={{
        padding: '10px 14px',
        borderRadius: 8,
        background: baseBg,
        border: `1px solid ${color}`,
        color: 'var(--text)',
        textDecoration: 'none',
        fontSize: 13,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        transition: 'all 0.2s',
        cursor: 'pointer',
        flex: 1,
        minWidth: 150,
        textAlign: 'left',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = `0 8px 20px ${color}55`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <span style={icon === '🇫🇷'
        ? { fontFamily: '"Noto Color Emoji","Segoe UI Emoji","Apple Color Emoji",sans-serif' }
        : undefined}
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
