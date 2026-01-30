import { useEffect, useRef, useState } from 'react';
import { useConfirm } from '../hooks/useConfirm';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { useApp } from '../state/appContext';
import ConfirmModal from './ConfirmModal';
import MarkdownHelpModal from './MarkdownHelpModal';
import { useToast } from './ToastProvider';

export default function TemplatesModal({ onClose }: { onClose?: () => void }) {
  const { templates, updateTemplate, restoreDefaultTemplates, allVarsConfig, importFullConfig, addVarConfig, updateVarConfig, deleteVarConfig } = useApp();
  const { showToast } = useToast();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  const handleCancelAndClose = () => {
    if (templates.length > 0) {
      setFormContent(templates[0].content);
    }
    cancelVarEdit();
    onClose?.();
  };

  useEscapeKey(handleCancelAndClose, true);
  useModalScrollLock();

  const [formContent, setFormContent] = useState('');
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [editingVarIdx, setEditingVarIdx] = useState<number | null>(null);
  const [varForm, setVarForm] = useState({ name: '', label: '', type: 'text' as 'text' | 'textarea' });
  const [showMarkdownHelp, setShowMarkdownHelp] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (templates.length > 0) {
      setFormContent(templates[0].content);
    }
  }, [templates]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveAndClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formContent, templates]);

  function saveAndClose() {
    if (templates.length === 0) {
      showToast('Aucun template à modifier', 'error');
      return;
    }
    const currentTemplate = templates[0];
    const payload = {
      ...currentTemplate,
      content: formContent,
      modifiedAt: Date.now()
    };
    updateTemplate(0, payload);
    showToast('Template enregistré', 'success');
    onClose?.();
  }

  async function copyVarToClipboard(varName: string) {
    const textToCopy = `[${varName}]`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedVar(varName);
      setTimeout(() => setCopiedVar(null), 2000);
      showToast('Variable copiée', 'success', 2000);
    } catch (e) {
      showToast('Erreur lors de la copie', 'error');
    }
  }

  function startVarEdit(idx: number) {
    const v = allVarsConfig[idx];
    const t = v.type === 'text' || v.type === 'textarea' ? v.type : 'text';
    setVarForm({ name: v.name, label: v.label, type: t });
    setEditingVarIdx(idx);
  }

  function cancelVarEdit() {
    setVarForm({ name: '', label: '', type: 'text' });
    setEditingVarIdx(null);
  }

  function saveVar() {
    if (!varForm.name.trim() || !varForm.label.trim()) {
      showToast('Le nom et le label sont requis', 'warning');
      return;
    }
    const existingIdx = allVarsConfig.findIndex((v, i) => v.name === varForm.name && i !== editingVarIdx);
    if (existingIdx !== -1) {
      showToast('Une variable avec ce nom existe déjà', 'warning');
      return;
    }
    const varConfig = {
      name: varForm.name,
      label: varForm.label,
      type: varForm.type,
      templates: undefined,
      isCustom: true
    };
    if (editingVarIdx !== null) {
      updateVarConfig(editingVarIdx, varConfig);
    } else {
      addVarConfig(varConfig);
    }
    cancelVarEdit();
    showToast(editingVarIdx !== null ? 'Variable modifiée' : 'Variable ajoutée', 'success');
  }

  async function handleDeleteVar(idx: number) {
    const ok = await confirm({
      title: 'Supprimer la variable',
      message: 'Voulez-vous vraiment supprimer cette variable ?',
      confirmText: 'Supprimer',
      type: 'danger'
    });
    if (!ok) return;
    deleteVarConfig(idx);
    if (editingVarIdx === idx) cancelVarEdit();
    showToast('Variable supprimée', 'success');
  }

  function exportTemplateLocal() {
    try {
      const data = {
        templates: templates,
        allVarsConfig,
        exportDate: new Date().toISOString(),
        version: '1.0'
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `template_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Template exporté', 'success');
    } catch (e: unknown) {
      showToast((e as Error)?.message || 'Erreur export', 'error');
    }
  }

  function importTemplateLocal(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object') throw new Error('Fichier invalide');
        const payload: { templates?: typeof templates; allVarsConfig?: typeof allVarsConfig } = {};
        if (Array.isArray(data.templates)) payload.templates = data.templates;
        if (Array.isArray(data.allVarsConfig)) payload.allVarsConfig = data.allVarsConfig;
        if (Object.keys(payload).length === 0) {
          showToast('Aucun template ou variable dans le fichier', 'warning');
          return;
        }
        importFullConfig(payload);
        showToast('Template importé', 'success');
        if (Array.isArray(data.templates) && data.templates.length > 0) {
          setFormContent(data.templates[0].content ?? '');
        }
      } catch (e: unknown) {
        showToast((e as Error)?.message || 'Fichier invalide', 'error');
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function handleRestore() {
    const ok = await confirm({
      title: 'Restaurer le template par défaut',
      message: 'Voulez-vous vraiment restaurer le template par défaut ? Le contenu actuel sera remplacé.',
      confirmText: 'Restaurer',
      type: 'warning'
    });
    if (ok) {
      restoreDefaultTemplates();
      showToast('Template par défaut restauré', 'success');
      // Le useEffect([templates]) mettra à jour formContent au prochain rendu
    }
  }

  const visibleVars = allVarsConfig;
  const customVars = allVarsConfig.map((v, idx) => ({ v, idx })).filter(({ v }) => v.isCustom);

  return (
    <div className="modal">
      <div className="panel" onClick={e => e.stopPropagation()} style={{
        maxWidth: 1200,
        width: '95%',
        minHeight: '78vh',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header : titre + Exporter / Importer + fermer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 0,
          paddingBottom: 16,
          paddingTop: 4,
          borderBottom: '2px solid var(--border)'
        }}>
          <h3 style={{ margin: 0 }}>📄 Gestion du template & variables</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={exportTemplateLocal}
              style={{ fontSize: 12, padding: '6px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border)', borderRadius: 6 }}
              title="Exporter le template et les variables en JSON"
            >
              📤 Exporter
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              style={{ fontSize: 12, padding: '6px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border)', borderRadius: 6 }}
              title="Importer un fichier JSON (template + variables)"
            >
              📥 Importer
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) {
                  importTemplateLocal(f);
                  e.target.value = '';
                }
              }}
            />
            <button
              onClick={onClose}
              style={{
                fontSize: 18,
                padding: '4px 10px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--muted)',
                cursor: 'pointer',
                lineHeight: 1
              }}
              title="Fermer (Échap)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Deux colonnes : gauche (Template) | droite (Variables) */}
        <div style={{ display: 'flex', gap: 20, flex: 1, minHeight: 0, overflow: 'hidden', paddingTop: 24 }}>
          {/* Partie gauche : Template */}
          <div style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--border)',
            paddingRight: 20
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                📄 Template
                <button
                  type="button"
                  onClick={() => setShowMarkdownHelp(true)}
                  style={{
                    background: 'rgba(74, 158, 255, 0.15)',
                    border: '1px solid rgba(74, 158, 255, 0.3)',
                    borderRadius: '50%',
                    width: 22,
                    height: 22,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: 12,
                    padding: 0,
                    color: 'var(--text)'
                  }}
                  title="Aide Markdown"
                >
                  ?
                </button>
              </h4>
              <button
                type="button"
                onClick={handleRestore}
                style={{
                  fontSize: 12,
                  padding: '6px 12px',
                  background: 'rgba(74, 158, 255, 0.2)',
                  border: '1px solid rgba(74, 158, 255, 0.4)',
                  borderRadius: 6,
                  color: 'var(--text)',
                  cursor: 'pointer'
                }}
                title="Restaurer le template par défaut"
              >
                🔄 Restaurer
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 120, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <textarea
                ref={contentRef}
                placeholder="Contenu du template..."
                value={formContent}
                onChange={e => setFormContent(e.target.value)}
                style={{
                  width: '100%',
                  flex: 1,
                  minHeight: 180,
                  fontFamily: 'monospace',
                  resize: 'none',
                  fontSize: 13,
                  overflowY: 'auto'
                }}
                className="styled-scrollbar"
                spellCheck={true}
                lang="fr-FR"
              />
            </div>
            {visibleVars.length > 0 && (
              <div style={{
                marginTop: 12,
                padding: 10,
                backgroundColor: 'rgba(74, 158, 255, 0.08)',
                border: '1px solid rgba(74, 158, 255, 0.25)',
                borderRadius: 6
              }}>
                <div style={{ fontSize: 11, color: '#4a9eff', marginBottom: 6, fontWeight: 600 }}>
                  💡 Variables (cliquez pour copier)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 72, overflowY: 'auto' }} className="styled-scrollbar">
                  {visibleVars.map((v, idx) => (
                    <span
                      key={idx}
                      onClick={() => copyVarToClipboard(v.name)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '3px 8px',
                        backgroundColor: copiedVar === v.name ? '#4ade80' : 'rgba(0,0,0,0.3)',
                        border: `1px solid ${copiedVar === v.name ? '#4ade80' : '#444'}`,
                        borderRadius: 4,
                        fontSize: 11,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        color: copiedVar === v.name ? '#000' : '#fff',
                        fontFamily: 'monospace',
                        fontWeight: 500
                      }}
                      title={v.label}
                    >
                      {copiedVar === v.name && <span style={{ marginRight: 4 }}>✓</span>}
                      [{v.name}]
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Partie droite : Variables personnalisées */}
          <div style={{
            flex: 1,
            minWidth: 280,
            maxWidth: 420,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: 15 }}>
              🔧 Variables personnalisées
            </h4>
            <div style={{ marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => { setEditingVarIdx(null); setVarForm({ name: '', label: '', type: 'text' }); }}
                style={{ fontSize: 12, padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer' }}
              >
                ➕ Ajouter une variable
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }} className="styled-scrollbar">
              {customVars.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>
                    Variables existantes
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {customVars.map(({ v, idx }) => (
                      <div
                        key={idx}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: editingVarIdx === idx ? '1fr' : '1fr auto auto',
                          gap: 6,
                          alignItems: 'center',
                          padding: 8,
                          background: editingVarIdx === idx ? 'rgba(74, 158, 255, 0.15)' : 'rgba(255,255,255,0.03)',
                          borderRadius: 6,
                          border: '1px solid rgba(255,255,255,0.1)'
                        }}
                      >
                        {editingVarIdx === idx ? (
                          <div style={{ fontSize: 11, color: '#4a9eff', fontWeight: 600 }}>
                            ✏️ En édition
                          </div>
                        ) : (
                          <>
                            <div style={{ minWidth: 0 }}>
                              <strong style={{ fontSize: 12, fontFamily: 'monospace' }}>[{v.name}]</strong>
                              <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
                                {v.label}
                              </div>
                            </div>
                            <button
                              onClick={() => startVarEdit(idx)}
                              style={{ fontSize: 11, padding: '4px 8px' }}
                              title="Éditer"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDeleteVar(idx)}
                              style={{ fontSize: 11, padding: '4px 8px' }}
                              title="Supprimer"
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{
                borderTop: customVars.length > 0 ? '1px solid var(--border)' : 'none',
                paddingTop: customVars.length > 0 ? 12 : 0
              }}>
                <h5 style={{ margin: '0 0 8px 0', fontSize: 12, fontWeight: 600 }}>
                  {editingVarIdx !== null ? '✏️ Modifier la variable' : '➕ Ajouter une variable'}
                </h5>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                      Nom *
                    </label>
                    <input
                      placeholder="ex: ma_var"
                      value={varForm.name}
                      onChange={e => setVarForm({ ...varForm, name: e.target.value })}
                      style={{ width: '100%', fontSize: 12, padding: '6px 8px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                      Label *
                    </label>
                    <input
                      placeholder="ex: Ma variable"
                      value={varForm.label}
                      onChange={e => setVarForm({ ...varForm, label: e.target.value })}
                      style={{ width: '100%', fontSize: 12, padding: '6px 8px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                      Type
                    </label>
                    <select
                      value={varForm.type}
                      onChange={e => setVarForm({ ...varForm, type: e.target.value as 'text' | 'textarea' })}
                      style={{
                        width: '100%',
                        fontSize: 12,
                        padding: '6px 8px',
                        background: 'var(--panel)',
                        color: 'var(--text)',
                        border: '1px solid var(--border)'
                      }}
                    >
                      <option value="text">Texte</option>
                      <option value="textarea">Textarea</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                    {editingVarIdx !== null && (
                      <button onClick={cancelVarEdit} style={{ fontSize: 12, padding: '6px 12px' }}>
                        ❌ Annuler
                      </button>
                    )}
                    <button onClick={saveVar} style={{ fontSize: 12, padding: '6px 12px', background: 'var(--accent)' }}>
                      {editingVarIdx !== null ? '✅ Enregistrer' : '➕ Ajouter'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer : Annuler et Enregistrer à droite */}
        <div style={{
          marginTop: 16,
          paddingTop: 16,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8
        }}>
          <button onClick={handleCancelAndClose} style={{ padding: '8px 14px' }}>
            ❌ Annuler
          </button>
          <button
            onClick={saveAndClose}
            style={{ padding: '8px 14px', background: 'var(--accent)', fontWeight: 600 }}
          >
            ✅ Enregistrer
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        type={confirmState.type}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />

      {showMarkdownHelp && <MarkdownHelpModal onClose={() => setShowMarkdownHelp(false)} />}
    </div>
  );
}
