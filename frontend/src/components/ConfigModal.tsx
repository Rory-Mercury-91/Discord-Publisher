// frontend/src/components/ConfigModal.tsx
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

// Imports des composants Settings
import AdminSettings from './SettingsComponents/AdminSettings';
import EnrichmentSettings from './SettingsComponents/EnrichmentSettings';
import MyAccountSettings from './SettingsComponents/MyAccountSettings';
import PreferenceSettings from './SettingsComponents/PreferenceSettings';

type Tab = 'preferences' | 'account' | 'admin' | 'enrichment';

interface ConfigModalProps {
  onClose?: () => void;
}

export default function ConfigModal({ onClose }: ConfigModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('preferences');

  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'preferences', label: 'Préférences', icon: '⚙️' },
    { id: 'account', label: 'Mon compte', icon: '👤' },
    { id: 'admin', label: 'Administration', icon: '🛡️' },
    { id: 'enrichment', label: 'Enrichissement', icon: '🤖' },
  ];

  const modalContent = (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--panel)', borderRadius: 14, width: '92%', maxWidth: 960, maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>⚙️ Configuration</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: 28, cursor: 'pointer', lineHeight: 1, padding: 0 }}>&times;</button>
        </div>

        {/* Onglets */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, padding: '0 24px' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 20px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--muted)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 600 : 400,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'color 0.15s',
                marginBottom: -1,
              }}
            >
              <span>{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div className="styled-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {activeTab === 'preferences' && <PreferenceSettings />}
          {activeTab === 'account' && <MyAccountSettings />}
          {activeTab === 'admin' && <AdminSettings />}
          {activeTab === 'enrichment' && <EnrichmentSettings />}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 28px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            ↩️ Fermer
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
