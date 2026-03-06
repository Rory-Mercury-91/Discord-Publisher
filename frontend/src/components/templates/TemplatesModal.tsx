import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { useConfirm } from '../../hooks/useConfirm';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';
import { useApp } from '../../state/appContext';
import { useAuth } from '../../state/authContext';
import { parseSavedTemplatesValue } from '../../state/hooks/useTemplatesVarsInputs';
import type { Template, VarConfig } from '../../state/types';
import ConfirmModal from '../Modals/ConfirmModal';
import { useToast } from '../shared/ToastProvider';
import TemplatesModalFooter from './components/TemplatesModalFooter';
import TemplatesModalHeader from './components/TemplatesModalHeader';
import TemplateVarChips from './components/TemplateVarChips';
import TemplatesListSection from './components/TemplatesListSection';
import TemplatesVarsColumn from './components/TemplatesVarsColumn';
import MarkdownHelpModal from './MarkdownHelpModal';

type TemplateOwnerOption = { id: string; label: string };

export default function TemplatesModal({ onClose }: { onClose?: () => void }) {
  const { profile } = useAuth();
  const {
    templates,
    updateTemplate,
    restoreDefaultTemplates,
    allVarsConfig,
    importFullConfig,
    addVarConfig,
    updateVarConfig,
    deleteVarConfig,
    syncTemplatesForOwnerToSupabase,
  } = useApp();
  const { showToast } = useToast();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  const isMasterAdmin = profile?.is_master_admin === true;
  const [templateOwnerOptions, setTemplateOwnerOptions] = useState<TemplateOwnerOption[]>([]);
  const [selectedTemplateOwnerId, setSelectedTemplateOwnerId] = useState<string>(() => profile?.id ?? '');
  const [templatesByOwner, setTemplatesByOwner] = useState<Record<string, Template[]>>({});
  const [customVarsByOwner, setCustomVarsByOwner] = useState<Record<string, VarConfig[]>>({});

  const [selectedTemplateIdx, setSelectedTemplateIdx] = useState(0);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formName, setFormName] = useState('');
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [editingVarIdx, setEditingVarIdx] = useState<number | null>(null);
  const [varForm, setVarForm] = useState({ name: '', label: '', type: 'text' as 'text' | 'textarea' });
  const [showMarkdownHelp, setShowMarkdownHelp] = useState(false);
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false);

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const isViewingSelf = selectedTemplateOwnerId === profile?.id || !selectedTemplateOwnerId;
  const templatesToShow: Template[] = isViewingSelf
    ? templates
    : (templatesByOwner[selectedTemplateOwnerId] ?? []);

  const doClose = useCallback(() => {
    cancelVarEdit();
    onClose?.();
  }, [onClose]);

  const hasChanges = useMemo(() => {
    const t = templatesToShow[selectedTemplateIdx];
    if (!t) return false;
    const contentMatch = formContent === (t.content ?? '');
    const nameMatch = (formName || '').trim() === (t.name ?? '').trim();
    return !contentMatch || !nameMatch;
  }, [templatesToShow, selectedTemplateIdx, formContent, formName]);

  const handleEscape = useCallback(() => {
    if (hasChanges) {
      confirm({
        title: 'Quitter sans sauvegarder ?',
        message: 'Des modifications non enregistrées seront perdues.',
        confirmText: 'Quitter',
        cancelText: 'Rester',
        type: 'warning',
      }).then(ok => {
        if (ok) doClose();
      });
    } else {
      doClose();
    }
  }, [hasChanges, confirm, doClose]);

  useEscapeKey(handleEscape, true);
  useModalScrollLock();

  useEffect(() => {
    if (!profile?.id || !isMasterAdmin) return;
    const sb = getSupabase();
    if (!sb) return;
    (async () => {
      try {
        const [{ data: profilesData }, { data: templatesRows }] = await Promise.all([
          sb.from('profiles').select('id, pseudo'),
          sb.from('saved_templates').select('owner_id, value'),
        ]);
        const options: TemplateOwnerOption[] = (profilesData ?? []).map((p: { id: string; pseudo?: string }) => ({
          id: p.id,
          label: p.id === profile.id ? `Moi (${p.pseudo || '(sans nom)'})` : (p.pseudo || '(sans nom)'),
        }));
        setTemplateOwnerOptions(options);
        if (profile.id && !selectedTemplateOwnerId) setSelectedTemplateOwnerId(profile.id);

        const byOwner: Record<string, Template[]> = {};
        const varsByOwner: Record<string, VarConfig[]> = {};
        for (const row of templatesRows ?? []) {
          const ownerId = (row as { owner_id: string }).owner_id;
          const val = (row as { value: unknown }).value;
          try {
            const raw = Array.isArray(val) ? val : JSON.parse(String(val));
            const { templates: tpl, customVars: cv } = parseSavedTemplatesValue(raw);
            if (tpl.length > 0) byOwner[ownerId] = tpl;
            if (cv.length > 0) varsByOwner[ownerId] = cv;
          } catch {
            /* ignorer */
          }
        }
        setTemplatesByOwner(prev => ({ ...prev, ...byOwner }));
        setCustomVarsByOwner(prev => ({ ...prev, ...varsByOwner }));
      } catch {
        setTemplateOwnerOptions([{ id: profile.id, label: `Moi (${profile.pseudo || 'Moi'})` }]);
      }
    })();
  }, [profile?.id, profile?.pseudo, isMasterAdmin]);

  useEffect(() => {
    if (selectedTemplateOwnerId && selectedTemplateIdx >= templatesToShow.length) {
      setSelectedTemplateIdx(0);
    }
  }, [selectedTemplateOwnerId, templatesToShow.length, selectedTemplateIdx]);

  // Ne synchroniser le formulaire que lors d’un vrai changement de template (index ou id),
  // pas à chaque re-rendu, pour ne pas écraser le contenu en cours de saisie/collage.
  const currentTemplateId = templatesToShow[selectedTemplateIdx]?.id;
  useEffect(() => {
    if (templatesToShow.length > 0 && templatesToShow[selectedTemplateIdx]) {
      const tpl = templatesToShow[selectedTemplateIdx];
      setFormContent(tpl.content ?? '');
      setFormName(tpl.name ?? '');
    } else {
      setFormContent('');
      setFormName('');
    }
  }, [selectedTemplateIdx, templatesToShow.length, currentTemplateId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveAndClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formContent, templatesToShow, selectedTemplateIdx]);

  function createNewTemplate() {
    if (!newTemplateName.trim()) {
      showToast('Veuillez entrer un nom pour le template', 'warning');
      return;
    }
    const existingNames = templatesToShow.map(t => t.name.toLowerCase());
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
    if (isViewingSelf) {
      const updatedTemplates = [...templates, newTemplate];
      importFullConfig({ templates: updatedTemplates });
      setSelectedTemplateIdx(updatedTemplates.length - 1);
    } else {
      const list = [...templatesToShow, newTemplate];
      setTemplatesByOwner(prev => ({ ...prev, [selectedTemplateOwnerId]: list }));
      setSelectedTemplateIdx(list.length - 1);
      syncTemplatesForOwnerToSupabase(selectedTemplateOwnerId, list, customVarsByOwner[selectedTemplateOwnerId] ?? []).then(r => {
        if (!r.ok) showToast(r.error ?? 'Erreur enregistrement', 'error');
      });
    }
    setNewTemplateName('');
    setShowCreateTemplateModal(false);
    showToast('Nouveau template créé', 'success');
  }

  async function deleteTemplate(idx: number) {
    if (templatesToShow[idx]?.isDefault) {
      showToast('Impossible de supprimer le template par défaut', 'error');
      return;
    }
    const ok = await confirm({
      title: 'Supprimer le template',
      message: `Voulez-vous vraiment supprimer le template "${templatesToShow[idx]?.name}" ?`,
      confirmText: 'Supprimer',
      type: 'danger',
    });
    if (!ok) return;
    if (isViewingSelf) {
      const updatedTemplates = templates.filter((_, i) => i !== idx);
      importFullConfig({ templates: updatedTemplates });
      if (selectedTemplateIdx >= updatedTemplates.length || selectedTemplateIdx === idx) {
        setSelectedTemplateIdx(0);
      }
    } else {
      const updatedTemplates = templatesToShow.filter((_, i) => i !== idx);
      setTemplatesByOwner(prev => ({ ...prev, [selectedTemplateOwnerId]: updatedTemplates }));
      if (selectedTemplateIdx >= updatedTemplates.length || selectedTemplateIdx === idx) {
        setSelectedTemplateIdx(0);
      }
      const res = await syncTemplatesForOwnerToSupabase(selectedTemplateOwnerId, updatedTemplates, customVarsByOwner[selectedTemplateOwnerId] ?? []);
      if (!res.ok) showToast(res.error ?? 'Erreur suppression', 'error');
    }
    showToast('Template supprimé', 'success');
  }

  function saveAndClose() {
    if (templatesToShow.length === 0) {
      showToast('Aucun template à modifier', 'error');
      return;
    }
    const currentTemplate = templatesToShow[selectedTemplateIdx];
    if (!currentTemplate) {
      showToast('Template introuvable', 'error');
      return;
    }

    const nextName = (formName || '').trim() || currentTemplate.name || 'Template';
    const existingNames = templatesToShow
      .map((t, i) => (i === selectedTemplateIdx ? null : (t.name || '').toLowerCase()))
      .filter((n): n is string => !!n);
    if (existingNames.includes(nextName.toLowerCase())) {
      showToast('Un template avec ce nom existe déjà', 'warning');
      return;
    }

    const payload = {
      ...currentTemplate,
      name: nextName,
      content: formContent,
      modifiedAt: Date.now(),
    };
    if (isViewingSelf) {
      updateTemplate(selectedTemplateIdx, payload);
    } else {
      const updated = [...templatesToShow];
      updated[selectedTemplateIdx] = payload;
      setTemplatesByOwner(prev => ({ ...prev, [selectedTemplateOwnerId]: updated }));
      syncTemplatesForOwnerToSupabase(selectedTemplateOwnerId, updated, customVarsByOwner[selectedTemplateOwnerId] ?? []).then(r => {
        if (!r.ok) showToast(r.error ?? 'Erreur enregistrement', 'error');
      });
    }
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
  const currentTemplate = templatesToShow[selectedTemplateIdx];

  return (
    <div className="modal">
      <div className="panel templates-panel" onClick={e => e.stopPropagation()}>
        <TemplatesModalHeader
          onExport={exportTemplateLocal}
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
          templates={templatesToShow}
          selectedTemplateIdx={selectedTemplateIdx}
          onSelect={setSelectedTemplateIdx}
          onOpenCreateModal={() => {
            setNewTemplateName('');
            setShowCreateTemplateModal(true);
          }}
          onDelete={deleteTemplate}
          ownerFilter={
            isMasterAdmin && templateOwnerOptions.length > 0
              ? {
                  label: 'Afficher les templates de',
                  value: selectedTemplateOwnerId,
                  options: templateOwnerOptions.map(o => ({ id: o.id, label: o.label })),
                  onChange: v => {
                    setSelectedTemplateOwnerId(v);
                    setSelectedTemplateIdx(0);
                  },
                }
              : null
          }
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
              <div className="templates-editor-name-row">
                <label className="form-label" style={{ marginBottom: 4 }}>Nom du template</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Nom du template..."
                />
              </div>
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
          />
        </div>

        <TemplatesModalFooter
          hasChanges={hasChanges}
          onPrimaryAction={() => (hasChanges ? saveAndClose() : doClose())}
        />
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

      {showCreateTemplateModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowCreateTemplateModal(false)}
          role="presentation"
        >
          <div
            className="templates-create-modal-panel"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setShowCreateTemplateModal(false);
                e.stopPropagation();
              }
            }}
            role="dialog"
            aria-labelledby="create-template-title"
          >
            <h4 id="create-template-title" className="templates-create-modal__title">
              Nouveau template
            </h4>
            <input
              type="text"
              value={newTemplateName}
              onChange={e => setNewTemplateName(e.target.value)}
              placeholder="Nom du template..."
              className="templates-create-modal__input"
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setShowCreateTemplateModal(false);
                  e.stopPropagation();
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  createNewTemplate();
                }
              }}
              autoFocus
            />
            <div className="templates-create-modal__actions">
              <button
                type="button"
                className="form-btn form-btn--ghost"
                onClick={() => setShowCreateTemplateModal(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="form-btn form-btn--primary"
                onClick={() => createNewTemplate()}
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
