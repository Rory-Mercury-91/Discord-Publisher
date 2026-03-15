/**
 * Modale d'ajout manuel d'un jeu dans Ma Collection.
 * Supporte F95Zone (via ID/URL avec récupération automatique), LewdCorner et tout autre source.
 * L'image peut être fournie par URL ou depuis un fichier local (converti en base64).
 * Layout : 2 colonnes pour une meilleure lisibilité.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../../hooks/useModalScrollLock';
import { extractThreadIdFromUrl, type ManualGameData } from '../../../state/hooks/useCollection';
import { createApiHeaders } from '../../../lib/api-helpers';

const STATUTS = ['En cours', 'Terminé', 'Abandonné', 'En pause', 'En attente'];
const ENGINES = ['ADRIFT', 'Flash', 'HTML', 'Java', 'QSP', 'RAGS', 'RPGM', 'Ren\'Py', 'Tads', 'Unity', 'Unreal Engine', 'WebGL', 'Wolf RPG', 'Autre'];
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
  const [synopsisEn,   setSynopsisEn]   = useState('');
  const [synopsisFr,   setSynopsisFr]   = useState('');
  const [imageMode,    setImageMode]    = useState<'url' | 'file'>('url');
  const [imageUrl,     setImageUrl]     = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageWarning, setImageWarning] = useState<string | null>(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // États pour la récupération automatique F95
  const [resolving,    setResolving]    = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolvedOk,   setResolvedOk]   = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const detectedId   = externalUrl.trim() ? extractThreadIdFromUrl(externalUrl.trim()) : null;

  // Réinitialiser l'état de résolution quand l'URL change
  useEffect(() => {
    setResolvedOk(false);
    setResolveError(null);
  }, [externalUrl]);

  useEffect(() => {
    if (imageMode === 'url') setImagePreview(imageUrl.trim() || null);
  }, [imageUrl, imageMode]);

  // ── Récupération automatique des données F95Zone ──────────────────────────
  const handleResolveF95 = async () => {
    const raw = externalUrl.trim();
    if (!raw || resolving) return;

    const base = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
    const key  = localStorage.getItem('apiKey') || '';
    if (!base || !key) {
      setResolveError('API non configurée (URL et clé requises dans Paramètres)');
      return;
    }

    setResolving(true);
    setResolveError(null);
    setResolvedOk(false);

    try {
      const isNumeric = /^\d+$/.test(raw);
      const body: Record<string, unknown> = isNumeric
        ? { f95_thread_id: parseInt(raw, 10) }
        : { url: raw };
      body.translate_synopsis = true;

      const headers = await createApiHeaders(key);
      const res = await fetch(`${base}/api/collection/resolve`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body   : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setResolveError(data?.error || `Erreur HTTP ${res.status}`);
        return;
      }

      const sd = data.scraped_data;
      if (!sd) {
        setResolveError('Aucune donnée récupérée depuis F95Zone');
        return;
      }

      // Pré-remplissage des champs depuis scraped_data
      if (sd.name)     setTitle(sd.name);
      if (sd.version)  setVersion(sd.version);
      if (sd.status)   setStatus(sd.status);
      if (sd.type)     setGameType(sd.type);
      if (sd.tags) {
        setTags(Array.isArray(sd.tags) ? sd.tags.join(', ') : String(sd.tags));
      }
      if (sd.image) {
        setImageUrl(sd.image);
        setImageMode('url');
        setImagePreview(sd.image);
      }
      if (sd.synopsis_en) setSynopsisEn(sd.synopsis_en);
      else if (sd.synopsis) setSynopsisEn(sd.synopsis);
      if (sd.synopsis_fr) setSynopsisFr(sd.synopsis_fr);

      // Mettre à jour l'URL canonique si on avait saisi un ID
      if (data.f95_url && isNumeric) setExternalUrl(data.f95_url);

      setResolvedOk(true);
    } catch (e: any) {
      setResolveError(e?.message || 'Erreur réseau');
    } finally {
      setResolving(false);
    }
  };

  // ── Gestion image fichier ─────────────────────────────────────────────────
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

  // ── Soumission ────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Le titre est requis.'); return; }
    setError(null);
    setSubmitting(true);
    const image = imageMode === 'url' ? (imageUrl.trim() || null) : (imagePreview || null);
    try {
      const result = await onSubmit({
        title      : title.trim(),
        source,
        externalUrl: externalUrl.trim() || null,
        version    : version.trim() || null,
        status     : status || null,
        gameType   : gameType || null,
        tags       : tags.trim() || null,
        image,
        synopsis   : synopsisEn.trim() || null,
        synopsis_en: synopsisEn.trim() || null,
        synopsis_fr: synopsisFr.trim() || null,
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
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ flex: 1 }}
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
                  {/* Bouton récupération automatique F95Zone */}
                  {source === 'F95Zone' && externalUrl.trim() && (
                    <button
                      type="button"
                      className={`form-btn form-btn--secondary${resolvedOk ? ' form-btn--success' : ''}`}
                      style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                      onClick={handleResolveF95}
                      disabled={resolving}
                      title="Récupérer automatiquement les données depuis F95Zone"
                    >
                      {resolving ? '⏳' : resolvedOk ? '✅ Récupéré' : '🔍 Récupérer'}
                    </button>
                  )}
                </div>
                {resolveError && (
                  <span className="manual-game-error" style={{ marginTop: 4 }}>❌ {resolveError}</span>
                )}
                {resolvedOk && (
                  <span style={{ color: '#10b981', fontSize: 12, marginTop: 4, display: 'block' }}>
                    ✅ Données récupérées depuis F95Zone — vérifiez et complétez si besoin
                  </span>
                )}
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
                    {ENGINES.map((t) => <option key={t} value={t}>{t}</option>)}
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

              {/* Synopsis EN */}
              <div className="form-field">
                <label className="form-label">
                  Synopsis EN
                  <span className="manual-game-hint"> (anglais original)</span>
                </label>
                <textarea
                  className="form-input manual-game-textarea"
                  value={synopsisEn}
                  onChange={(e) => setSynopsisEn(e.target.value)}
                  placeholder="Original synopsis in English…"
                  rows={3}
                />
              </div>

              {/* Synopsis FR */}
              <div className="form-field manual-game-field--grow">
                <label className="form-label">
                  Synopsis FR
                  <span className="manual-game-hint"> (traduction française)</span>
                </label>
                <textarea
                  className="form-input manual-game-textarea"
                  value={synopsisFr}
                  onChange={(e) => setSynopsisFr(e.target.value)}
                  placeholder="Synopsis en français…"
                  rows={3}
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