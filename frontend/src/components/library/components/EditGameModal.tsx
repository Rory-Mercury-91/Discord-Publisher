/**
 * Modale d'édition d'un jeu dans Ma Collection.
 * Modifie uniquement user_collection (title, scraped_data).
 * Ne touche jamais à f95_jeux ou d'autres tables.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../../hooks/useModalScrollLock';
import type { UserCollectionEntryEnriched } from '../../../state/hooks/useCollection';

const STATUTS = ['En cours', 'Terminé', 'Abandonné', 'En pause', 'En attente'];
const TYPES   = ['VN', 'RPG', 'RPGM', 'RenPy', 'Unity', 'Sandbox', 'Platformer', 'Simulator', 'Strategy', 'Action', 'Puzzle', 'HTML', 'Autre'];

interface EditGameModalProps {
  entry:    UserCollectionEntryEnriched;
  onClose:  () => void;
  onSubmit: (
    entryId: string,
    updates: {
      title?:        string | null;
      scraped_data?: Record<string, unknown> | null;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
}

export default function EditGameModal({ entry, onClose, onSubmit }: EditGameModalProps) {
  useEscapeKey(onClose, true);
  useModalScrollLock();

  // --- Valeurs initiales ---
  // Titre : priorité scraped_data.name > game.nom_du_jeu > entry.title
  const sd = (entry.scraped_data ?? {}) as Record<string, any>;
  const gameFromCatalogue = !!entry.game;

  const [title,     setTitle]     = useState(sd.name ?? entry.game?.nom_du_jeu ?? entry.title ?? '');
  const [version,   setVersion]   = useState(sd.version ?? entry.game?.version ?? '');
  const [status,    setStatus]    = useState(sd.status  ?? entry.game?.statut  ?? '');
  const [gameType,  setGameType]  = useState(sd.type    ?? entry.game?.type    ?? '');
  const [tags,      setTags]      = useState<string>(() => {
    const rawTags = sd.tags ?? entry.game?.tags ?? '';
    if (Array.isArray(rawTags)) return rawTags.join(', ');
    return rawTags ?? '';
  });
  const [synopsis,  setSynopsis]  = useState(sd.synopsis ?? entry.game?.synopsis ?? '');
  const [lienTrad,   setLienTrad]  = useState(sd.lien_trad ?? entry.game?.lien_trad ?? '');

  const [imageMode,    setImageMode]    = useState<'url' | 'file'>('url');
  const [imageUrl,     setImageUrl]     = useState(sd.image ?? entry.game?.image ?? '');
  const [imagePreview, setImagePreview] = useState<string | null>(sd.image ?? entry.game?.image ?? null);
  const [imageWarning, setImageWarning] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (imageMode === 'url') setImagePreview(imageUrl.trim() || null);
  }, [imageUrl, imageMode]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageWarning(null);
    if (file.size > 800_000) {
      setImageWarning(`Image volumineuse (${(file.size / 1024).toFixed(0)} Ko) — elle sera redimensionnée.`);
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const resized = await resizeImageIfNeeded(dataUrl, 800, 1200);
      setImagePreview(resized);
      setImageMode('file');
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Le titre est requis.'); return; }
    setError(null);
    setSubmitting(true);

    const image = imageMode === 'file' ? (imagePreview || null) : (imageUrl.trim() || null);

    // Conserver les champs existants de scraped_data qui ne sont pas dans le formulaire
    const baseSd: Record<string, unknown> = { ...(entry.scraped_data ?? {}) };

    const newScrapedData: Record<string, unknown> = {
      ...baseSd,
      name      : title.trim() || null,
      version   : version.trim() || null,
      status    : status || null,
      type      : gameType || null,
      tags      : tags.trim()
        ? tags.split(',').map((t) => t.trim()).filter(Boolean)
        : (baseSd.tags ?? null),
      image,
      synopsis  : synopsis.trim() || null,
      lien_trad : lienTrad.trim() || null,
    };

    try {
      const result = await onSubmit(entry.id, {
        title:        title.trim() || null,
        scraped_data: newScrapedData,
      });
      if (result.ok) { onClose(); }
      else { setError(result.error || 'Erreur lors de la mise à jour.'); }
    } finally {
      setSubmitting(false); }
  };

  // Nom affiché dans l'en-tête
  const displayName = entry.game?.nom_du_jeu ?? entry.title ?? `Jeu #${entry.f95_thread_id}`;

  const modal = (
    <div className="modal" onClick={onClose}>
      <div
        className="panel modal-panel modal-panel--manual-game"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── En-tête ── */}
        <div className="manual-game-header">
          <div className="manual-game-header__left">
            <span className="manual-game-header__icon">✏️</span>
            <div>
              <h2 className="manual-game-header__title">Modifier les données</h2>
              <p className="manual-game-header__sub" title={displayName}>
                {displayName}
                {gameFromCatalogue && (
                  <span className="edit-game-catalogue-badge"> · Données catalogue F95</span>
                )}
              </p>
            </div>
          </div>
          <button type="button" className="manual-game-close-btn" onClick={onClose} title="Fermer">✕</button>
        </div>

        {gameFromCatalogue && (
          <div className="edit-game-catalogue-notice">
            ℹ️ Ce jeu est dans le catalogue F95. Les modifications s'appliquent uniquement à votre collection
            et peuvent ne pas être visibles si le catalogue a des données plus récentes.
          </div>
        )}

        <form id="edit-game-form-id" onSubmit={handleSubmit} className="manual-game-body styled-scrollbar">
          <div className="manual-game-grid">

            {/* ──────────── COLONNE GAUCHE ──────────── */}
            <div className="manual-game-col">

              {/* Titre */}
              <div className="form-field">
                <label className="form-label">Titre *</label>
                <input
                  type="text"
                  className="form-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Nom du jeu"
                  required
                  autoFocus
                />
              </div>

              {/* Image */}
              <div className="form-field">
                <label className="form-label">Image de couverture</label>
                <div className="manual-game-image-toggle">
                  <button
                    type="button"
                    className={`manual-game-img-mode-btn${imageMode === 'url' ? ' manual-game-img-mode-btn--active' : ''}`}
                    onClick={() => setImageMode('url')}
                  >
                    🔗 URL
                  </button>
                  <button
                    type="button"
                    className={`manual-game-img-mode-btn${imageMode === 'file' ? ' manual-game-img-mode-btn--active' : ''}`}
                    onClick={() => setImageMode('file')}
                  >
                    📁 Fichier local
                  </button>
                </div>

                {imageMode === 'url' && (
                  <input
                    type="text"
                    className="form-input manual-game-img-url-input"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://example.com/cover.jpg"
                  />
                )}

                {imageMode === 'file' && (
                  <div className="manual-game-file-zone">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      className="form-btn form-btn--ghost form-btn--sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      📂 Choisir une image…
                    </button>
                    {imageWarning && (
                      <span className="manual-game-img-warning">⚠️ {imageWarning}</span>
                    )}
                  </div>
                )}

                {imagePreview && (
                  <div className="manual-game-img-preview-wrap">
                    <img
                      src={imagePreview}
                      alt="Aperçu couverture"
                      className="manual-game-img-preview"
                      onError={() => setImagePreview(null)}
                    />
                    <button
                      type="button"
                      className="manual-game-img-remove"
                      onClick={() => { setImagePreview(null); setImageUrl(''); }}
                      title="Supprimer l'image"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

            </div>

            {/* ──────────── COLONNE DROITE ──────────── */}
            <div className="manual-game-col">

              {/* Version */}
              <div className="form-field">
                <label className="form-label">Version</label>
                <input
                  type="text"
                  className="form-input"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="ex. v0.8.0"
                />
              </div>

              {/* Statut + Type */}
              <div className="manual-game-row--2col">
                <div className="form-field">
                  <label className="form-label">Statut</label>
                  <select
                    className="form-input settings-select-pointer"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">— Non renseigné —</option>
                    {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label className="form-label">Type de jeu</label>
                  <select
                    className="form-input settings-select-pointer"
                    value={gameType}
                    onChange={(e) => setGameType(e.target.value)}
                  >
                    <option value="">— Non renseigné —</option>
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* URL de traduction */}
              <div className="form-field">
                <label className="form-label">🔗 URL de traduction</label>
                <input
                  type="url"
                  className="form-input"
                  value={lienTrad}
                  onChange={(e) => setLienTrad(e.target.value)}
                  placeholder="https://… (lien vers la traduction FR)"
                />
              </div>

              {/* Tags */}
              <div className="form-field">
                <label className="form-label">
                  Tags
                  <span className="manual-game-hint"> (séparés par des virgules)</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="2D, Fantaisie, NTR, Romance…"
                />
              </div>

              {/* Synopsis */}
              <div className="form-field manual-game-field--grow">
                <label className="form-label">Synopsis</label>
                <textarea
                  className="form-input manual-game-textarea"
                  value={synopsis}
                  onChange={(e) => setSynopsis(e.target.value)}
                  placeholder="Description du jeu…"
                  rows={6}
                />
              </div>
            </div>
          </div>

          {error && <div className="manual-game-error">❌ {error}</div>}
        </form>

        {/* ── Pied de page ── */}
        <div className="manual-game-footer">
          <button
            type="button"
            onClick={onClose}
            className="form-btn form-btn--ghost"
            disabled={submitting}
          >
            Annuler
          </button>
          <button
            type="submit"
            form="edit-game-form-id"
            className="form-btn form-btn--primary"
            disabled={submitting || !title.trim()}
          >
            {submitting ? '⏳ Enregistrement…' : '💾 Enregistrer les modifications'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ==================== HELPERS ====================

async function resizeImageIfNeeded(dataUrl: string, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= maxW && img.height <= maxH) { resolve(dataUrl); return; }
      const ratio   = Math.min(maxW / img.width, maxH / img.height);
      const canvas  = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
