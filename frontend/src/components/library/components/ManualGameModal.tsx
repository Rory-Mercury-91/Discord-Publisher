/**
 * Modale d'ajout manuel d'un jeu dans Ma Collection.
 * Supporte F95Zone (via ID/URL), LewdCorner et tout autre source.
 * L'image peut être fournie par URL ou depuis un fichier local (converti en base64).
 * Layout : 2 colonnes pour une meilleure lisibilité.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../../hooks/useModalScrollLock';
import { extractThreadIdFromUrl, type ManualGameData } from '../../../state/hooks/useCollection';

const STATUTS = ['En cours', 'Terminé', 'Abandonné', 'En pause', 'En attente'];
const TYPES   = ['VN', 'RPG', 'RPGM', 'Sandbox', 'Platformer', 'Simulator', 'Strategy', 'Action', 'Puzzle', 'HTML', 'Autre'];
const SOURCES = ['F95Zone', 'LewdCorner', 'Autre'] as const;

interface ManualGameModalProps {
  onClose:  () => void;
  onSubmit: (data: ManualGameData) => Promise<{ ok: boolean; error?: string }>;
}

export default function ManualGameModal({ onClose, onSubmit }: ManualGameModalProps) {
  useEscapeKey(onClose, true);
  useModalScrollLock();

  const [source,       setSource]       = useState<ManualGameData['source']>('LewdCorner');
  const [externalUrl,  setExternalUrl]  = useState('');
  const [title,        setTitle]        = useState('');
  const [version,      setVersion]      = useState('');
  const [status,       setStatus]       = useState('');
  const [gameType,     setGameType]     = useState('');
  const [tags,         setTags]         = useState('');
  const [synopsis,     setSynopsis]     = useState('');
  const [imageMode,    setImageMode]    = useState<'url' | 'file'>('url');
  const [imageUrl,     setImageUrl]     = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageWarning, setImageWarning] = useState<string | null>(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const detectedId   = externalUrl.trim() ? extractThreadIdFromUrl(externalUrl.trim()) : null;

  useEffect(() => {
    if (imageMode === 'url') setImagePreview(imageUrl.trim() || null);
  }, [imageUrl, imageMode]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageWarning(null);
    if (file.size > 800_000) {
      setImageWarning(`Image volumineuse (${(file.size / 1024).toFixed(0)} Ko) — elle sera redimensionnée automatiquement.`);
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const resized = await resizeImageIfNeeded(dataUrl, 800, 1200);
      setImagePreview(resized);
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Le titre est requis.'); return; }
    setError(null);
    setSubmitting(true);
    const image = imageMode === 'url' ? (imageUrl.trim() || null) : (imagePreview || null);
    try {
      const result = await onSubmit({
        title:       title.trim(),
        source,
        externalUrl: externalUrl.trim() || null,
        version:     version.trim() || null,
        status:      status || null,
        gameType:    gameType || null,
        tags:        tags.trim() || null,
        image,
        synopsis:    synopsis.trim() || null,
      });
      if (result.ok) { onClose(); }
      else { setError(result.error || 'Erreur lors de l\'ajout.'); }
    } finally { setSubmitting(false); }
  };

  const sourceIcon = (s: string) => s === 'F95Zone' ? '🔵' : s === 'LewdCorner' ? '🟣' : '🔘';

  const modal = (
    <div className="modal" onClick={onClose}>
      <div
        className="panel modal-panel modal-panel--manual-game"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── En-tête ── */}
        <div className="manual-game-header">
          <div className="manual-game-header__left">
            <span className="manual-game-header__icon">✍️</span>
            <div>
              <h2 className="manual-game-header__title">Ajouter un jeu manuellement</h2>
              <p className="manual-game-header__sub">Pour les jeux LewdCorner, de sources tierces ou sans scraping disponible</p>
            </div>
          </div>
          <button type="button" className="manual-game-close-btn" onClick={onClose} title="Fermer">✕</button>
        </div>

        <form id="manual-game-form-id" onSubmit={handleSubmit} className="manual-game-body styled-scrollbar">

          {/* ══════════ GRILLE 2 COLONNES ══════════ */}
          <div className="manual-game-grid">

            {/* ──────────── COLONNE GAUCHE ──────────── */}
            <div className="manual-game-col">

              {/* Source */}
              <div className="form-field">
                <label className="form-label">Source *</label>
                <div className="manual-game-source-btns">
                  {SOURCES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`manual-game-source-btn${source === s ? ' manual-game-source-btn--active' : ''}`}
                      onClick={() => setSource(s)}
                    >
                      {sourceIcon(s)} {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* URL / ID */}
              <div className="form-field">
                <label className="form-label">
                  {source === 'Autre' ? 'URL du jeu (optionnel)' : `URL ${source} ou ID de thread`}
                  {source !== 'Autre' && detectedId != null && (
                    <span className="manual-game-id-badge"> ✓ ID : {detectedId}</span>
                  )}
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder={
                    source === 'LewdCorner'
                      ? 'https://lewdcorner.com/threads/nom.12345/'
                      : source === 'F95Zone'
                      ? 'https://f95zone.to/threads/nom.12345/ ou 12345'
                      : 'https://exemple.com/jeu/ (lien externe optionnel)'
                  }
                />
              </div>

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

              {/* Version + Statut + Type */}
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
                  rows={4}
                />
              </div>

            </div>
          </div>

          {/* Erreur */}
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
            form="manual-game-form-id"
            className="form-btn form-btn--primary"
            disabled={submitting || !title.trim()}
          >
            {submitting ? '⏳ Ajout en cours…' : '✅ Ajouter à ma collection'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ==================== HELPERS ====================

/** Redimensionne une image (data URL) si elle dépasse maxW×maxH pixels. */
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
