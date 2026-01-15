import React, {useState, useEffect} from 'react';
import { AppProvider, useApp } from './state/appContext';
import { ToastProvider, useToast } from './components/ToastProvider';
import PublicationType from './components/PublicationType';
import LogsModal from './components/LogsModal';
import ContentEditor from './components/ContentEditor';
import Preview from './components/Preview';
import TemplatesModal from './components/TemplatesModal';
import TagsModal from './components/TagsModal';
import ConfigModal from './components/ConfigModal';
import InstructionsManagerModal from './components/InstructionsManagerModal';
import TraductorsModal from './components/TraductorsModal';
import HistoryModal from './components/HistoryModal';
import StatsModal from './components/StatsModal';
import ApiStatusBadge from './components/ApiStatusBadge';
import ShortcutsHelpModal from './components/ShortcutsHelpModal';
import { useConfirm } from './hooks/useConfirm';

function AppContentInner() {
  // A. On extrait UNIQUEMENT ce qui existe dans appContext.tsx
  const { 
    preview, 
    uploadedImages, 
    allVarsConfig, 
    setInput,
    apiStatus,
    setApiStatus
  } = useApp();

  const { showToast } = useToast();
  const { confirm } = useConfirm();
  
  // B. On garde tes états LOCAUX (ils sont bien ici)
  const [openTemplates, setOpenTemplates] = useState(false);
  const [openTags, setOpenTags] = useState(false);
  const [openConfig, setOpenConfig] = useState(false);
  const [openInstructions, setOpenInstructions] = useState(false);
  const [openTraductors, setOpenTraductors] = useState(false);
  const [openHistory, setOpenHistory] = useState(false); // <--- openHistory est ICI
  const [openStats, setOpenStats] = useState(false);
  const [openShortcutsHelp, setOpenShortcutsHelp] = useState(false);
  const [openLogs, setOpenLogs] = useState(false);
  const [previewMode, setPreviewMode] = useState<'raw' | 'styled'>('raw');

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

  const handleCopyPreview = async () => {
    try { 
      await navigator.clipboard.writeText(preview); 
      showToast('Preview copié dans le presse-papier', 'success');
    } catch(e){ 
      showToast('Erreur lors de la copie: ' + e, 'error');
    }
  };

  const handleResetFields = async () => {
    const ok = await confirm({
      title: 'Réinitialiser tous les champs',
      message: 'Voulez-vous vraiment vider tous les champs (variables, tags, images) ? Cette action est irréversible.',
      confirmText: 'Réinitialiser',
      type: 'danger'
    });
    
    if (!ok) return;

    // Reset toutes les variables
    allVarsConfig.forEach(v => setInput(v.name, ''));
    showToast('Tous les champs ont été réinitialisés', 'info');
  };

  const mainImagePath = uploadedImages.find(img => img.isMain)?.path;

  return (
    <AppProvider>
      <ToastProvider>
        <div className="app">
          <header className="app-header">
            <h1 style={{textAlign: 'center', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8}}>
              <span style={{fontSize: 24, fontFamily: 'Noto Color Emoji, Segoe UI Emoji, Apple Color Emoji'}}>🇫🇷</span>
              Générateur de publication
            </h1>
            <div style={{marginTop: 12}}>
              <h3 style={{margin: 0, marginBottom: 8, fontSize: 14, color: 'var(--muted)'}}>Configurations globale</h3>
              <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
                <button onClick={()=>setOpenTemplates(true)}>📁 Gérer les Templates</button>
                <button onClick={()=>setOpenTags(true)}>🏷️ Gérer les Tags</button>
                <button onClick={()=>setOpenTraductors(true)}>👥 Gérer les Traducteurs</button>
                <button onClick={()=>setOpenInstructions(true)}>📋 Gérer les Instructions</button>
                <button onClick={()=>setOpenHistory(true)}>📋 Historique</button>
                <button onClick={()=>setOpenStats(true)}>📈 Statistiques</button>
                <button onClick={()=>setOpenConfig(true)}>⚙️ Configuration API</button>
                <button onClick={()=>setOpenLogs(true)}>📝 Voir les logs</button>
                <ApiStatusBadge />
                <button 
                  onClick={() => setOpenShortcutsHelp(true)}
                  style={{
                    marginLeft: 'auto',
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
              </div>
            </div>
          </header>
          <main className="app-grid">
            <section className="editor">
              <PublicationType />
              <ContentEditor />
            </section>
            <Preview
              preview={preview}
              previewMode={previewMode}
              setPreviewMode={setPreviewMode}
              onCopy={handleCopyPreview}
              onReset={handleResetFields}
              mainImagePath={mainImagePath}
            />
          </main>

          {openTemplates && <TemplatesModal onClose={()=>setOpenTemplates(false)} />}
          {openTags && <TagsModal onClose={()=>setOpenTags(false)} />}
          {openConfig && <ConfigModal onClose={()=>setOpenConfig(false)} />}
          {openInstructions && <InstructionsManagerModal onClose={()=>setOpenInstructions(false)} />}
          {openTraductors && <TraductorsModal onClose={()=>setOpenTraductors(false)} />}
          {openHistory && <HistoryModal onClose={()=>setOpenHistory(false)} />}
          {openStats && <StatsModal onClose={()=>setOpenStats(false)} />}
          {openShortcutsHelp && <ShortcutsHelpModal onClose={()=>setOpenShortcutsHelp(false)} />}
          {openLogs && <LogsModal onClose={()=>setOpenLogs(false)} />}
        </div>
      </ToastProvider>
    </AppProvider>
  );
}

export default function App(){
  return (
    <AppProvider>
      <ToastProvider>
        <AppContentInner />
      </ToastProvider>
    </AppProvider>
  );
}
