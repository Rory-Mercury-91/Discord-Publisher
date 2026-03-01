import { useEffect, useRef, useState } from 'react';
import { useConfirm } from '../../hooks/useConfirm';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';
import { useApp } from '../../state/appContext';
import type { Template, VarConfig } from '../../state/types';
import ConfirmModal from '../Modals/ConfirmModal';
import { useToast } from '../shared/ToastProvider';
import TemplatesModalFooter from './components/TemplatesModalFooter';
import TemplatesModalHeader from './components/TemplatesModalHeader';
import TemplateVarChips from './components/TemplateVarChips';
import TemplatesListSection from './components/TemplatesListSection';
import TemplatesVarsColumn from './components/TemplatesVarsColumn';
import MarkdownHelpModal from './MarkdownHelpModal';

export default function TemplatesModal({ onClose }: { onClose?: () => void }) {
  const {
    templates,
    updateTemplate,
    restoreDefaultTemplates,
    allVarsConfig,
    importFullConfig,
    addVarConfig,
    updateVarConfig,
    deleteVarConfig,
  } = useApp();
  const { showToast } = useToast();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  const [selectedTemplateIdx, setSelectedTemplateIdx] = useState(0);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [formContent, setFormContent] = useState('');
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [editingVarIdx, setEditingVarIdx] = useState<number | null>(null);
  const [varForm, setVarForm] = useState({ name: '', label: '', type: 'text' as 'text' | 'textarea' });
  const [showMarkdownHelp, setShowMarkdownHelp] = useState(false);

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleCancelAndClose = () => {
    if (templates.length > 0) {
      setFormContent(templates[selectedTemplateIdx]?.content ?? '');
    }
    cancelVarEdit();
    onClose?.();
  };

  useEscapeKey(handleCancelAndClose, true);
  useModalScrollLock();

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
    const newTemplate: Template = {
      id: `template_${Date.now()}`,
      name: newTemplateName.trim(),
      content: '# Nouveau template\n\nContenu du template...',
      type: 'my',
      modifiedAt: Date.now(),
      isDefault: false,
    };
    const updatedTemplates = [...templates, newTemplate];
    importFullConfig({ templates: updatedTemplates });
    setSelectedTemplateIdx(updatedTemplates.length - 1);
    setNewTemplateName('');
    showToast('Nouveau template créé', 'success');
  }

  async function deleteTemplate(idx: number) {
    if (templates[idx]?.isDefault) {
      showToast('Impossible de supprimer le template par défaut', 'error');
      return;
    }
    const ok = await confirm({
      title: 'Supprimer le template',
      message: `Voulez-vous vraiment supprimer le template "${templates[idx]?.name}" ?`,
      confirmText: 'Supprimer',
      type: 'danger',
    });
    if (!ok) return;
    const updatedTemplates = templates.filter((_, i) => i !== idx);
    importFullConfig({ templates: updatedTemplates });
    if (selectedTemplateIdx >= updatedTemplates.length || selectedTemplateIdx === idx) {
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
    const payload = { ...currentTemplate, content: formContent, modifiedAt: Date.now() };
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
    } catch {
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
    const varConfig: VarConfig = {
      name: varForm.name,
      label: varForm.label,
      type: varForm.type,
      templates: undefined,
      isCustom: true,
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
      type: 'danger',
    });
    if (!ok) return;
    deleteVarConfig(idx);
    if (editingVarIdx === idx) cancelVarEdit();
    showToast('Variable supprimée', 'success');
  }

  function exportTemplateLocal() {
    try {
      const data = {
        templates,
        allVarsConfig,
        exportDate: new Date().toISOString(),
        version: '1.0',
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
      showToast((e as Error)?.message ?? 'Erreur export', 'error');
    }
  }

  function importTemplateLocal(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object') throw new Error('Fichier invalide');
        const payload: { templates?: Template[]; allVarsConfig?: VarConfig[] } = {};
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
        showToast((e as Error)?.message ?? 'Fichier invalide', 'error');
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function handleRestore() {
    const ok = await confirm({
      title: 'Restaurer le template par défaut',
      message: 'Voulez-vous vraiment restaurer le template par défaut ? Le contenu actuel sera remplacé.',
      confirmText: 'Restaurer',
      type: 'warning',
    });
    if (ok) {
      restoreDefaultTemplates();
      setSelectedTemplateIdx(0);
      showToast('Template par défaut restauré', 'success');
    }
  }

  const customVars = allVarsConfig.map((v, idx) => ({ v, idx })).filter(({ v }) => v.isCustom);
  const currentTemplate = templates[selectedTemplateIdx];

  return (
    <div className="modal">
      <div className="panel templates-panel" onClick={e => e.stopPropagation()}>
        <TemplatesModalHeader
          onExport={exportTemplateLocal}
          onClose={onClose ?? (() => {})}
          importInputRef={importInputRef}
        />
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          className="input--hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) {
              importTemplateLocal(f);
              e.target.value = '';
            }
          }}
        />

        <TemplatesListSection
          templates={templates}
          selectedTemplateIdx={selectedTemplateIdx}
          onSelect={setSelectedTemplateIdx}
          newTemplateName={newTemplateName}
          setNewTemplateName={setNewTemplateName}
          onCreate={createNewTemplate}
          onDelete={deleteTemplate}
        />

        <div className="templates-layout">
          <div className="templates-editor-column">
            <div className="templates-editor-header">
              <h4 className="templates-editor-title">
                📄 Template : {currentTemplate?.name ?? 'Sans nom'}
                <button
                  type="button"
                  className="templates-btn-help"
                  onClick={() => setShowMarkdownHelp(true)}
                  title="Aide Markdown"
                >
                  ?
                </button>
              </h4>
              {currentTemplate?.isDefault && (
                <button type="button" className="templates-btn-restore" onClick={handleRestore} title="Restaurer le template par défaut">
                  🔄 Restaurer
                </button>
              )}
            </div>
            <div className="templates-editor-body">
              <textarea
                ref={contentRef}
                placeholder="Contenu du template..."
                value={formContent}
                onChange={e => setFormContent(e.target.value)}
                className="styled-scrollbar"
                spellCheck
                lang="fr-FR"
              />
            </div>
            <TemplateVarChips vars={allVarsConfig} copiedVar={copiedVar} onCopy={copyVarToClipboard} />
          </div>

          <TemplatesVarsColumn
            customVars={customVars}
            editingVarIdx={editingVarIdx}
            varForm={varForm}
            setVarForm={setVarForm}
            onStartEdit={startVarEdit}
            onCancelEdit={cancelVarEdit}
            onSaveVar={saveVar}
            onDeleteVar={handleDeleteVar}
            onAddNew={() => {
              setEditingVarIdx(null);
              setVarForm({ name: '', label: '', type: 'text' });
            }}
          />
        </div>

        <TemplatesModalFooter onCancel={handleCancelAndClose} onSave={saveAndClose} />
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
