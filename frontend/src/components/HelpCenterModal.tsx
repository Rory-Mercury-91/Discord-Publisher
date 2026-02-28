// frontend/src/components/HelpCenterModal.tsx
import { useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

import './HelpComponents/HelpCenter.css';

// Import des composants d'aide individuels
import ConfigHelp from './HelpComponents/ConfigHelp';
import FormulaireHelp from './HelpComponents/FormulaireHelp';
import HistoryHelp from './HelpComponents/HistoryHelp';
import InstructionsHelp from './HelpComponents/InstructionsHelp';
import LibraryHelp from './HelpComponents/LibraryHelp';
import ShortcutsHelp from './HelpComponents/ShortcutsHelp';
import StatsHelp from './HelpComponents/StatsHelp';
import TagsHelp from './HelpComponents/TagsHelp';
import TemplatesHelp from './HelpComponents/TemplatesHelp';

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
        className="panel"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 1200,
          width: '95%',
          height: '85vh',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: 16,
          borderBottom: '2px solid var(--border)'
        }}>
          <h3 style={{ margin: 0 }}>❓ Centre d'aide</h3>
        </div>

        {/* Contenu principal : grille avec hauteur contrainte pour que le scroll soit dans la zone contenu */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '220px 1fr',
          gridTemplateRows: '1fr',
          gap: 24,
          flex: 1,
          minHeight: 0,
          marginTop: 20,
          padding: '0 8px',
          overflow: 'hidden',
        }}>
          {/* Sidebar Navigation */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            borderRight: '1px solid var(--border)',
            paddingRight: 16,
            minHeight: 0,
            overflowY: 'auto',
          }} className="styled-scrollbar">
            {sections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id as HelpSection)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '11px 14px',
                  background: activeSection === section.id ? 'var(--accent)' : 'transparent',
                  border: 'none',
                  borderRadius: 8,
                  color: activeSection === section.id ? 'white' : 'var(--text)',
                  fontSize: 14,
                  fontWeight: activeSection === section.id ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'left'
                }}
              >
                <span style={{ fontSize: 18 }}>{section.icon}</span>
                <span>{section.label}</span>
              </button>
            ))}
          </div>

          {/* Zone de contenu scrollable */}
          <div style={{
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingRight: 12,
            paddingBottom: 24,
          }} className="styled-scrollbar">
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

        {/* Footer (dans le flux pour ne pas chevaucher le contenu) */}
        <div style={{
          flexShrink: 0,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '16px 32px',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 24px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'opacity 0.2s'
            }}
            onMouseOver={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseOut={e => (e.currentTarget.style.opacity = '1')}
          >
            ↩️ Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
