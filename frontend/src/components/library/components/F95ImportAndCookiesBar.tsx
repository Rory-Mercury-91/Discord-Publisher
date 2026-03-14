/**
 * Barre sur une seule ligne :
 *   [Import URL/ID] [➕ Ajouter] [✍️ Ajout manuel] [🍪 Cookies F95] | [🔍 Rechercher…]
 * Les cookies sont désormais dans une modale dédiée.
 */
import { useState } from 'react';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../../hooks/useModalScrollLock';
import F95CookiesHelpModal from './F95CookiesHelpModal';

interface F95ImportAndCookiesBarProps {
  importInput: string;
  setImportInput: (v: string) => void;
  importing: boolean;
  onAddByUrlOrId: () => void;
  onAddManual: () => void;
  // Cookies
  f95CookieInput: string;
  setF95CookieInput: (v: string) => void;
  onSaveCookies: () => void;
  onOpenF95Login: () => void;
  // Recherche (déplacée ici depuis CollectionToolbar)
  search: string;
  setSearch: (v: string) => void;
}

// ── Modale cookies ────────────────────────────────────────────────────────────

interface CookiesModalProps {
  f95CookieInput: string;
  setF95CookieInput: (v: string) => void;
  onSaveCookies: () => void;
  onOpenF95Login: () => void;
  onClose: () => void;
}

function CookiesModal({ f95CookieInput, setF95CookieInput, onSaveCookies, onOpenF95Login, onClose }: CookiesModalProps) {
  const [showHelpModal, setShowHelpModal] = useState(false);
  useEscapeKey(() => (showHelpModal ? setShowHelpModal(false) : onClose()), true);
  useModalScrollLock();

  return (
    <div className="library-detail-backdrop" onClick={!showHelpModal ? onClose : undefined} role="dialog" aria-modal="true" aria-labelledby="cookies-modal-title">
      <div
        className="panel library-cookies-modal styled-scrollbar"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="library-cookies-modal__header">
          <h2 id="cookies-modal-title" className="library-cookies-modal__title">🍪 Cookies F95</h2>
          <button type="button" className="manual-game-close-btn" onClick={onClose} title="Fermer">✕</button>
        </div>

        {/* Body */}
        <div className="library-cookies-modal__body">
          <p className="library-cookies-modal__desc">
            Connectez-vous à F95Zone puis renseignez votre cookie <code>xf_session</code> pour accéder aux données réservées aux membres.
          </p>

          <div className="library-cookies-modal__row">
            <button
              type="button"
              className="form-btn form-btn--secondary"
              onClick={onOpenF95Login}
              title="Ouvrir la page de connexion F95Zone"
            >
              🔐 Se connecter à F95
            </button>
            <button
              type="button"
              className="library-toolbar-btn"
              onClick={() => setShowHelpModal(true)}
              title="Aide : comment récupérer le cookie"
              aria-label="Aide cookies F95"
            >
              ❓
            </button>
          </div>

          <div className="library-cookies-modal__field">
            <label className="form-label" htmlFor="cookie-input">Valeur du cookie <code>xf_session</code></label>
            <input
              id="cookie-input"
              type="password"
              className="app-input library-cookies-modal__input"
              value={f95CookieInput}
              onChange={e => setF95CookieInput(e.target.value)}
              placeholder="Collez la valeur du cookie ici"
              onKeyDown={e => e.key === 'Enter' && (onSaveCookies(), onClose())}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="library-cookies-modal__footer">
          <button type="button" className="form-btn form-btn--ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="form-btn form-btn--primary"
            onClick={() => { onSaveCookies(); onClose(); }}
          >
            💾 Enregistrer
          </button>
        </div>
      </div>

      {showHelpModal && <F95CookiesHelpModal onClose={() => setShowHelpModal(false)} />}
    </div>
  );
}

// ── Barre principale ──────────────────────────────────────────────────────────

export default function F95ImportAndCookiesBar({
  importInput, setImportInput, importing, onAddByUrlOrId, onAddManual,
  f95CookieInput, setF95CookieInput, onSaveCookies, onOpenF95Login,
  search, setSearch,
}: F95ImportAndCookiesBarProps) {
  const [showCookiesModal, setShowCookiesModal] = useState(false);
  const hasCookie = !!f95CookieInput.trim();

  return (
    <>
      <div className="library-f95-bar">

        {/* ── Section import ── */}
        <div className="library-f95-bar__import">
          <span className="library-collection-import-label">Ajouter par URL ou ID F95 :</span>
          <input
            type="text"
            className="app-input library-toolbar-input library-collection-import-input"
            value={importInput}
            onChange={e => setImportInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onAddByUrlOrId()}
            placeholder="https://f95zone.to/threads/... ou 285451"
          />
          <button
            type="button"
            className="form-btn form-btn--primary library-collection-import-btn"
            onClick={onAddByUrlOrId}
            disabled={importing}
          >
            {importing ? '…' : '➕ Ajouter'}
          </button>
          <button
            type="button"
            className="form-btn library-collection-import-btn"
            onClick={onAddManual}
            title="Ajouter un jeu manuellement"
          >
            ✍️ Ajout manuel
          </button>
          <button
            type="button"
            className={`form-btn form-btn--ghost library-f95-bar__cookies-btn${hasCookie ? ' library-f95-bar__cookies-btn--active' : ''}`}
            onClick={() => setShowCookiesModal(true)}
            title={hasCookie ? 'Cookie F95 enregistré — cliquer pour modifier' : 'Configurer le cookie F95'}
          >
            🍪 Cookies F95{hasCookie ? ' ✓' : ''}
          </button>
        </div>

        {/* ── Séparateur ── */}
        <span className="library-toolbar-divider library-toolbar-divider--vertical" aria-hidden="true" />

        {/* ── Recherche ── */}
        <input
          type="text"
          className="app-input library-toolbar-input library-f95-bar__search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher…"
        />
      </div>

      {showCookiesModal && (
        <CookiesModal
          f95CookieInput={f95CookieInput}
          setF95CookieInput={setF95CookieInput}
          onSaveCookies={onSaveCookies}
          onOpenF95Login={onOpenF95Login}
          onClose={() => setShowCookiesModal(false)}
        />
      )}
    </>
  );
}