// frontend/src/components/GameDetailModal.tsx
import { useEffect, useState } from 'react';
import { tauriAPI } from '../lib/tauri-api';
import type { GameF95 } from './LibraryView';

interface GameDetailModalProps {
  game: GameF95;
  onClose: () => void;
}

export default function GameDetailModal({ game, onClose }: GameDetailModalProps) {
  const [tags, setTags] = useState<string[]>([]);
  const [synopsisFr, setSynopsisFr] = useState<string>('');
  const [synopsisEn, setSynopsisEn] = useState<string>('');

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

  const updatedAt = game.date_maj || (game.updated_at ? new Date(game.updated_at).toLocaleDateString('fr-FR') : 'Inconnue');

  // Ouverture sécurisée des liens (Tauri)
  const openLink = (url: string) => {
    if (!url) return;
    tauriAPI.openUrl(url);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center',
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

        {/* Contenu principal */}
        <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

          {/* Colonne Gauche : Tags & Synopsis */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {tags.length > 0 && (
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12, textTransform: 'uppercase', opacity: 0.7 }}>🏷️ Tags</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {tags.map((tag, i) => (
                    <span key={i} style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                      background: 'var(--bg-accent)', color: 'var(--accent)', border: '1px solid var(--border)'
                    }}>{tag}</span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12, textTransform: 'uppercase', opacity: 0.7 }}>📖 Synopsis</h3>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--muted)', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>
                {synopsisFr || synopsisEn || "Aucun synopsis disponible pour le moment."}
              </div>
            </div>
          </div>

          {/* Colonne Droite : Infos & Liens */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12, textTransform: 'uppercase', opacity: 0.7 }}>ℹ️ Détails</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                <InfoRow label="Statut" value={game.statut} />
                <InfoRow label="Type de trad" value={game.type_de_traduction} />
                <InfoRow label="Traducteur" value={game.traducteur} />
                <InfoRow label="Mise à jour" value={updatedAt} />
                <InfoRow label="Type de jeu" value={game.type} />
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12, textTransform: 'uppercase', opacity: 0.7 }}>🔗 Liens utiles</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {game.nom_url && <LinkButton href={game.nom_url} label="Lien du jeu original" icon="🎮" color="var(--accent)" />}
                {game.lien_trad && <LinkButton href={game.lien_trad} label="Lien de la traduction" icon="🇫🇷" color="#10b981" />}
                {game.traducteur_url && <LinkButton href={game.traducteur_url} label="Page du traducteur" icon="👤" color="#a855f7" />}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px', borderTop: '1px solid var(--border)', background: 'rgba(99,102,241,0.03)', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
            💬 Une question ? Rejoignez-nous sur{' '}
            <span onClick={() => openLink('https://discord.gg/JuYSbQmxqF')} style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>
              Discord
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ==================== Petits composants utilitaires ==================== */

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value || value === 'N/A') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: 4 }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function LinkButton({ href, label, icon, color }: { href: string; label: string; icon: string; color: string }) {
  return (
    <button
      onClick={() => tauriAPI.openUrl(href)}
      style={{
        padding: '10px 14px', borderRadius: 8, background: `${color}11`, border: `1px solid ${color}33`,
        color, textDecoration: 'none', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10,
        transition: 'all 0.2s', cursor: 'pointer', width: '100%', textAlign: 'left'
      }}
      onMouseEnter={e => { e.currentTarget.style.background = `${color}22`; e.currentTarget.style.transform = 'translateX(4px)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = `${color}11`; e.currentTarget.style.transform = 'translateX(0)'; }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
