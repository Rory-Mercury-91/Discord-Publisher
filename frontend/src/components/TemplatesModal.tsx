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

  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  // Toujours éditer le template unique (index 0)
  const editingIdx = 0;
  const [form, setForm] = useState({ name: '', content: '' });
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [editingVarIdx, setEditingVarIdx] = useState<number | null>(null);
  const [varForm, setVarForm] = useState({ name: '', label: '', type: 'text' as 'text' | 'textarea' });
  const [showMarkdownHelp, setShowMarkdownHelp] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Charger le template unique au chargement de la modale
  useEffect(() => {
    if (templates.length > 0) {
      const t = templates[0];
      setForm({ name: t.name, content: t.content });
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (form.name.trim()) {
          saveTemplate();
        } else {
          showToast('Le nom du template est requis', 'warning');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [form.name, form.content, editingIdx]);

  function cancelEdit() {
    if (templates.length > 0) {
      const t = templates[0];
      setForm({ name: t.name, content: t.content });
    } else {
      setForm({ name: '', content: '' });
    }
    cancelVarEdit();
  }

  function saveTemplate() {
    if (!form.name.trim()) {
      showToast('Le nom est requis', 'warning');
      return;
    }
    if (templates.length === 0) {
      showToast('Aucun template à modifier', 'error');
      return;
    }
    const now = Date.now();
    const currentTemplate = templates[0];
    const payload = {
      id: currentTemplate.id || 'my',
      name: form.name,
      type: currentTemplate.type || 'my',
      content: form.content,
      isDraft: false,
      createdAt: currentTemplate.createdAt || now,
      modifiedAt: now,
      lastSavedAt: undefined
    };
    updateTemplate(0, payload);
    cancelEdit();
    showToast('Template enregistré', 'success');
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

  /** Export local : template(s) + variables au format JSON */
  function exportTemplateLocal() {
    try {
      const data = {
        templates,
        allVarsConfig,
        exportDate: new Date().toISOString(),
        version: '1.0'
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `templates_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Template exporté', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Erreur export', 'error');
    }
  }

  /** Import local : fichier JSON avec templates et allVarsConfig */
  function importTemplateLocal(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object') throw new Error('Fichier invalide');
        const payload: any = {};
        if (Array.isArray(data.templates)) payload.templates = data.templates;
        if (Array.isArray(data.allVarsConfig)) payload.allVarsConfig = data.allVarsConfig;
        if (Object.keys(payload).length === 0) {
          showToast('Aucun template ou variable dans le fichier', 'warning');
          return;
        }
        importFullConfig(payload);
        showToast('Template importé', 'success');
        if (Array.isArray(data.templates) && data.templates.length > 0) {
          const t = data.templates[0];
          setForm({ name: t.name ?? '', content: t.content ?? '' });
        }
      } catch (e: any) {
        showToast(e?.message || 'Fichier invalide', 'error');
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  // Template unique - toutes les variables sont visibles
  const visibleVars = allVarsConfig;
  const customVars = allVarsConfig.map((v, idx) => ({ v, idx })).filter(({ v }) => v.isCustom);

  return (
    <div className="modal">
      <div className="panel" onClick={e => e.stopPropagation()} style={{
        maxWidth: 1200,
        width: '95%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: '2px solid var(--border)'
        }}>
          <h3 style={{ margin: 0 }}>📄 Gestion des templates & variables</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={exportTemplateLocal}
              style={{ fontSize: 12, padding: '6px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border)' }}
              title="Exporter le template et les variables en JSON (local)"
            >
              📤 Exporter
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              style={{ fontSize: 12, padding: '6px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border)' }}
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
              onClick={async () => {
                const ok = await confirm({
                  title: 'Restaurer les templates par défaut',
                  message: 'Voulez-vous vraiment restaurer les templates par défaut ? Cela remplacera tous les templates actuels.',
                  confirmText: 'Restaurer',
                  type: 'warning'
                });
                if (ok) {
                  restoreDefaultTemplates();
                  showToast('Templates par défaut restaurés', 'success');
                }
              }}
              style={{
                fontSize: 12,
                padding: '6px 12px',
                background: 'var(--accent)'
              }}
              title="Restaurer les templates par défaut"
            >
              🔄 Restaurer
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20, flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Colonne gauche : Template */}
          <div style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--border)',
            paddingRight: 20
          }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: 15 }}>
              📄 Template
            </h4>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                Nom du template *
              </label>
              <input
                placeholder="ex: Mon template"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ flex: 1, minHeight: 120, display: 'flex', flexDirection: 'column' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: 'var(--muted)',
                marginBottom: 4
              }}>
                Contenu *
                <button
                  type="button"
                  onClick={() => setShowMarkdownHelp(true)}
                  style={{
                    background: 'rgba(74, 158, 255, 0.15)',
                    border: '1px solid rgba(74, 158, 255, 0.3)',
                    borderRadius: '50%',
                    width: 18,
                    height: 18,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: 11,
                    padding: 0
                  }}
                  title="Aide Markdown"
                >
                  ?
                </button>
              </label>
              <textarea
                ref={contentRef}
                placeholder="Contenu du template..."
                value={form.content}
                onChange={e => setForm({ ...form, content: e.target.value })}
                style={{
                  width: '100%',
                  flex: 1,
                  minHeight: 180,
                  fontFamily: 'monospace',
                  resize: 'vertical',
                  fontSize: 13
                }}
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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 72, overflowY: 'auto' }}>
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
            <div style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--border)'
            }}>
              <button onClick={cancelEdit} style={{ padding: '8px 14px' }}>
                ❌ Annuler
              </button>
              <button
                onClick={() => {
                  saveTemplate();
                  onClose?.();
                }}
                style={{ padding: '8px 14px', background: 'var(--accent)', fontWeight: 600 }}
              >
                ✅ Enregistrer
              </button>
            </div>
          </div>

          {/* Colonne droite : Variables dynamiques (partagées entre utilisateurs) */}
          <div style={{
            flex: 1,
            minWidth: 280,
            maxWidth: 420,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: 15 }}>
              🔧 Variables dynamiques
            </h4>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px 0', lineHeight: 1.4 }}>
              Partagées entre tous les utilisateurs. Utilisez <code style={{ fontFamily: 'monospace', fontSize: 11 }}>[nom]</code> dans le template.
            </p>
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
