import { useState } from 'react';
import { useConfirm } from '../hooks/useConfirm';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { useApp } from '../state/appContext';
import ConfirmModal from './ConfirmModal';
import { useToast } from './ToastProvider';

export default function InstructionsManagerModal({ onClose }: { onClose?: () => void }) {
  const { savedInstructions, saveInstruction, deleteInstruction } = useApp();
  const { showToast } = useToast();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  const [form, setForm] = useState({ name: '', content: '' });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [addSectionOpen, setAddSectionOpen] = useState(false);

  function startEdit(key: string) {
    const content = savedInstructions[key];
    setForm({ name: key, content });
    setEditingKey(key);
    setAddSectionOpen(true);
  }

  function cancelEdit() {
    setForm({ name: '', content: '' });
    setEditingKey(null);
    setAddSectionOpen(false);
  }

  function toggleAddSection() {
    if (addSectionOpen) {
      cancelEdit();
    } else {
      setForm({ name: '', content: '' });
      setEditingKey(null);
      setAddSectionOpen(true);
    }
  }

  function saveInstructionItem() {
    if (!form.name.trim()) {
      showToast('Le nom de l\'instruction est requis', 'warning');
      return;
    }

    if (!form.content.trim()) {
      showToast('Le contenu de l\'instruction est requis', 'warning');
      return;
    }

    // Vérifier si le nom existe déjà (sauf si on édite la même)
    const existingKeys = Object.keys(savedInstructions);
    if (editingKey !== form.name && existingKeys.includes(form.name)) {
      showToast('Une instruction avec ce nom existe déjà', 'warning');
      return;
    }

    // Si on édite et qu'on a changé le nom, supprimer l'ancien
    if (editingKey && editingKey !== form.name) {
      deleteInstruction(editingKey);
    }

    saveInstruction(form.name.trim(), form.content.trim());
    setForm({ name: '', content: '' });
    setEditingKey(null);
    showToast(editingKey ? 'Instruction modifiée' : 'Instruction ajoutée', 'success');
  }

  async function handleDelete(key: string) {
    const ok = await confirm({
      title: 'Supprimer l\'instruction',
      message: 'Voulez-vous vraiment supprimer cette instruction ?',
      confirmText: 'Supprimer',
      type: 'danger'
    });
    if (!ok) return;
    deleteInstruction(key);
    if (editingKey === key) cancelEdit();
    showToast('Instruction supprimée', 'success');
  }

  // Ordre stable (alphabétique) pour éviter que les instructions "switchent" de position
  const instructionEntries = Object.entries(savedInstructions).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="modal">
      <div className="panel" onClick={e => e.stopPropagation()} style={{
        maxWidth: 1000,
        width: '95%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <h3>📋 Gestion des instructions</h3>

        <div style={{ display: 'grid', gap: 16, flex: 1, minHeight: 0 }}>
          {/* Liste des instructions existantes - SCROLLABLE */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h4>Instructions enregistrées ({instructionEntries.length})</h4>
            {instructionEntries.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontStyle: 'italic', padding: 12, textAlign: 'center' }}>
                Aucune instruction enregistrée. Cliquez sur « Ajouter une instruction » pour en créer.
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                overflowY: 'auto',
                paddingRight: 8
              }}>
                {instructionEntries.map(([key, content]) => (
                  <div key={key} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    background: editingKey === key ? 'rgba(255,255,255,0.05)' : 'transparent'
                  }}>
                    {editingKey === key ? (
                      <div style={{ width: '100%', fontSize: 12, color: 'var(--muted)' }}>
                        ✏️ Mode édition : {key}
                      </div>
                    ) : (
                      <>
                        <div
                          title={content}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 13,
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            cursor: 'help'
                          }}
                        >
                          {key} :
                        </div>
                        <span style={{ color: 'var(--border)', fontSize: 12 }}>|</span>
                        <button onClick={() => startEdit(key)} style={{ fontSize: 14, padding: '4px 6px', background: 'none', border: 'none', cursor: 'pointer' }} title="Éditer">✏️</button>
                        <span style={{ color: 'var(--border)', fontSize: 12 }}>|</span>
                        <button onClick={() => handleDelete(key)} style={{ fontSize: 14, padding: '4px 6px', background: 'none', border: 'none', cursor: 'pointer' }} title="Supprimer">🗑️</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Formulaire d'ajout/édition - collapsible, fermé par défaut */}
          <div style={{ borderTop: '2px solid var(--border)', paddingTop: 16 }}>
            <button
              type="button"
              onClick={toggleAddSection}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 0',
                background: 'none',
                border: 'none',
                color: 'inherit',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <span>{editingKey ? '✏️ Modifier l\'instruction' : '➕ Ajouter une instruction'}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{addSectionOpen ? '▼' : '▶'}</span>
            </button>

            {addSectionOpen && (
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                    Nom de l'instruction
                  </label>
                  <input
                    placeholder="ex: Installation Windows, Guide Linux..."
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    style={{ width: '100%' }}
                    disabled={editingKey !== null}
                  />
                  {editingKey && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      💡 Pour renommer, supprimez et recréez l'instruction
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                    Contenu de l'instruction
                  </label>
                  <textarea
                    placeholder="Instructions d'installation détaillées..."
                    value={form.content}
                    onChange={e => setForm({ ...form, content: e.target.value })}
                    rows={8}
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
                    spellCheck={true}
                    lang="fr-FR"
                  />
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    💡 Cette instruction sera disponible via la variable [instruction] dans tous les templates
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                  {editingKey !== null && (
                    <button onClick={cancelEdit}>❌ Annuler</button>
                  )}
                  <button onClick={saveInstructionItem}>
                    {editingKey !== null ? '✅ Enregistrer' : '➕ Ajouter'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer avec bouton Fermer - toujours visible */}
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: 16
        }}>
          <button onClick={onClose} style={{ padding: '8px 20px', fontWeight: 600 }}>
            ↩️ Fermer
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
    </div>
  );
}
