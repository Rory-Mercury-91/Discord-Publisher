/**
 * Modale d'édition d'un jeu dans Ma Collection.
 * Même périmètre de champs que l'ajout manuel : source, URL, titres, image, métadonnées, synopsis EN/FR, lien trad.
 * Met à jour user_collection (title, f95_url, f95_thread_id, scraped_data).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../../hooks/useModalScrollLock';
import { extractThreadIdFromUrl, type UserCollectionEntryEnriched } from '../../../state/hooks/useCollection';
import { createApiHeaders } from '../../../lib/api-helpers';
import {
  MANUAL_GAME_ENGINES as ENGINES,
  MANUAL_GAME_SOURCES as SOURCES,
  MANUAL_GAME_STATUTS as STATUTS,
  manualGameSourceIcon as sourceIcon,
  type ManualGameSource,
} from '../manual-game-form-constants';

export type EditGameSubmitUpdates = {
  title?            : string | null;
  scraped_data?     : Record<string, unknown> | null;
  f95_url?          : string | null;
  f95_thread_id?    : number | null;
};

interface EditGameModalProps {
  entry:    UserCollectionEntryEnriched;
  onClose:  () => void;
  onSubmit: (entryId: string, updates: EditGameSubmitUpdates) => Promise<{ ok: boolean; error?: string }>;
}

function normalizeTagsForInput(raw: unknown): string {
  if (raw == null) return '';
  if (Array.isArray(raw)) return raw.filter(Boolean).join(', ');
  return String(raw);
}

export default function EditGameModal({ entry, onClose, onSubmit }: EditGameModalProps) {
  useEscapeKey(onClose, true);
  useModalScrollLock();

  const sd = (entry.scraped_data ?? {}) as Record<string, unknown>;
  const gameFromCatalogue = !!entry.game;

  const initialSource = ((): ManualGameSource => {
    const s = sd.source;
    if (s === 'F95Zone' || s === 'LewdCorner' || s === 'Autre') return s;
    return 'LewdCorner';
  })();

  const [source, setSource] = useState<ManualGameSource>(initialSource);
  const [externalUrl, setExternalUrl] = useState(() => entry.f95_url ?? '');
  const [title, setTitle] = useState(
    () => (sd.name as string | undefined) ?? entry.game?.nom_du_jeu ?? entry.title ?? ''
  );
  const [version, setVersion] = useState(() => (sd.version as string | undefined) ?? entry.game?.version ?? '');
  const [status, setStatus] = useState(() => (sd.status as string | undefined) ?? entry.game?.statut ?? '');
  const [gameType, setGameType] = useState(() => (sd.type as string | undefined) ?? entry.game?.type ?? '');
  const [tags, setTags] = useState(() => normalizeTagsForInput(sd.tags ?? entry.game?.tags));
  const [lienTrad, setLienTrad] = useState(
    () => (sd.lien_trad as string | undefined) ?? entry.game?.lien_trad ?? ''
  );
  const [synopsisEn, setSynopsisEn] = useState(() => {
    const en = (sd.synopsis_en ?? sd.synopsis) as string | undefined;
    const g = entry.game?.synopsis_en ?? entry.game?.synopsis;
    return (en ?? g ?? '').trim();
  });
  const [synopsisFr, setSynopsisFr] = useState(() => {
    const fr = sd.synopsis_fr as string | undefined;
    return (fr ?? entry.game?.synopsis_fr ?? '').trim();
  });

  const [imageMode, setImageMode] = useState<'url' | 'file'>('url');
  const [imageUrl, setImageUrl] = useState(() => (sd.image as string | undefined) ?? entry.game?.image ?? '');
  const [imagePreview, setImagePreview] = useState<string | null>(
    () => (sd.image as string | undefined) ?? entry.game?.image ?? null
  );
  const [imageWarning, setImageWarning] = useState<string | null>(null);

  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolvedOk, setResolvedOk] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const detectedId = externalUrl.trim() ? extractThreadIdFromUrl(externalUrl.trim()) : null;

  useEffect(() => {
    setResolvedOk(false);
    setResolveError(null);
  }, [externalUrl]);

  useEffect(() => {
    if (imageMode === 'url') setImagePreview(imageUrl.trim() || null);
  }, [imageUrl, imageMode]);

  const handleResolveF95 = async () => {
    const raw = externalUrl.trim();
    if (!raw || resolving) return;

    const base = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
    const key = localStorage.getItem('apiKey') || '';
    if (!base || !key) {
      setResolveError('API non configurée (URL et clé requises dans Paramètres)');
      return;
    }

    setResolving(true);
    setResolveError(null);
    setResolvedOk(false);

    try {
      const isNumeric = /^\d+$/.test(raw);
      const body: Record<string, unknown> = isNumeric ? { f95_thread_id: parseInt(raw, 10) } : { url: raw };
      body.translate_synopsis = true;

      const headers = await createApiHeaders(key);
      const res = await fetch(`${base}/api/collection/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setResolveError(data?.error || `Erreur HTTP ${res.status}`);
        return;
      }

      const scraped = data.scraped_data;
      if (!scraped) {
        setResolveError('Aucune donnée récupérée depuis F95Zone');
        return;
      }

      if (scraped.name) setTitle(scraped.name);
      if (scraped.version) setVersion(scraped.version);
      if (scraped.status) setStatus(scraped.status);
      if (scraped.type) setGameType(scraped.type);
      if (scraped.tags) {
        setTags(Array.isArray(scraped.tags) ? scraped.tags.join(', ') : String(scraped.tags));
      }
      if (scraped.image) {
        setImageUrl(scraped.image);
        setImageMode('url');
        setImagePreview(scraped.image);
      }
      if (scraped.synopsis_en) setSynopsisEn(scraped.synopsis_en);
      else if (scraped.synopsis) setSynopsisEn(scraped.synopsis);
      if (scraped.synopsis_fr) setSynopsisFr(scraped.synopsis_fr);
      const lt = (scraped as Record<string, unknown>).lien_trad;
      if (lt != null && String(lt).trim()) setLienTrad(String(lt).trim());

      if (data.f95_url && isNumeric) setExternalUrl(data.f95_url);

      setResolvedOk(true);
    } catch (e: unknown) {
      setResolveError((e as Error)?.message || 'Erreur réseau');
    } finally {
      setResolving(false);
    }
  };

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
    if (!title.trim()) {
      setError('Le titre est requis.');
      return;
    }
    setError(null);
    setSubmitting(true);

    const image = imageMode === 'file' ? (imagePreview || null) : (imageUrl.trim() || null);
    const baseSd: Record<string, unknown> = { ...(entry.scraped_data ?? {}) };

    const synopsisEnTrim = synopsisEn.trim();
    const synopsisFrTrim = synopsisFr.trim();

    const parsedFromUrl = externalUrl.trim() ? extractThreadIdFromUrl(externalUrl.trim()) : null;
    let nextThreadId = entry.f95_thread_id;
    if (parsedFromUrl != null) nextThreadId = parsedFromUrl;

    let nextF95Url: string | null;
    if (source === 'F95Zone' && nextThreadId > 0) {
      nextF95Url = `https://f95zone.to/threads/thread.${nextThreadId}/`;
    } else {
      nextF95Url = externalUrl.trim() || null;
    }

    const newScrapedData: Record<string, unknown> = {
      ...baseSd,
      name: title.trim() || null,
      version: version.trim() || null,
      status: status || null,
      type: gameType || null,
      tags: tags.trim() || null,
      image,
      synopsis: synopsisEnTrim || null,
      synopsis_en: synopsisEnTrim || null,
      synopsis_fr: synopsisFrTrim || null,
      lien_trad: lienTrad.trim() || null,
      source,
    };

    try {
      const result = await onSubmit(entry.id, {
        title: title.trim() || null,
        scraped_data: newScrapedData,
        f95_url: nextF95Url,
        f95_thread_id: nextThreadId,
      });
      if (result.ok) onClose();
      else setError(result.error || 'Erreur lors de la mise à jour.');
    } finally {
      setSubmitting(false);
    }
  };

  const displayName = entry.game?.nom_du_jeu ?? entry.title ?? `Jeu #${entry.f95_thread_id}`;

  const modal = (
    <div className="modal" onClick={onClose}>
      <div
        className="panel modal-panel modal-panel--manual-game"
        onClick={(e) => e.stopPropagation()}
      >
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
          <button type="button" className="manual-game-close-btn" onClick={onClose} title="Fermer">
            ✕
          </button>
        </div>

        {gameFromCatalogue && (
          <div className="edit-game-catalogue-notice">
            ℹ️ Ce jeu est dans le catalogue F95. Les champs ci-dessous sont ceux stockés dans votre collection ;
            vous pouvez les aligner sur le tableur ou les surcharger (y compris URL / ID de thread).
          </div>
        )}

        <form id="edit-game-form-id" onSubmit={handleSubmit} className="manual-game-body styled-scrollbar">
          <div className="manual-game-grid">
            <div className="manual-game-col">
              <div className="form-field">
                <label className="form-label">Source</label>
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
                  <span className="manual-game-error" style={{ marginTop: 4 }}>
                    ❌ {resolveError}
                  </span>
                )}
                {resolvedOk && (
                  <span style={{ color: '#10b981', fontSize: 12, marginTop: 4, display: 'block' }}>
                    ✅ Données récupérées depuis F95Zone — vérifiez et complétez si besoin
                  </span>
                )}
              </div>

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
                    {imageWarning && <span className="manual-game-img-warning">⚠️ {imageWarning}</span>}
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
                      onClick={() => {
                        setImagePreview(null);
                        setImageUrl('');
                      }}
                      title="Supprimer l'image"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="manual-game-col">
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
                    {STATUTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
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
                    {ENGINES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

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

              <div className="form-field">
                <label className="form-label">
                  Lien de traduction
                  <span className="manual-game-hint"> (optionnel)</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={lienTrad}
                  onChange={(e) => setLienTrad(e.target.value)}
                  placeholder="https://… (page ou fichier de la traduction)"
                />
              </div>

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

          {error && <div className="manual-game-error">❌ {error}</div>}
        </form>

        <div className="manual-game-footer">
          <button type="button" onClick={onClose} className="form-btn form-btn--ghost" disabled={submitting}>
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

async function resizeImageIfNeeded(dataUrl: string, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= maxW && img.height <= maxH) {
        resolve(dataUrl);
        return;
      }
      const ratio = Math.min(maxW / img.width, maxH / img.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
