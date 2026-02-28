// frontend/src/components/HelpCenter/index.tsx
import { useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';

import './components/HelpCenter.css';

import ConfigHelp from './components/ConfigHelp';
import FormulaireHelp from './components/FormulaireHelp';
import HistoryHelp from './components/HistoryHelp';
import InstructionsHelp from './components/InstructionsHelp';
import LibraryHelp from './components/LibraryHelp';
import ShortcutsHelp from './components/ShortcutsHelp';
import StatsHelp from './components/StatsHelp';
import TagsHelp from './components/TagsHelp';
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
  | 'shortcuts';

export default function HelpCenterModal({ onClose }: HelpCenterModalProps) {
  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  const [activeSection, setActiveSection] = useState<HelpSection>('formulaire');

  const sections = [
    { id: 'formulaire', icon: '📝', label: 'Formulaire' },
    { id: 'bibliotheque', icon: '📚', label: 'Bibliothèque' },
    { id: 'tags', icon: '🏷️', label: 'Tags' },
    { id: 'templates', icon: '📄', label: 'Templates' },
    { id: 'instructions', icon: '📋', label: 'Instructions' },
    { id: 'history', icon: '🕒', label: 'Historique' },
    { id: 'stats', icon: '📊', label: 'Statistiques' },
    { id: 'config', icon: '⚙️', label: 'Configuration' },
    { id: 'shortcuts', icon: '⌨️', label: 'Raccourcis' },
  ] as const;

  return (
    <div className="modal">
      <div
        className="panel modal-panel modal-panel--large"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>❓ Centre d'aide</h3>
        </div>

        <div className="help-layout">
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
            {activeSection === 'formulaire' && <FormulaireHelp />}
            {activeSection === 'bibliotheque' && <LibraryHelp />}
            {activeSection === 'tags' && <TagsHelp />}
            {activeSection === 'templates' && <TemplatesHelp />}
            {activeSection === 'instructions' && <InstructionsHelp />}
            {activeSection === 'history' && <HistoryHelp />}
            {activeSection === 'stats' && <StatsHelp />}
            {activeSection === 'config' && <ConfigHelp />}
            {activeSection === 'shortcuts' && <ShortcutsHelp />}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="form-btn form-btn--ghost">
            ↩️ Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
