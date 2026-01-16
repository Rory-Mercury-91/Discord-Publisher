import { useEffect, useState } from 'react';
import ApiStatusBadge from './components/ApiStatusBadge';
import ConfigModal from './components/ConfigModal';
import ContentEditor from './components/ContentEditor';
import HistoryModal from './components/HistoryModal';
import InstructionsManagerModal from './components/InstructionsManagerModal';
import Preview from './components/Preview';
import PublicationType from './components/PublicationType';
import ShortcutsHelpModal from './components/ShortcutsHelpModal';
import StatsModal from './components/StatsModal';
import TagsModal from './components/TagsModal';
import TemplatesModal from './components/TemplatesModal';
import { ToastProvider, useToast } from './components/ToastProvider';
import TraductorsModal from './components/TraductorsModal';
import { AppProvider, useApp } from './state/appContext';

function AppContentInner() {
  const {
    apiStatus,
    setApiStatus,
    preview,
    inputs,
    uploadedImages,
    allVarsConfig,
    setInput,
    postTitle,
    setPostTitle,
    postTags,
    setPostTags,
    removeImage
  } = useApp();

  const { showToast } = useToast();
  const [previewMode, setPreviewMode] = useState<'raw' | 'styled'>('raw');

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
    // Reset toutes les variables
    allVarsConfig.forEach(v => setInput(v.name, ''));
    // Reset instruction
    setInput('instruction', '');
    // Reset titre et tags
    setPostTitle('');
    setPostTags('');
    // Reset images (supprimer toutes)
    while (uploadedImages.length > 0) {
      removeImage(0);
    }
    showToast('Tous les champs ont été réinitialisés', 'success');
  };

  const mainImagePath = uploadedImages.find(img => img.isMain)?.path;

  // B. On garde tes états LOCAUX (ils sont bien ici)
  const [openTemplates, setOpenTemplates] = useState(false);
  const [openTags, setOpenTags] = useState(false);
  const [openConfig, setOpenConfig] = useState(false);
  const [openInstructions, setOpenInstructions] = useState(false);
  const [openTraductors, setOpenTraductors] = useState(false);
  const [openHistory, setOpenHistory] = useState(false);
  const [openStats, setOpenStats] = useState(false);
  const [openShortcutsHelp, setOpenShortcutsHelp] = useState(false);

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
    const fetchStatus = async () => {
      const storedUrl = localStorage.getItem('apiUrl');
      if (!storedUrl) {
        setApiStatus('disconnected');
        return;
      }
      try {
        const cleanUrl = storedUrl.endsWith('/') ? storedUrl.slice(0, -1) : storedUrl;
        const response = await fetch(`${cleanUrl}/api/status`);
        if (!response.ok) throw new Error();
        const data = await response.json();
        setApiStatus(data);
      } catch (err) {
        setApiStatus('disconnected');
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [setApiStatus]);


  return (
    <div className="app">
          <header className="app-header">
            <h1 style={{ textAlign: 'center', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ fontSize: 24, fontFamily: 'Noto Color Emoji, Segoe UI Emoji, Apple Color Emoji' }}>🇫🇷</span>
              Générateur de publication
            </h1>
            <div style={{ marginTop: 12 }}>
              <h3 style={{ margin: 0, marginBottom: 8, fontSize: 14, color: 'var(--muted)' }}>Configurations globale</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => setOpenTemplates(true)}>📁 Gérer les Templates</button>
                <button onClick={() => setOpenTags(true)}>🏷️ Gérer les Tags</button>
                <button onClick={() => setOpenTraductors(true)}>👥 Gérer les Traducteurs</button>
                <button onClick={() => setOpenInstructions(true)}>📋 Gérer les Instructions</button>
                <button onClick={() => setOpenHistory(true)}>📜 Historique</button>
                <button onClick={() => setOpenStats(true)}>📈 Statistiques</button>
                <button onClick={() => setOpenConfig(true)}>⚙️ Configuration API</button>
                {/* Place ApiStatusBadge juste avant le bouton "?" */}
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ApiStatusBadge />
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
          <main style={{
            display: 'flex',
            gap: 0,
            flex: 1,
            overflow: 'hidden',
            minHeight: 0
          }}>
            {/* Colonne Éditeur - 60% */}
            <section className="editor" style={{
              flex: '0 0 60%',
              overflowY: 'auto',
              padding: '16px',
              borderRight: '1px solid var(--border)'
            }}>
              <PublicationType />
              <ContentEditor />
            </section>

            {/* Colonne Preview - 40% */}
            <section className="preview-column" style={{
              flex: '0 0 40%',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              overflow: 'hidden',
              background: 'var(--bg)',
              padding: '16px',
              borderLeft: '1px solid var(--border)'
            }}>
              <Preview
                preview={preview || ''}
                previewMode={previewMode}
                setPreviewMode={setPreviewMode}
                onCopy={handleCopyPreview}
                onReset={handleResetFields}
                mainImagePath={mainImagePath}
              />
            </section>
          </main>

          {openTemplates && <TemplatesModal onClose={() => setOpenTemplates(false)} />}
          {openTags && <TagsModal onClose={() => setOpenTags(false)} />}
          {openConfig && <ConfigModal onClose={() => setOpenConfig(false)} />}
          {openInstructions && <InstructionsManagerModal onClose={() => setOpenInstructions(false)} />}
          {openTraductors && <TraductorsModal onClose={() => setOpenTraductors(false)} />}
          {openHistory && <HistoryModal onClose={() => setOpenHistory(false)} />}
          {openStats && <StatsModal onClose={() => setOpenStats(false)} />}
          {openShortcutsHelp && <ShortcutsHelpModal onClose={() => setOpenShortcutsHelp(false)} />}
          {/* Removed LogsModal – log display is no longer supported */}
        </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <AppContentInner />
      </ToastProvider>
    </AppProvider>
  );
}
