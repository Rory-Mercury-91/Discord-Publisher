// frontend/src/components/Settings/index.tsx (ex ConfigModal)
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';

import AdminSettings from './components/AdminSettings';
import CollectionSettings from './components/CollectionSettings';
import EnrichmentSettings from './components/EnrichmentSettings';
import MyAccountSettings from './components/MyAccountSettings';
import PreferenceSettings from './components/PreferenceSettings';

const STORAGE_KEY_MASTER_ADMIN = 'discord-publisher:master-admin-code';

type Tab = 'preferences' | 'account' | 'admin' | 'enrichment' | 'collection';

interface SettingsModalProps {
  onClose?: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('preferences');
  const [masterAdmin, setMasterAdmin] = useState(() => !!localStorage.getItem(STORAGE_KEY_MASTER_ADMIN));

  useEffect(() => {
    const sync = () => setMasterAdmin(!!localStorage.getItem(STORAGE_KEY_MASTER_ADMIN));
    const onLocked = () => setMasterAdmin(false);
    window.addEventListener('masterAdminUnlocked', sync);
    window.addEventListener('masterAdminLocked', onLocked);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('masterAdminUnlocked', sync);
      window.removeEventListener('masterAdminLocked', onLocked);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'preferences',  label: 'Préférences',   icon: '⚙️' },
    { id: 'account',      label: 'Mon compte',     icon: '👤' },
    { id: 'collection',   label: 'Ma collection',  icon: '🗂️' },
    { id: 'admin',        label: 'Administration', icon: '🛡️' },
    { id: 'enrichment',   label: 'Enrichissement', icon: '🤖' },
  ];

  const modalContent = (
    <div className="modal">
      <div
        className="panel modal-panel modal-panel--config"
        onClick={e => e.stopPropagation()}
      >
        <div className="config-header">
          <h2>⚙️ Configuration</h2>
        </div>

        <div className="config-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={activeTab === tab.id ? 'config-tab config-tab--active' : 'config-tab'}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="config-content styled-scrollbar">
          {activeTab === 'preferences' && <PreferenceSettings />}
          {activeTab === 'account'     && <MyAccountSettings />}
          {activeTab === 'collection'  && <CollectionSettings />}
          {activeTab === 'admin'       && <AdminSettings />}
          {activeTab === 'enrichment' && masterAdmin && <EnrichmentSettings />}
          {activeTab === 'enrichment' && !masterAdmin && (
            <div className="settings-master-required">
              <div className="settings-master-required__icon">🛡️</div>
              <h4 className="settings-section__title">Master Admin requis</h4>
              <p className="settings-master-required__p">
                Cette section est réservée aux utilisateurs ayant débloqué l'accès administrateur. Saisissez le code Master Admin dans l'onglet <strong>Administration</strong> pour y accéder.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className="form-btn form-btn--primary"
              >
                Aller à l'onglet Administration
              </button>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="form-btn form-btn--ghost">
            ↩️ Fermer
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
