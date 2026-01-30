import { useState } from 'react';
import { useConfirm } from '../hooks/useConfirm';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { useApp } from '../state/appContext';
import { useAuth } from '../state/authContext';
import ConfirmModal from './ConfirmModal';
import { useToast } from './ToastProvider';

export default function TagsModal({ onClose }: { onClose?: () => void }) {
  const { profile } = useAuth();
  const { savedTags, addSavedTag, updateSavedTag, deleteSavedTag } = useApp();
  const { showToast } = useToast();

  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  const [activeTab, setActiveTab] = useState<'generic' | 'translator'>('generic');
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({ name: '', id: '', discordTagId: '', isTranslator: false });
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [searchGeneric, setSearchGeneric] = useState('');
  const [searchTranslator, setSearchTranslator] = useState('');

  // Plus de filtrage par template - tous les tags sont disponibles

  // Fonction pour retirer les emojis au début d'un texte
  const removeLeadingEmojis = (text: string): string => {
    return text.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\s]+/gu, '').trim();
  };

  // Séparer les tags génériques et traducteurs (tous les tags, sans filtrage par template)
  const genericTags = savedTags.filter(t => !t.isTranslator);
  const translatorTags = savedTags.filter(t => t.isTranslator);

  // Filtrer avec recherche (en ignorant les emojis)
  const filterBySearch = (tags: typeof savedTags, searchTerm: string) => {
    if (!searchTerm.trim()) return tags;
    const searchLower = searchTerm.toLowerCase();
    return tags.filter(t => {
      const nameWithoutEmoji = removeLeadingEmojis(t.name).toLowerCase();
      const nameWithEmoji = t.name.toLowerCase();
      return nameWithoutEmoji.includes(searchLower) || nameWithEmoji.includes(searchLower);
    });
  };

  const filteredGenericTags = filterBySearch(genericTags, searchGeneric);
  const filteredTranslatorTags = filterBySearch(translatorTags, searchTranslator);

  // Trier les tags (plus de groupement par template)
  const sortTags = (tags: typeof savedTags) => {
    return tags.map((tag, idx) => ({ ...tag, originalIdx: savedTags.indexOf(tag) }))
      .sort((a, b) => {
        const nameA = removeLeadingEmojis(a.name);
        const nameB = removeLeadingEmojis(b.name);
        return nameA.localeCompare(nameB);
      });
  };

  const sortedGenericTags = sortTags(filteredGenericTags);
  const sortedTranslatorTags = sortTags(filteredTranslatorTags);

  function openAddModal() {
    setForm({ name: '', id: '', discordTagId: '', isTranslator: false });
    setEditingIdx(null);
    setShowAddModal(true);
  }

  function startEdit(originalIdx: number) {
    const t = savedTags[originalIdx];
    setForm({
      name: t.name,
      id: t.id || '',
      discordTagId: t.discordTagId || '',
      isTranslator: t.isTranslator || false
    });
    setEditingIdx(originalIdx);
    setShowAddModal(true);
  }

  function closeAddModal() {
    setForm({ name: '', id: '', discordTagId: '', isTranslator: false });
    setEditingIdx(null);
    setShowAddModal(false);
  }

  function saveTag() {
    if (!form.name.trim()) {
      showToast('Le nom du tag est requis', 'warning');
      return;
    }
    if (!form.discordTagId.trim()) {
      showToast('L\'ID du tag Discord est requis pour que le tag fonctionne avec Discord.', 'warning');
      return;
    }

    if (editingIdx !== null) {
      const existing = savedTags[editingIdx];
      if (existing?.id) {
        updateSavedTag(existing.id, {
          name: form.name.trim(),
          template: 'my',
          isTranslator: form.isTranslator,
          authorDiscordId: profile?.discord_id,
          discordTagId: form.discordTagId.trim() || undefined
        });
        showToast('Tag modifié', 'success');
      } else {
        addSavedTag({
          name: form.name.trim(),
          template: 'my',
          isTranslator: form.isTranslator,
          authorDiscordId: profile?.discord_id,
          discordTagId: form.discordTagId.trim() || undefined
        });
        showToast('Tag modifié (enregistré comme nouveau)', 'success');
      }
    } else {
      addSavedTag({
        name: form.name.trim(),
        template: 'my',
        isTranslator: form.isTranslator,
        authorDiscordId: profile?.discord_id,
        discordTagId: form.discordTagId.trim() || undefined
      });
      showToast('Tag ajouté', 'success');
    }

    closeAddModal();
  }

  async function handleDelete(idx: number) {
    const ok = await confirm({
      title: 'Supprimer le tag',
      message: 'Voulez-vous vraiment supprimer ce tag ?',
      confirmText: 'Supprimer',
      type: 'danger'
    });
    if (!ok) return;
    deleteSavedTag(idx);
    showToast('Tag supprimé', 'success');
  }

  const renderTagGrid = (sortedTags: Array<typeof savedTags[0] & { originalIdx: number }>) => {
    if (sortedTags.length === 0) {
      return (
        <div style={{
          color: 'var(--muted)',
          fontStyle: 'italic',
          padding: 24,
          textAlign: 'center',
          border: '1px dashed var(--border)',
          borderRadius: 8
        }}>
          Aucun tag trouvé
        </div>
      );
    }

    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 8
      }}>
        {sortedTags.map((t) => (
          <div key={t.originalIdx} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 12,
            background: 'transparent',
            transition: 'background 0.2s'
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(t.id || t.name);
                    setCopiedIdx(t.originalIdx);
                    setTimeout(() => setCopiedIdx(null), 2000);
                    showToast('ID du tag copié', 'success', 2000);
                  } catch (e) {
                    showToast('Erreur lors de la copie', 'error');
                  }
                }}
                style={{
                  cursor: 'pointer',
                  color: copiedIdx === t.originalIdx ? '#4ade80' : '#4a9eff',
                  transition: 'color 0.3s',
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
                title={`Cliquer pour copier l'ID: ${t.id}`}
              >
                {t.name} {copiedIdx === t.originalIdx && <span style={{ fontSize: 11 }}>✓</span>}
              </strong>
              <div style={{
                color: 'var(--muted)',
                fontSize: 11,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                ID Discord: {t.discordTagId || '—'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
              <button
                onClick={() => startEdit(t.originalIdx)}
                title="Éditer"
                style={{ padding: '4px 8px', fontSize: 14 }}
              >
                ✏️
              </button>
              <button
                onClick={() => handleDelete(t.originalIdx)}
                title="Supprimer"
                style={{ padding: '4px 8px', fontSize: 14 }}
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="modal">
        <div className="panel" onClick={e => e.stopPropagation()} style={{
          maxWidth: 1000,
          width: '95%',
          height: '80vh',  // Changé de 70vh à 80vh
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* HEADER : Titre + Navigation */}
          <div style={{
            borderBottom: '2px solid var(--border)',
            paddingBottom: 0
          }}>
            <h3 style={{ marginBottom: 12 }}>🏷️ Gestion des tags</h3>

            {/* Onglets avec compteurs */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setActiveTab('generic')}
                style={{
                  background: activeTab === 'generic' ? 'var(--panel)' : 'transparent',
                  border: 'none',
                  borderBottom: activeTab === 'generic' ? '2px solid #4a9eff' : '2px solid transparent',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontWeight: activeTab === 'generic' ? 'bold' : 'normal',
                  color: activeTab === 'generic' ? '#4a9eff' : 'var(--text)',
                  marginBottom: '-2px'
                }}
              >
                🏷️ Tags génériques ({genericTags.length})
              </button>
              <button
                onClick={() => setActiveTab('translator')}
                style={{
                  background: activeTab === 'translator' ? 'var(--panel)' : 'transparent',
                  border: 'none',
                  borderBottom: activeTab === 'translator' ? '2px solid #4a9eff' : '2px solid transparent',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontWeight: activeTab === 'translator' ? 'bold' : 'normal',
                  color: activeTab === 'translator' ? '#4a9eff' : 'var(--text)',
                  marginBottom: '-2px'
                }}
              >
                👤 Tags traducteurs ({translatorTags.length})
              </button>
            </div>
          </div>

          {/* CONTENU SCROLLABLE */}
          <div style={{
            flex: 1,
            padding: '16px',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            {/* SECTION TAGS GÉNÉRIQUES */}
            {activeTab === 'generic' && (
              <div style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                  gap: 16
                }}>
                  <h4 style={{
                    margin: 0,
                    fontSize: 16,
                    color: 'var(--text)',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    🏷️ Tags génériques
                  </h4>
                  <input
                    type="text"
                    placeholder="🔍 Rechercher..."
                    value={searchGeneric}
                    onChange={e => setSearchGeneric(e.target.value)}
                    style={{
                      width: '250px',
                      padding: '6px 12px',
                      fontSize: 13
                    }}
                  />
                </div>
                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  minHeight: 0,
                  paddingRight: 8
                }} className="styled-scrollbar">
                  {renderTagGrid(sortedGenericTags)}
                </div>
              </div>
            )}

            {/* SECTION TAGS TRADUCTEURS */}
            {activeTab === 'translator' && (
              <div style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                  gap: 16
                }}>
                  <h4 style={{
                    margin: 0,
                    fontSize: 16,
                    color: 'var(--text)',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    👤 Tags traducteurs
                  </h4>
                  <input
                    type="text"
                    placeholder="🔍 Rechercher..."
                    value={searchTranslator}
                    onChange={e => setSearchTranslator(e.target.value)}
                    style={{
                      width: '250px',
                      padding: '6px 12px',
                      fontSize: 13
                    }}
                  />
                </div>
                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  minHeight: 0,
                  paddingRight: 8
                }} className="styled-scrollbar">
                  {renderTagGrid(sortedTranslatorTags)}
                </div>
              </div>
            )}
          </div>

          {/* FOOTER : Boutons */}
          <div style={{
            borderTop: '2px solid var(--border)',
            paddingTop: 16,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8
          }}>
            <button onClick={openAddModal} style={{ background: '#4a9eff', color: 'white' }}>
              ➕ Ajouter un tag
            </button>
            <button onClick={onClose}>🚪 Fermer</button>
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

      {/* Modale d'ajout/édition */}
      {showAddModal && (
        <div className="modal" style={{ zIndex: 1001 }}>
          <div className="panel" onClick={e => e.stopPropagation()} style={{
            maxWidth: 500,
            width: '90%'
          }}>
            <h3>{editingIdx !== null ? '✏️ Modifier le tag' : '➕ Ajouter un tag'}</h3>

            <div style={{
              background: 'rgba(74, 158, 255, 0.1)',
              border: '1px solid rgba(74, 158, 255, 0.3)',
              borderRadius: 6,
              padding: 12,
              marginBottom: 16,
              fontSize: 13
            }}>
              <strong>
                {activeTab === 'generic' ? '🏷️ Tag générique' : '👤 Tag traducteur'}
              </strong>
              <div style={{ color: 'var(--muted)', marginTop: 4 }}>
                Le tag sera ajouté dans la catégorie correspondante
              </div>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                  Nom du tag *
                </label>
                <input
                  placeholder="ex: Traduction FR"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  style={{ width: '100%' }}
                  autoFocus
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                  ID du tag Discord *
                </label>
                <input
                  placeholder="ex: 1234567890123456789 (ID du tag côté Discord)"
                  value={form.discordTagId}
                  onChange={e => setForm({ ...form, discordTagId: e.target.value })}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  ID du tag tel qu’il est défini dans le forum Discord (requis pour la synchronisation).
                </div>
              </div>

              {/* Checkbox Traducteur */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                background: 'rgba(74, 158, 255, 0.05)',
                borderRadius: 6,
                border: '1px solid rgba(74, 158, 255, 0.2)'
              }}>
                <input
                  type="checkbox"
                  id="isTranslator"
                  checked={form.isTranslator}
                  onChange={e => setForm({ ...form, isTranslator: e.target.checked })}
                  style={{ cursor: 'pointer' }}
                />
                <label
                  htmlFor="isTranslator"
                  style={{ cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
                >
                  👤 Tag traducteur (sinon tag générique)
                </label>
              </div>

            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={closeAddModal}>Annuler</button>
              <button onClick={saveTag} style={{ background: '#4a9eff', color: 'white' }}>
                {editingIdx !== null ? '✅ Enregistrer' : '➕ Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
