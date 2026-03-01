import { useEffect, useState } from 'react';
import { useConfirm } from '../../hooks/useConfirm';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';
import { getSupabase } from '../../lib/supabase';
import { useApp } from '../../state/appContext';
import { useAuth } from '../../state/authContext';
import ConfirmModal from '../Modals/ConfirmModal';
import { useToast } from '../shared/ToastProvider';
import InstructionsFilter from './components/InstructionsFilter';
import InstructionsFormSection from './components/InstructionsFormSection';
import InstructionsList from './components/InstructionsList';
import {
  type OwnerOption,
  ownerKey,
  normalizeOwnerStored,
  STORAGE_KEY_MASTER_ADMIN,
} from './constants';

export default function InstructionsManagerModal({ onClose }: { onClose?: () => void }) {
  const { profile } = useAuth();
  const { savedInstructions, instructionOwners, saveInstruction, deleteInstruction } = useApp();
  const { showToast } = useToast();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [filterByOwnerId, setFilterByOwnerId] = useState<string>(() =>
    profile?.id ? ownerKey('profile', profile.id) : ''
  );
  const [form, setForm] = useState({ name: '', content: '', ownerId: '' });
  const [editingKey, setEditingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    setFilterByOwnerId(f => f || ownerKey('profile', profile.id));
    const sb = getSupabase();
    if (!sb) return;
    const isMasterAdmin = !!localStorage.getItem(STORAGE_KEY_MASTER_ADMIN);
    (async () => {
      try {
        if (isMasterAdmin) {
          const [
            { data: profilesData },
            { data: externalsData },
          ] = await Promise.all([
            sb.from('profiles').select('id, pseudo'),
            sb.from('external_translators').select('id, name'),
          ]);
          const list: OwnerOption[] = [];
          for (const p of (profilesData ?? []) as { id: string; pseudo?: string }[]) {
            list.push({
              id: ownerKey('profile', p.id),
              label:
                p.id === profile.id
                  ? `Moi (${p.pseudo || '(sans nom)'})`
                  : (p.pseudo || '(sans nom)'),
              kind: 'profile',
            });
          }
          for (const e of (externalsData ?? []) as { id: string; name?: string }[]) {
            list.push({
              id: ownerKey('external', e.id),
              label: `${e.name || '(sans nom)'} (traducteur externe)`,
              kind: 'external',
            });
          }
          setOwnerOptions(list);
        } else {
          const me: OwnerOption = {
            id: ownerKey('profile', profile.id),
            label: `Moi (${profile.pseudo || 'Moi'})`,
            kind: 'profile',
          };
          const { data: editorRows } = await sb
            .from('allowed_editors')
            .select('owner_id')
            .eq('editor_id', profile.id);
          const ownerIds = (editorRows ?? []).map((r: { owner_id: string }) => r.owner_id);
          if (ownerIds.length === 0) {
            setOwnerOptions([me]);
            return;
          }
          const { data: owners } = await sb
            .from('profiles')
            .select('id, pseudo')
            .in('id', ownerIds);
          const others = (owners ?? []).map((o: { id: string; pseudo?: string }) => ({
            id: ownerKey('profile', o.id),
            label: o.pseudo || '(sans nom)',
            kind: 'profile' as const,
          }));
          const byId = new Map<string, OwnerOption>([[me.id, me]]);
          others.forEach(o => byId.set(o.id, o));
          setOwnerOptions(Array.from(byId.values()));
        }
      } catch {
        setOwnerOptions([
          {
            id: ownerKey('profile', profile.id),
            label: `Moi (${profile.pseudo || 'Moi'})`,
            kind: 'profile',
          },
        ]);
      }
    })();
  }, [profile?.id, profile?.pseudo]);

  // Par défaut "Appartient à" = Moi quand on est en mode ajout
  useEffect(() => {
    if (!profile?.id || editingKey !== null) return;
    if (form.name === '' && form.content === '' && form.ownerId === '') {
      setForm(prev => ({ ...prev, ownerId: ownerKey('profile', profile.id) }));
    }
  }, [profile?.id, editingKey]);

  function startEdit(key: string) {
    const content = savedInstructions[key];
    const ownerId = normalizeOwnerStored(instructionOwners[key], profile?.id);
    setForm({ name: key, content, ownerId });
    setEditingKey(key);
  }

  function cancelEdit() {
    setForm({
      name: '',
      content: '',
      ownerId: profile?.id ? ownerKey('profile', profile.id) : '',
    });
    setEditingKey(null);
  }

  function saveInstructionItem() {
    if (!form.name.trim()) {
      showToast("Le nom de l'instruction est requis", 'warning');
      return;
    }
    if (!form.content.trim()) {
      showToast("Le contenu de l'instruction est requis", 'warning');
      return;
    }
    const existingKeys = Object.keys(savedInstructions);
    if (editingKey !== form.name && existingKeys.includes(form.name)) {
      showToast('Une instruction avec ce nom existe déjà', 'warning');
      return;
    }
    if (editingKey && editingKey !== form.name) {
      deleteInstruction(editingKey);
    }
    saveInstruction(
      form.name.trim(),
      form.content.trim(),
      form.ownerId || (profile?.id ? ownerKey('profile', profile.id) : undefined)
    );
    setForm({
      name: '',
      content: '',
      ownerId: profile?.id ? ownerKey('profile', profile.id) : '',
    });
    setEditingKey(null);
    showToast(editingKey ? 'Instruction modifiée' : 'Instruction ajoutée', 'success');
  }

  async function handleDelete(key: string) {
    const ok = await confirm({
      title: "Supprimer l'instruction",
      message: 'Voulez-vous vraiment supprimer cette instruction ?',
      confirmText: 'Supprimer',
      type: 'danger',
    });
    if (!ok) return;
    deleteInstruction(key);
    if (editingKey === key) cancelEdit();
    showToast('Instruction supprimée', 'success');
  }

  const effectiveFilterId =
    filterByOwnerId || (profile?.id ? ownerKey('profile', profile.id) : '');
  const instructionEntries = Object.entries(savedInstructions)
    .filter(
      ([key]) =>
        !effectiveFilterId ||
        normalizeOwnerStored(instructionOwners[key], profile?.id) === effectiveFilterId
    )
    .sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="modal">
      <div
        className="panel instructions-panel"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="instructions-panel__title">📋 Gestion des instructions</h3>

        <InstructionsFilter
          label="Afficher les instructions de"
          value={filterByOwnerId}
          options={ownerOptions}
          onChange={setFilterByOwnerId}
        />

        <div className="instructions-body">
          <InstructionsList
            entries={instructionEntries}
            editingKey={editingKey}
            onEdit={startEdit}
            onDelete={handleDelete}
          />

          <InstructionsFormSection
            isEditing={editingKey !== null}
            form={form}
            ownerOptions={ownerOptions}
            onFormChange={setForm}
            onCancel={cancelEdit}
            onSave={saveInstructionItem}
          />
        </div>

        <div className="instructions-footer">
          <button type="button" onClick={onClose} className="form-btn form-btn--ghost">
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
