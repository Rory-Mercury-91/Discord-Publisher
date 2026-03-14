/**
 * Panneau d'aide flottant, draggable et redimensionnable pour récupérer le cookie F95 (xf_session).
 * S'affiche sans backdrop pour rester visible pendant les étapes de connexion.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDraggableResizable } from '../../../hooks/useDraggableResizable';

const DEFAULT_W = 500;
const DEFAULT_H = 440;

interface F95CookiesHelpModalProps {
  onClose: () => void;
}

export default function F95CookiesHelpModal({ onClose }: F95CookiesHelpModalProps) {
  const { pos, setPos, size, handleDragMouseDown, handleResizeMouseDown } = useDraggableResizable({
    defaultSize: { w: DEFAULT_W, h: DEFAULT_H },
    minSize:     { w: 280,       h: 280 },
  });

  // Position initiale : coin supérieur droit
  useEffect(() => {
    setPos({ x: window.innerWidth - DEFAULT_W - 24, y: 80 });
  }, [setPos]);

  // Fermeture avec Échap
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const panel = (
    <div
      className="f95-help-float"
      style={pos
        ? { left: pos.x, top: pos.y, width: size.w, height: size.h }
        : { visibility: 'hidden' }
      }
      role="dialog"
      aria-labelledby="f95-help-float-title"
    >
      {/* Barre de titre — zone de drag */}
      <div className="f95-help-float__titlebar" onMouseDown={handleDragMouseDown}>
        <span id="f95-help-float-title" className="f95-help-float__title">
          🍪 Cookie F95 — xf_session
        </span>
        <button
          type="button"
          className="f95-help-float__close"
          onClick={onClose}
          title="Fermer"
        >
          ✕
        </button>
      </div>

      {/* Contenu */}
      <div className="f95-help-float__body styled-scrollbar">
        <p className="f95-cookies-help-intro">
          Pour accéder à certaines données réservées aux membres connectés, enregistrez votre cookie de session F95Zone.
          La fenêtre F95 s&apos;ouvre dans une autre fenêtre de l&apos;application.
        </p>
        <ol className="f95-cookies-help-steps">
          <li>
            Connectez-vous sur F95 à l&apos;aide du bouton prévu : <strong>🔐 Se connecter à F95</strong>.
          </li>
          <li>
            Une fois connecté, ouvrez les outils de développement sur <strong>la fenêtre de connexion F95</strong> (et non sur l&apos;application principale) : <kbd>F12</kbd>
            <br />
            <span className="f95-cookies-help-hint">💡 Si la ligne du cookie n&apos;apparaît pas, faites <kbd>F5</kbd> pour recharger la fenêtre de connexion, puis rouvrez les outils.</span>
            <ol className="f95-cookies-help-substeps">
              <li>Onglet <strong>Application</strong>.</li>
              <li>Dans le menu de gauche : <strong>Cookies</strong> → <strong>https://f95zone.to</strong></li>
              <li>Repérez le cookie <strong>xf_session</strong> et copiez sa colonne <strong>Value</strong></li>
            </ol>
          </li>
          <li>
            Collez la valeur copiée dans le champ prévu puis cliquez sur <strong>💾 Enregistrer</strong>.
          </li>
        </ol>
        <p className="f95-cookies-help-note">
          Ce cookie permet à l&apos;application de récupérer des informations non transmises lorsque vous n&apos;êtes pas connecté.
        </p>
      </div>

      {/* Poignée de redimensionnement */}
      <div className="float-resize-handle" onMouseDown={handleResizeMouseDown} />
    </div>
  );

  return createPortal(panel, document.body);
}
