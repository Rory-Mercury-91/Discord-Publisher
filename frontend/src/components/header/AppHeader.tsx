import { useEffect, useState } from 'react';
import { useAuth } from '../../state/authContext';
import ApiStatusBadge from './components/ApiStatusBadge';
import HeaderActions from './components/HeaderActions';
import HeaderBranding from './components/HeaderBranding';
import HeaderModeSwitch from './components/HeaderModeSwitch';
import HeaderSearch from './components/HeaderSearch';
import HeaderToolbar from './components/HeaderToolbar';
import HeaderUserPill from './components/HeaderUserPill';
import type { AppMode } from './constants';
import { STORAGE_KEY_MASTER_ADMIN } from './constants';

export type { AppMode };

export interface AppHeaderProps {
  mode: AppMode;
  onModeChange: (m: AppMode) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenTemplates: () => void;
  onOpenTags: () => void;
  onOpenInstructions: () => void;
  onOpenHistory: () => void;
  onOpenStats: () => void;
  onOpenConfig: () => void;
  onOpenHelp: () => void;
  onOpenLogs: () => void;
  onOpenServer: () => void;
  onLogout: () => void;
}

export default function AppHeader({
  mode,
  onModeChange,
  theme,
  onToggleTheme,
  onOpenTemplates,
  onOpenTags,
  onOpenInstructions,
  onOpenHistory,
  onOpenStats,
  onOpenConfig,
  onOpenHelp,
  onOpenLogs,
  onOpenServer,
  onLogout,
}: AppHeaderProps) {
  const { profile } = useAuth();
  const [masterAdmin, setMasterAdmin] = useState(() =>
    !!localStorage.getItem(STORAGE_KEY_MASTER_ADMIN)
  );

  useEffect(() => {
    const sync = () => setMasterAdmin(!!localStorage.getItem(STORAGE_KEY_MASTER_ADMIN));
    window.addEventListener('masterAdminUnlocked', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('masterAdminUnlocked', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const pseudo = profile?.pseudo || 'Utilisateur';

  const toolItems = [
    { label: '📄 Templates', onClick: onOpenTemplates },
    { label: '📋 Instructions', onClick: onOpenInstructions },
    { label: '📜 Historique', onClick: onOpenHistory },
    { label: '📈 Statistiques', onClick: onOpenStats },
    ...(masterAdmin ? [{ label: '🏷️ Tags', onClick: onOpenTags }] : []),
  ];

  const modeOptions = [
    { id: 'translator' as const, label: '✏️ Traducteur', title: 'Mode traducteur' },
    { id: 'user' as const, label: '📚 Bibliothèque', title: 'Mode utilisateur – Bibliothèque des jeux' },
    ...(profile?.list_manager
      ? [{ id: 'listform' as const, label: '📋 Formulaire liste', title: 'Formulaire liste (page web)' }]
      : []),
  ];

  return (
    <header className="app-header">
      <div className="app-header__row">
        <HeaderBranding />
        {mode === 'translator' && <HeaderSearch masterAdmin={masterAdmin} />}
        <HeaderActions
          theme={theme}
          onToggleTheme={onToggleTheme}
          onOpenConfig={onOpenConfig}
          onOpenHelp={onOpenHelp}
        />
      </div>

      <div className="app-header__row app-header__row--tools">
        <HeaderToolbar tools={toolItems} />
        <div className="app-header-sep" />
        <HeaderModeSwitch mode={mode} options={modeOptions} onModeChange={onModeChange} />
        <div className="app-header-spacer" />
        <div className="app-header-right">
          <ApiStatusBadge onOpenLogs={onOpenLogs} onOpenServer={onOpenServer} />
          <div className="app-header-sep" />
          <HeaderUserPill pseudo={pseudo} />
          <button
            type="button"
            className="app-header-logout-btn"
            onClick={onLogout}
            title="Se déconnecter"
          >
            ↩️ <span>Déconnexion</span>
          </button>
        </div>
      </div>
    </header>
  );
}
