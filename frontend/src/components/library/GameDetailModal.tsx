import { useEffect, useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';
import { tauriAPI } from '../../lib/tauri-api';
import { getSupabase } from '../../lib/supabase';
import { trackTranslationClick } from '../../lib/api-helpers';
import type { GameF95 } from './library-types';

interface GameDetailModalProps {
  game: GameF95;
  onClose: () => void;
}

export default function GameDetailModal({ game, onClose }: GameDetailModalProps) {
  useEscapeKey(onClose, true);
  useModalScrollLock();
  const [tags, setTags] = useState<string[]>([]);
  const [synopsisFr, setSynopsisFr] = useState<string>('');
  const [synopsisEn, setSynopsisEn] = useState<string>('');
  const [downloadCount, setDownloadCount] = useState<number | null>(null);

  useEffect(() => {
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

  const openLink = (url: string) => {
    if (!url) return;
    tauriAPI.openUrl(url);
  };

  return (
    <div className="library-detail-backdrop">
      <div className="library-detail-panel styled-scrollbar" onClick={e => e.stopPropagation()}>
        <div
          className="library-detail-header"
          style={
            game.image
              ? { ['--library-detail-header-bg' as string]: `linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.7)), url(${game.image}) center/cover` }
              : undefined
          }
        >
          <div>
            <h2 className="library-detail-title">{game.nom_du_jeu || 'Sans titre'}</h2>
            <div className="library-detail-versions">
              <span className="library-detail-version-badge">🎮 {game.version || 'v?'}</span>
              <span>→</span>
              <span className="library-detail-version-badge library-detail-version-badge--trad">🇫🇷 {game.trad_ver || 'N/A'}</span>
            </div>
          </div>
        </div>

        <div className="library-detail-body">
          {tags.length > 0 && (
            <div className="library-detail-block library-detail-block--tags">
              <h3 className="library-detail-block-title">🏷️ Tags</h3>
              <div className="library-detail-tags-list">
                {tags.map((tag, i) => (
                  <span key={i} className="library-detail-tag">{tag}</span>
                ))}
              </div>
            </div>
          )}

          <div className="library-detail-block library-detail-block--details">
            <h3 className="library-detail-block-title library-detail-block-title--green">ℹ️ Détails</h3>
            <div className="library-detail-grid">
              <InfoRow label="Statut" value={game.statut} />
              <InfoRow label="Type de trad" value={game.type_de_traduction} />
              <InfoRow label="Traducteur" value={game.traducteur} />
              <InfoRow label="Type de jeu" value={game.type} />
            </div>
          </div>

          <div className="library-detail-block library-detail-block--synopsis">
            <h3 className="library-detail-block-title library-detail-block-title--blue">📖 Synopsis</h3>
            <div className="library-detail-synopsis-text">
              {synopsisFr || synopsisEn || 'Aucun synopsis disponible pour le moment.'}
            </div>
          </div>

          <div className="library-detail-block library-detail-block--links">
            <h3 className="library-detail-block-title library-detail-block-title--yellow">🔗 Liens utiles</h3>
            <div className="library-detail-links-row">
              {game.lien_trad && (
                <LinkButton
                  href={game.lien_trad}
                  label="Lien de la traduction"
                  icon="🇫🇷"
                  variant="trad"
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
                <LinkButton href={game.nom_url} label="Lien du jeu original" icon="🎮" variant="game" />
              )}
              {game.traducteur_url && (
                <LinkButton href={game.traducteur_url} label="Page du traducteur" icon="👤" variant="traducteur" />
              )}
            </div>
          </div>
        </div>

        <div className="library-detail-footer">
          <div>
            {downloadCount !== null && (
              <p className="library-detail-downloads">Ce jeu a été téléchargé {downloadCount} fois.</p>
            )}
            <p className="library-detail-discord">
              💬 Une question ? Rejoignez-nous sur{' '}
              <span onClick={() => openLink('https://discord.gg/JuYSbQmxqF')} className="library-detail-discord-link">Discord</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="form-btn form-btn--ghost">↩️ Fermer</button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value || value === 'N/A') return null;
  return (
    <div className="library-detail-info-row">
      <span className="library-detail-info-label">{label}</span>
      <span className="library-detail-info-value">{value}</span>
    </div>
  );
}

function LinkButton({
  href,
  label,
  icon,
  variant,
  onBeforeOpen,
}: {
  href: string;
  label: string;
  icon: string;
  variant: 'trad' | 'game' | 'traducteur';
  onBeforeOpen?: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      className={`library-detail-link-btn library-detail-link-btn--${variant}`}
      onClick={async () => {
        try {
          if (onBeforeOpen) await onBeforeOpen();
        } finally {
          tauriAPI.openUrl(href);
        }
      }}
    >
      <span className={icon === '🇫🇷' ? 'library-detail-link-btn-emoji' : undefined}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
