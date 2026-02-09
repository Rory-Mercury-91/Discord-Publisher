import { useEffect, useState } from 'react';
import rootPkg from '../../package.json';
import ApiStatusBadge from './components/ApiStatusBadge';
import AuthModal from './components/AuthModal';
import LogsModal from './components/LogsModal';
import ConfigGateModal from './components/ConfigGateModal';
import ConfigModal from './components/ConfigModal';
import ContentEditor from './components/ContentEditor';
import DiscordPreviewModal from './components/DiscordPreviewModal';
import HelpCenterModal from './components/HelpCenterModal';
import HistoryModal from './components/HistoryModal';
import InstructionsManagerModal from './components/InstructionsManagerModal';
import Preview from './components/Preview';
import StatsModal from './components/StatsModal';
import TagsModal from './components/TagsModal';
import TagsUnlockModal from './components/TagsUnlockModal';
import TemplatesModal from './components/TemplatesModal';
import UpdateNotification from './components/UpdateNotification';
import { ToastProvider, useToast } from './components/ToastProvider';
import { AppProvider, useApp } from './state/appContext';
import { AuthProvider, useAuth } from './state/authContext';

const APP_VERSION = rootPkg.version;

function AppContentInner() {
  const { profile } = useAuth();
  const {
    resetAllFields,
    apiStatus,
    setApiStatus,
    preview,
    setPreviewOverride,
    inputs,
    uploadedImages,
    allVarsConfig,
    setInput,
    postTitle,
    setPostTitle,
    postTags,
    setPostTags,
    removeImage,
    translationType,
    setTranslationType,
    isIntegrated,
    setIsIntegrated,
    setLinkConfigs
  } = useApp();


  const { showToast } = useToast();

  // Fonction pour copier le preview
  const handleCopyPreview = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      showToast('Preview copié dans le presse-papier', 'success');
    } catch (e) {
      showToast('Erreur lors de la copie: ' + e, 'error');
    }
  };

  // Fonction pour réinitialiser tous les champs

  const handleResetFields = async () => {
    resetAllFields();
    showToast('Tous les champs ont été réinialisés', 'success');
  };


  const mainImagePath = uploadedImages.find(img => img.isMain)?.path;

  // B. On garde tes états LOCAUX (ils sont bien ici)
  const [openTemplates, setOpenTemplates] = useState(false);
  const [openTags, setOpenTags] = useState(false);
  const [openTagsUnlock, setOpenTagsUnlock] = useState(false);
  const [openConfigGate, setOpenConfigGate] = useState(false);
  const [openConfig, setOpenConfig] = useState(false);
  const [configAdminMode, setConfigAdminMode] = useState(false);
  const [openInstructions, setOpenInstructions] = useState(false);
  const [openHistory, setOpenHistory] = useState(false);
  const [openStats, setOpenStats] = useState(false);
  const [openShortcutsHelp, setOpenShortcutsHelp] = useState(false);
  const [openDiscordPreview, setOpenDiscordPreview] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);

  // C. État local du Thème (il est bien ici aussi)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('theme');
      return (saved === 'light' ? 'light' : 'dark') as 'dark' | 'light';
    } catch {
      return 'dark';
    }
  });

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // --- TES EFFETS ---

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'h') {
        e.preventDefault();
        setOpenHistory(true); // Utilise l'état local
      }
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        toggleTheme();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [theme]);

  useEffect(() => {
    // On vérifie juste si on a une URL enregistrée pour savoir si on est "configuré"
    const storedUrl = localStorage.getItem('apiUrl') || localStorage.getItem('apiBase');

    if (!storedUrl) {
      setApiStatus('disconnected');
    } else {
      // On initialise à "checking". 
      // C'est le composant ApiStatusBadge qui fera le VRAI travail réseau
      setApiStatus('checking');
    }
  }, [setApiStatus]);


  return (
    <div className="app" style={{ height: '100vh', minHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header className="app-header">
        <h1 style={{ textAlign: 'center', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontSize: 24, fontFamily: 'Noto Color Emoji, Segoe UI Emoji, Apple Color Emoji' }}>🇫🇷</span>
          Générateur de publication
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', opacity: 0.85 }}>v{APP_VERSION}</span>
        </h1>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => setOpenTemplates(true)}>📁 Gérer le Template</button>
            <button onClick={() => setOpenTagsUnlock(true)}>🏷️ Gérer les Tags</button>
            <button onClick={() => setOpenInstructions(true)}>📋 Gérer les Instructions</button>
            <button onClick={() => setOpenHistory(true)}>📜 Historique</button>
            <button onClick={() => setOpenStats(true)}>📈 Statistiques</button>
            <button
              onClick={() => {
                if (profile?.is_master_admin) {
                  setConfigAdminMode(true);
                  setOpenConfig(true);
                } else {
                  setOpenConfigGate(true);
                }
              }}
            >
              ⚙️ Configuration
            </button>
            {/* Place ApiStatusBadge juste avant le bouton "?" */}
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ApiStatusBadge onOpenLogs={() => setShowLogsModal(true)} />
              <button
                onClick={() => setOpenShortcutsHelp(true)}
                style={{
                  fontSize: 18,
                  width: 36,
                  height: 36,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Aide des raccourcis clavier"
              >
                ❓
              </button>
              <button
                onClick={toggleTheme}
                style={{
                  fontSize: 20,
                  width: 36,
                  height: 36,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={theme === 'dark' ? 'Passer en mode jour' : 'Passer en mode nuit'}
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
            </span>
          </div>
        </div>
      </header>
      {/* Layout principal en CSS Grid */}
      <main style={{
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        flex: 1,
        minHeight: 0,
        height: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box'
      }}>
        {/* Ligne 2 : 2 colonnes */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '65% 35%',
          height: '100%',
          minHeight: 0,
          overflow: 'hidden',
          boxSizing: 'border-box'
        }}>
          {/* Colonne gauche : ContentEditor — padding interne pour que la scrollbar ne mange pas les bordures des champs */}
          <div
            className="styled-scrollbar"
            style={{
              height: '100%',
              overflowY: 'auto',
              overflowX: 'hidden',
              borderRight: '1px solid var(--border)',
              boxSizing: 'border-box',
              width: '100%',
              maxWidth: '100%'
            }}
          >
            <div style={{ boxSizing: 'border-box', minHeight: '100%' }}>
              <ContentEditor />
            </div>
          </div>
          {/* Colonne droite : Preview */}
          <div
            data-preview-container
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              overflow: 'hidden',
              background: 'var(--bg)',
              padding: 16
            }}
          >
            <Preview
              preview={preview || ''}
              setPreviewContent={setPreviewOverride}
              onCopy={handleCopyPreview}
              onOpenDiscordPreview={() => setOpenDiscordPreview(true)}
            />
          </div>
        </div>
      </main>

      {openTemplates && <TemplatesModal onClose={() => setOpenTemplates(false)} />}
      {openTagsUnlock && (
        <TagsUnlockModal
          isOpen={openTagsUnlock}
          onClose={() => setOpenTagsUnlock(false)}
          onUnlock={() => {
            setOpenTagsUnlock(false);
            setOpenTags(true);
          }}
        />
      )}
      {openTags && <TagsModal onClose={() => setOpenTags(false)} />}
      {openConfigGate && (
        <ConfigGateModal
          onClose={() => setOpenConfigGate(false)}
          onOpenConfig={(adminMode: boolean) => {
            setConfigAdminMode(adminMode);
            setOpenConfigGate(false);
            setOpenConfig(true);
          }}
        />
      )}
      {openConfig && (
        <ConfigModal
          adminMode={configAdminMode}
          onClose={() => setOpenConfig(false)}
          onOpenLogs={() => setShowLogsModal(true)}
        />
      )}
      {openInstructions && <InstructionsManagerModal onClose={() => setOpenInstructions(false)} />}
      {openHistory && <HistoryModal onClose={() => setOpenHistory(false)} />}
      {openStats && <StatsModal onClose={() => setOpenStats(false)} />}
      {openShortcutsHelp && <HelpCenterModal onClose={() => setOpenShortcutsHelp(false)} />}
      {openDiscordPreview && (
        <DiscordPreviewModal
          preview={preview || ''}
          onClose={() => setOpenDiscordPreview(false)}
          onCopy={handleCopyPreview}
          mainImagePath={mainImagePath}
        />
      )}
      {showLogsModal && <LogsModal onClose={() => setShowLogsModal(false)} />}
      
      {/* Update notification - always mounted to check for updates */}
      <UpdateNotification />
    </div>
  );
}

function AppWithAuth() {
  const { user, profile, loading } = useAuth();
  const needAuth = loading || !user || !profile?.discord_id?.trim() || !profile?.pseudo?.trim();
  return (
    <>
      {needAuth && <AuthModal />}
      <AppContentInner />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <ToastProvider>
          <AppWithAuth />
        </ToastProvider>
      </AppProvider>
    </AuthProvider>
  );
}
