import { useEffect, useState } from 'react';
import rootPkg from '../../package.json';
import AppHeader, { AppMode } from './components/AppHeader';
import AuthModal from './components/AuthModal';
import ConfigModal from './components/ConfigModal';
import ConfirmModal from './components/ConfirmModal';
import ContentEditor from './components/ContentEditor';
import DiscordPreviewModal from './components/DiscordPreviewModal';
import HelpCenterModal from './components/HelpCenterModal';
import HistoryModal from './components/HistoryModal';
import InstructionsManagerModal from './components/InstructionsManagerModal';
import LogsModal from './components/LogsModal';
import Preview from './components/Preview';
import StatsModal from './components/StatsModal';
import TagsModal from './components/TagsModal';
import TemplatesModal from './components/TemplatesModal';
import { ToastProvider, useToast } from './components/ToastProvider';
import UpdateNotification from './components/UpdateNotification';
import { AppProvider, useApp } from './state/appContext';
import { AuthProvider, useAuth } from './state/authContext';

const APP_VERSION = rootPkg.version;

function AppContentInner() {
  const { profile, signOut } = useAuth();
  const {
    resetAllFields, apiStatus, setApiStatus,
    preview, setPreviewOverride,
    uploadedImages,
    setInput,
    setPostTitle, setPostTags,
    translationType, setTranslationType,
    isIntegrated, setIsIntegrated,
    setLinkConfigs,
    templates, currentTemplateIdx, setCurrentTemplateIdx
  } = useApp();

  const { showToast } = useToast();

  const currentTemplate = templates[currentTemplateIdx];
  const templateName = currentTemplate?.name || 'Template';
  const availableTemplates = templates.map((t, idx) => ({
    id: t.id || `template_${idx}`,
    name: t.name || `Template ${idx + 1}`,
    isDefault: t.isDefault || false
  }));

  // ── Modales ──────────────────────────────────────────────────────────────
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [openTemplates, setOpenTemplates] = useState(false);
  const [openTags, setOpenTags] = useState(false);
  const [openConfig, setOpenConfig] = useState(false);
  const [openInstructions, setOpenInstructions] = useState(false);
  const [openHistory, setOpenHistory] = useState(false);
  const [openStats, setOpenStats] = useState(false);
  const [openShortcutsHelp, setOpenShortcutsHelp] = useState(false);
  const [openDiscordPreview, setOpenDiscordPreview] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);

  // ── Mode (traducteur / utilisateur) ──────────────────────────────────────
  const [mode, setMode] = useState<AppMode>('translator');

  // ── Thème ─────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return (localStorage.getItem('theme') === 'light' ? 'light' : 'dark') as 'dark' | 'light'; }
    catch { return 'dark'; }
  });

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // ── Raccourcis clavier ───────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'h') { e.preventDefault(); setOpenHistory(true); }
      if (e.ctrlKey && e.key === 't') { e.preventDefault(); toggleTheme(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [theme]);

  useEffect(() => {
    const storedUrl = localStorage.getItem('apiUrl') || localStorage.getItem('apiBase');
    setApiStatus(storedUrl ? 'checking' : 'disconnected');
  }, [setApiStatus]);

  const handleTemplateChange = (newIndex: number) => {
    setCurrentTemplateIdx(newIndex);
    showToast(`Template : ${templates[newIndex]?.name}`, 'success');
  };

  const handleCopyPreview = async () => {
    try { await navigator.clipboard.writeText(preview); showToast('Preview copié', 'success'); }
    catch (e) { showToast('Erreur lors de la copie: ' + e, 'error'); }
  };

  const mainImagePath = uploadedImages.find(img => img.isMain)?.url;

  return (
    <div className="app" style={{ height: '100vh', minHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header refactorisé ─────────────────────────────────────────── */}
      <AppHeader
        mode={mode}
        onModeChange={setMode}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenTemplates={() => setOpenTemplates(true)}
        onOpenTags={() => setOpenTags(true)}
        onOpenInstructions={() => setOpenInstructions(true)}
        onOpenHistory={() => setOpenHistory(true)}
        onOpenStats={() => setOpenStats(true)}
        onOpenConfig={() => setOpenConfig(true)}
        onOpenHelp={() => setOpenShortcutsHelp(true)}
        onOpenLogs={() => setShowLogsModal(true)}
        onLogout={() => setShowLogoutConfirm(true)}
      />

      {/* ── Contenu principal ─────────────────────────────────────────────── */}
      {mode === 'translator' ? (
        <main style={{ display: 'grid', gridTemplateRows: 'auto 1fr', flex: 1, minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '65% 35%', height: '100%', minHeight: 0, overflow: 'hidden', boxSizing: 'border-box' }}>
            <div className="styled-scrollbar" style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', borderRight: '1px solid var(--border)', boxSizing: 'border-box' }}>
              <div style={{ boxSizing: 'border-box', minHeight: '100%' }}>
                <ContentEditor />
              </div>
            </div>
            <div data-preview-container style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)', padding: 16 }}>
              <Preview
                preview={preview || ''}
                setPreviewContent={setPreviewOverride}
                onCopy={handleCopyPreview}
                onOpenDiscordPreview={() => setOpenDiscordPreview(true)}
                templateName={templateName}
                availableTemplates={availableTemplates}
                currentTemplateIdx={currentTemplateIdx}
                onTemplateChange={handleTemplateChange}
              />
            </div>
          </div>
        </main>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: 'var(--muted)' }}>
          <span style={{ fontSize: 72, lineHeight: 1 }}>🚧</span>
          <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text)' }}>Mode utilisateur</h2>
          <p style={{ margin: 0, fontSize: 14, opacity: 0.7 }}>Fonctionnalité en cours de développement</p>
        </div>
      )}

      {/* ── Modales ───────────────────────────────────────────────────────── */}
      {openTemplates && <TemplatesModal onClose={() => setOpenTemplates(false)} />}
      {openTags && <TagsModal onClose={() => setOpenTags(false)} />}
      {openConfig && <ConfigModal onClose={() => setOpenConfig(false)} onOpenLogs={() => setShowLogsModal(true)} />}
      {openInstructions && <InstructionsManagerModal onClose={() => setOpenInstructions(false)} />}
      {openHistory && <HistoryModal onClose={() => setOpenHistory(false)} />}
      {openStats && <StatsModal onClose={() => setOpenStats(false)} />}
      {openShortcutsHelp && <HelpCenterModal onClose={() => setOpenShortcutsHelp(false)} />}
      {openDiscordPreview && (
        <DiscordPreviewModal preview={preview || ''} onClose={() => setOpenDiscordPreview(false)} onCopy={handleCopyPreview} mainImagePath={mainImagePath} />
      )}
      {showLogsModal && <LogsModal onClose={() => setShowLogsModal(false)} />}

      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="Déconnexion"
        message={`Voulez-vous vraiment vous déconnecter ?\n\nUtilisateur : ${profile?.pseudo || profile?.discord_id || 'Utilisateur'}`}
        confirmText="Se déconnecter"
        cancelText="Annuler"
        type="warning"
        onConfirm={async () => { setShowLogoutConfirm(false); await signOut(); }}
        onCancel={() => setShowLogoutConfirm(false)}
      />
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
      <ToastProvider> {/* On le remonte ici */}
        <AppProvider>
          <AppWithAuth />
        </AppProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
