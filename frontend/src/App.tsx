import { useEffect, useState } from 'react';
import { AppHeader, type AppMode } from './components/header';
import AuthModal from './components/AuthModal';
import SettingsModal from './components/Settings';
import ConfirmModal from './components/Modals/ConfirmModal';
import ContentEditor from './components/ContentEditor';
import { DiscordPreviewModal, Preview } from './components/preview';
import HelpCenterModal from './components/HelpCenter';
import { HistoryModal } from './components/history';
import { InstructionsManagerModal } from './components/instructions';
import { LibraryView } from './components/library';
import { ListFormView } from './components/list-form-view';
import { LogsModal, ServerModal } from './components/server';
import { StatsModal } from './components/stats';
import { TagsModal } from './components/tags';
import { TemplatesModal } from './components/templates';
import { ToastProvider, useToast } from './components/shared/ToastProvider';
import UpdateNotification from './components/UpdateNotification';
import { AppProvider, useApp } from './state/appContext';
import { AuthProvider, useAuth } from './state/authContext';
import { EnrichmentProvider, useEnrichment } from './state/enrichmentContext';
import { useEnrichScheduler } from './state/hooks/useEnrichScheduler';

/** Monte le planificateur d'enrichissement auto (nécessite EnrichmentProvider). */
function EnrichSchedulerGate() {
  const { profile } = useAuth();
  const { startEnrich, isRunning } = useEnrichment();
  useEnrichScheduler(profile?.id, () => startEnrich({ scrapeMissing: false }), isRunning);
  return null;
}

function AppContentInner() {
  const { profile, signOut } = useAuth();
  const {
    setApiStatus,
    preview, setPreviewOverride,
    uploadedImages,
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
  const [showServerModal, setShowServerModal] = useState(false);

  // ── Mode (traducteur / utilisateur) ──────────────────────────────────────
  const [mode, setMode] = useState<AppMode>(() => {
    try {
      return (localStorage.getItem('defaultMode') as AppMode) || 'translator';
    } catch {
      return 'translator';
    }
  });

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
    <EnrichmentProvider>
      <EnrichSchedulerGate />
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
        onOpenServer={() => { setShowServerModal(true); setShowLogsModal(true); }}
        onLogout={() => setShowLogoutConfirm(true)}
      />

      {/* ── Contenu principal ─────────────────────────────────────────────── */}
      {mode === 'listform' ? (
        <ListFormView />
      ) : mode === 'translator' ? (
        <main style={{ display: 'grid', gridTemplateRows: 'auto 1fr', flex: 1, minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '65% 35%', height: '100%', minHeight: 0, overflow: 'hidden', boxSizing: 'border-box' }}>
            <div className="styled-scrollbar" style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', borderRight: '1px solid var(--border)', boxSizing: 'border-box' }}>
              <ContentEditor />
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
        <LibraryView onModeChange={setMode} />
      )}
      {/* ── Modales ───────────────────────────────────────────────────────── */}
      {openTemplates && <TemplatesModal onClose={() => setOpenTemplates(false)} />}
      {openTags && <TagsModal onClose={() => setOpenTags(false)} />}
      {openConfig && (
        <SettingsModal onClose={() => setOpenConfig(false)} />
      )}
      {openInstructions && <InstructionsManagerModal onClose={() => setOpenInstructions(false)} />}
      {openHistory && <HistoryModal onClose={() => setOpenHistory(false)} />}
      {openStats && <StatsModal onClose={() => setOpenStats(false)} />}
      {openShortcutsHelp && <HelpCenterModal onClose={() => setOpenShortcutsHelp(false)} />}
      {openDiscordPreview && (
        <DiscordPreviewModal preview={preview || ''} onClose={() => setOpenDiscordPreview(false)} onCopy={handleCopyPreview} mainImagePath={mainImagePath} />
      )}
      {showServerModal && showLogsModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--modal-backdrop)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: 16, zIndex: 99998, backdropFilter: 'var(--modal-backdrop-blur)',
          overflowX: 'auto',
        }}>
          <ServerModal onClose={() => setShowServerModal(false)} inlineMode />
          <LogsModal onClose={() => setShowLogsModal(false)} inlineMode />
        </div>
      )}
      {showLogsModal && !showServerModal && (
        <LogsModal onClose={() => setShowLogsModal(false)} />
      )}

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
    </EnrichmentProvider>
  );
}

function AppWithAuth() {
  const { user, loading } = useAuth();
  const needAuth = loading || !user;
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
