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

  // 🆕 Index du template actuellement sélectionné/édité
  const [selectedTemplateIdx, setSelectedTemplateIdx] = useState(0);

  // 🆕 Nom du nouveau template (pour création)
  const [newTemplateName, setNewTemplateName] = useState('');

  const handleCancelAndClose = () => {
    if (templates.length > 0) {
      setFormContent(templates[selectedTemplateIdx]?.content || '');
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

  // Charger le contenu du template sélectionné
  useEffect(() => {
    if (templates.length > 0 && templates[selectedTemplateIdx]) {
      setFormContent(templates[selectedTemplateIdx].content);
    }
  }, [templates, selectedTemplateIdx]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveAndClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formContent, templates, selectedTemplateIdx]);

  // 🆕 Créer un nouveau template
  function createNewTemplate() {
    if (!newTemplateName.trim()) {
      showToast('Veuillez entrer un nom pour le template', 'warning');
      return;
    }

    const existingNames = templates.map(t => t.name.toLowerCase());
    if (existingNames.includes(newTemplateName.trim().toLowerCase())) {
      showToast('Un template avec ce nom existe déjà', 'warning');
      return;
    }

    const newTemplate = {
      id: `template_${Date.now()}`,
      name: newTemplateName.trim(),
      content: '# Nouveau template\n\nContenu du template...',
      type: 'my',
      modifiedAt: Date.now(),
      isDefault: false
    };

    // Ajouter le nouveau template
    const updatedTemplates = [...templates, newTemplate];
    importFullConfig({ templates: updatedTemplates });

    // Sélectionner le nouveau template
    setSelectedTemplateIdx(updatedTemplates.length - 1);
    setNewTemplateName('');
    showToast('Nouveau template créé', 'success');
  }

  // 🆕 Supprimer un template
  async function deleteTemplate(idx: number) {
    if (templates[idx]?.isDefault) {
      showToast('Impossible de supprimer le template par défaut', 'error');
      return;
    }

    const ok = await confirm({
      title: 'Supprimer le template',
      message: `Voulez-vous vraiment supprimer le template "${templates[idx]?.name}" ?`,
      confirmText: 'Supprimer',
      type: 'danger'
    });

    if (!ok) return;

    const updatedTemplates = templates.filter((_, i) => i !== idx);
    importFullConfig({ templates: updatedTemplates });

    // Si on supprime le template sélectionné, revenir au premier
    if (selectedTemplateIdx >= updatedTemplates.length) {
      setSelectedTemplateIdx(0);
    } else if (selectedTemplateIdx === idx) {
      setSelectedTemplateIdx(0);
    }

    showToast('Template supprimé', 'success');
  }

  function saveAndClose() {
    if (templates.length === 0) {
      showToast('Aucun template à modifier', 'error');
      return;
    }

    const currentTemplate = templates[selectedTemplateIdx];
    if (!currentTemplate) {
      showToast('Template introuvable', 'error');
      return;
    }

    const payload = {
      ...currentTemplate,
      content: formContent,
      modifiedAt: Date.now()
    };

    updateTemplate(selectedTemplateIdx, payload);
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
          setSelectedTemplateIdx(0);
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
      setSelectedTemplateIdx(0);
      showToast('Template par défaut restauré', 'success');
    }
  }

  const visibleVars = allVarsConfig;
  const customVars = allVarsConfig.map((v, idx) => ({ v, idx })).filter(({ v }) => v.isCustom);

  // Template sélectionné
  const currentTemplate = templates[selectedTemplateIdx];

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
          <h3 style={{ margin: 0 }}>📄 Gestion des templates & variables</h3>
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
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600
              }}
            >
              ↩️ Fermer
            </button>
          </div>
        </div>

        {/* 🆕 Section : Mes templates */}
        <div style={{
          marginTop: 16,
          padding: 16,
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h4 style={{ margin: 0, fontSize: 15, color: 'var(--text)' }}>
              📚 Mes templates ({templates.length})
            </h4>
          </div>

          {/* Grille de sélection des templates */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 8,
            marginBottom: 12
          }}>
            {templates.map((template, idx) => (
              <button
                key={template.id || idx}
                type="button"
                onClick={() => setSelectedTemplateIdx(idx)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: selectedTemplateIdx === idx ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: selectedTemplateIdx === idx ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                  color: selectedTemplateIdx === idx ? '#fff' : 'var(--text)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: selectedTemplateIdx === idx ? 700 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  transition: 'all 0.2s'
                }}
              >
                <span style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  textAlign: 'left'
                }}>
                  {template.isDefault ? '⭐ ' : ''}{template.name || `Template ${idx + 1}`}
                </span>
                {!template.isDefault && selectedTemplateIdx === idx && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTemplate(idx);
                    }}
                    style={{
                      padding: '2px 6px',
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      borderRadius: 4,
                      color: '#ef4444',
                      fontSize: 11,
                      cursor: 'pointer'
                    }}
                    title="Supprimer ce template"
                  >
                    🗑️
                  </button>
                )}
              </button>
            ))}
          </div>

          {/* Création d'un nouveau template */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="Nom du nouveau template..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  createNewTemplate();
                }
              }}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 13,
                color: 'var(--text)'
              }}
            />
            <button
              type="button"
              onClick={createNewTemplate}
              style={{
                padding: '8px 16px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              ➕ Créer
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
                📄 Template : {currentTemplate?.name || 'Sans nom'}
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
              {currentTemplate?.isDefault && (
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
              )}
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
