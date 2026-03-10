/**
 * Barre sur une seule ligne : ajout par URL/ID F95 + zone cookies (affichage masquable avec persistance).
 */
import { useState } from 'react';
import F95CookiesHelpModal from './F95CookiesHelpModal';

interface F95ImportAndCookiesBarProps {
  importInput: string;
  setImportInput: (v: string) => void;
  importing: boolean;
  onAddByUrlOrId: () => void;
  onAddManual: () => void;
  f95CookieInput: string;
  setF95CookieInput: (v: string) => void;
  onSaveCookies: () => void;
  cookieSectionOpen: boolean;
  onToggleCookieSection: () => void;
  onOpenF95Login: () => void;
}

export default function F95ImportAndCookiesBar({
  importInput,
  setImportInput,
  importing,
  onAddByUrlOrId,
  onAddManual,
  f95CookieInput,
  setF95CookieInput,
  onSaveCookies,
  cookieSectionOpen,
  onToggleCookieSection,
  onOpenF95Login,
}: F95ImportAndCookiesBarProps) {
  const [showHelpModal, setShowHelpModal] = useState(false);

  return (
    <>
      <div className="library-toolbar-filters library-toolbar-filters--add-cookie-row library-f95-bar">
        <div className="library-f95-bar-left">
          <span className="library-collection-import-label">Ajouter par URL ou ID F95 :</span>
          <input
            type="text"
            className="app-input library-toolbar-input library-collection-import-input"
            value={importInput}
            onChange={(e) => setImportInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAddByUrlOrId()}
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
            title="Ajouter un jeu manuellement (LewdCorner, autre source ou jeu sans ID)"
          >
            ✍️ Ajout manuel
          </button>
        </div>

        <button
          type="button"
          className="library-toolbar-btn library-toolbar-btn--cookie-toggle"
          onClick={onToggleCookieSection}
          title={cookieSectionOpen ? 'Masquer la zone cookies' : 'Afficher la zone cookies'}
          aria-expanded={cookieSectionOpen}
          aria-label={cookieSectionOpen ? 'Masquer la zone cookies' : 'Afficher la zone cookies'}
        >
          {cookieSectionOpen ? '‹' : '›'}
        </button>

        <div className="library-f95-bar-right">
          {cookieSectionOpen && (
            <>
              <span className="library-collection-import-label library-collection-cookie-label">
                Cookies F95 :
              </span>
              <button
                type="button"
                className="form-btn form-btn--secondary library-collection-connect-btn"
                onClick={onOpenF95Login}
                title="Ouvrir la page de connexion F95Zone. Une fois connecté, colle le cookie manuellement ci-dessous."
              >
                🔐 Se connecter à F95
              </button>
              <button
                type="button"
                className="library-toolbar-btn library-f95-bar-help-btn"
                onClick={() => setShowHelpModal(true)}
                title="Aide : comment récupérer le cookie"
                aria-label="Aide cookies F95"
              >
                ?
              </button>
              <input
                type="password"
                className="app-input library-toolbar-input library-collection-cookie-input"
                value={f95CookieInput}
                onChange={(e) => setF95CookieInput(e.target.value)}
                placeholder="Valeur du cookie xf_session"
                title="Utilisez le bouton ? pour voir comment récupérer cette valeur."
              />
              <button
                type="button"
                className="form-btn form-btn--secondary library-f95-bar-save-btn"
                onClick={onSaveCookies}
                title="Enregistrer les cookies F95"
              >
                💾 Enregistrer
              </button>
            </>
          )}
        </div>
      </div>

      {showHelpModal && <F95CookiesHelpModal onClose={() => setShowHelpModal(false)} />}
    </>
  );
}
