// frontend/src/components/HelpCenter/index.tsx
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDraggableResizable } from '../../hooks/useDraggableResizable';

import './components/HelpCenter.css';

import ConfigHelp from './components/ConfigHelp';
import FormulaireHelp from './components/FormulaireHelp';
import HistoryHelp from './components/HistoryHelp';
import InstructionsHelp from './components/InstructionsHelp';
import LibraryHelp from './components/LibraryHelp';
import ShortcutsHelp from './components/ShortcutsHelp';
import StatsHelp from './components/StatsHelp';
import TagsHelp from './components/TagsHelp';
import TampermonkeyHelp from './components/TampermonkeyHelp';
import TemplatesHelp from './components/TemplatesHelp';

interface HelpCenterModalProps {
  onClose?: () => void;
}

type HelpSection =
  | 'formulaire'
  | 'bibliotheque'
  | 'tags'
  | 'templates'
  | 'instructions'
  | 'history'
  | 'stats'
  | 'config'
  | 'shortcuts'
  | 'tampermonkey';

const DEFAULT_W = 1100;
const DEFAULT_H = 680;

export default function HelpCenterModal({ onClose }: HelpCenterModalProps) {
  const [activeSection, setActiveSection] = useState<HelpSection>('formulaire');

  const { pos, setPos, size, handleDragMouseDown, handleResizeMouseDown } = useDraggableResizable({
    defaultSize: { w: DEFAULT_W, h: DEFAULT_H },
    minSize:     { w: 560,       h: 400 },
  });

  // Position initiale : centré dans la fenêtre
  useEffect(() => {
    setPos({
      x: Math.max(0, Math.round((window.innerWidth  - DEFAULT_W) / 2)),
      y: Math.max(0, Math.round((window.innerHeight - DEFAULT_H) / 2 - 40)),
    });
  }, [setPos]);

  // Fermeture avec Échap
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const sections = [
    { id: 'formulaire',    icon: '📝', label: 'Formulaire' },
    { id: 'bibliotheque',  icon: '📚', label: 'Bibliothèque' },
    { id: 'tags',          icon: '🏷️', label: 'Tags' },
    { id: 'templates',     icon: '📄', label: 'Templates' },
    { id: 'instructions',  icon: '📋', label: 'Instructions' },
    { id: 'history',       icon: '🕒', label: 'Historique' },
    { id: 'stats',         icon: '📊', label: 'Statistiques' },
    { id: 'config',        icon: '⚙️', label: 'Configuration' },
    { id: 'shortcuts',     icon: '⌨️', label: 'Raccourcis' },
    { id: 'tampermonkey',  icon: '🐒', label: 'Tampermonkey' },
  ] as const;

  const panel = (
    <div
      className="help-float"
      style={pos
        ? { left: pos.x, top: pos.y, width: size.w, height: size.h }
        : { visibility: 'hidden' }
      }
      role="dialog"
      aria-labelledby="help-float-title"
    >
      {/* Barre de titre — zone de drag */}
      <div className="help-float__titlebar" onMouseDown={handleDragMouseDown}>
        <span id="help-float-title" className="help-float__title">❓ Centre d'aide</span>
        <button
          type="button"
          className="f95-help-float__close"
          onClick={onClose}
          title="Fermer"
        >
          ✕
        </button>
      </div>

      {/* Corps : sidebar + contenu */}
      <div className="help-float__body">
        <div className="help-sidebar styled-scrollbar">
          {sections.map(section => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id as HelpSection)}
              className={activeSection === section.id ? 'help-nav-btn help-nav-btn--active' : 'help-nav-btn'}
            >
              <span>{section.icon}</span>
              <span>{section.label}</span>
            </button>
          ))}
        </div>
        <div className="help-content styled-scrollbar">
          {activeSection === 'formulaire'   && <FormulaireHelp />}
          {activeSection === 'bibliotheque' && <LibraryHelp />}
          {activeSection === 'tags'         && <TagsHelp />}
          {activeSection === 'templates'    && <TemplatesHelp />}
          {activeSection === 'instructions' && <InstructionsHelp />}
          {activeSection === 'history'      && <HistoryHelp />}
          {activeSection === 'stats'        && <StatsHelp />}
          {activeSection === 'config'       && <ConfigHelp />}
          {activeSection === 'shortcuts'    && <ShortcutsHelp />}
          {activeSection === 'tampermonkey' && <TampermonkeyHelp />}
        </div>
      </div>

      {/* Pied de page */}
      <div className="help-float__footer">
        <button type="button" onClick={onClose} className="form-btn form-btn--ghost form-btn--sm">
          ↩️ Fermer
        </button>
      </div>

      {/* Poignée de redimensionnement */}
      <div className="float-resize-handle" onMouseDown={handleResizeMouseDown} />
    </div>
  );

  return createPortal(panel, document.body);
}
