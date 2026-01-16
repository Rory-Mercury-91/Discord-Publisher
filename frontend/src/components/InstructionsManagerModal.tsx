import React, {useState} from 'react';
import { useApp } from '../state/appContext';
import { useToast } from './ToastProvider';
import { useConfirm } from '../hooks/useConfirm';
import ConfirmModal from './ConfirmModal';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

export default function InstructionsManagerModal({onClose}:{onClose?:()=>void}){
  const { savedInstructions, saveInstruction, deleteInstruction } = useApp();
  const { showToast } = useToast();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  
  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();
  
  const [form, setForm] = useState({name: '', content: ''});
  const [editingKey, setEditingKey] = useState<string | null>(null);

  function startEdit(key: string){
    const content = savedInstructions[key];
    setForm({name: key, content});
    setEditingKey(key);
  }

  function cancelEdit(){
    setForm({name: '', content: ''});
    setEditingKey(null);
  }

  function saveInstructionItem(){
    if(!form.name.trim()){
      showToast('Le nom de l\'instruction est requis', 'warning');
      return;
    }

    if(!form.content.trim()){
      showToast('Le contenu de l\'instruction est requis', 'warning');
      return;
    }

    // Vérifier si le nom existe déjà (sauf si on édite la même)
    const existingKeys = Object.keys(savedInstructions);
    if(editingKey !== form.name && existingKeys.includes(form.name)){
      showToast('Une instruction avec ce nom existe déjà', 'warning');
      return;
    }

    // Si on édite et qu'on a changé le nom, supprimer l'ancien
    if(editingKey && editingKey !== form.name){
      deleteInstruction(editingKey);
    }

    saveInstruction(form.name.trim(), form.content.trim());
    setForm({name: '', content: ''});
    setEditingKey(null);
    showToast(editingKey ? 'Instruction modifiée' : 'Instruction ajoutée', 'success');
  }

  async function handleDelete(key: string){
    const ok = await confirm({
      title: 'Supprimer l\'instruction',
      message: 'Voulez-vous vraiment supprimer cette instruction ?',
      confirmText: 'Supprimer',
      type: 'danger'
    });
    if(!ok) return;
    deleteInstruction(key);
    if(editingKey === key) cancelEdit();
    showToast('Instruction supprimée', 'success');
  }

  const instructionEntries = Object.entries(savedInstructions);

  return (
    <div className="modal">
      <div className="panel" onClick={e=>e.stopPropagation()} style={{maxWidth: 1000, width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column'}}>
        <h3>📋 Gestion des instructions</h3>

        <div style={{display:'grid', gap:16, overflowY: 'auto', flex: 1}}>
          {/* Liste des instructions existantes */}
          <div>
            <h4>Instructions enregistrées ({instructionEntries.length})</h4>
            {instructionEntries.length === 0 ? (
              <div style={{color:'var(--muted)', fontStyle:'italic', padding: 12, textAlign:'center'}}>
                Aucune instruction enregistrée. Utilisez le formulaire ci-dessous pour en ajouter.
              </div>
            ) : (
              <div style={{display:'grid', gap:8}}>
                {instructionEntries.map(([key, content]) => (
                  <div key={key} style={{
                    display:'grid', 
                    gridTemplateColumns: editingKey === key ? '1fr' : '1fr auto auto',
                    gap:8, 
                    alignItems:'center', 
                    borderBottom:'1px solid var(--border)', 
                    padding:'8px 0',
                    background: editingKey === key ? 'rgba(255,255,255,0.05)' : 'transparent'
                  }}>
                    {editingKey === key ? (
                      <div style={{display:'grid', gap:8}}>
                        <div style={{color:'var(--muted)', fontSize:12}}>✏️ Mode édition</div>
                        <div>
                          <strong>{key}</strong>
                          <div style={{color:'var(--muted)', fontSize:12, marginTop:4, maxHeight:60, overflow:'auto'}}>
                            {content.slice(0, 200)}{content.length > 200 ? '...' : ''}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <strong>{key}</strong>
                          <div style={{color:'var(--muted)', fontSize:12, marginTop:4, maxHeight:60, overflow:'auto'}}>
                            {content.slice(0, 200)}{content.length > 200 ? '...' : ''}
                          </div>
                        </div>
                        <button onClick={() => startEdit(key)} style={{fontSize:12, padding:'4px 8px'}}>✏️ Éditer</button>
                        <button onClick={() => handleDelete(key)} style={{fontSize:12, padding:'4px 8px'}}>🗑️</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Formulaire d'ajout/édition */}
          <div style={{borderTop: '1px solid var(--border)', paddingTop: 16}}>
            <h4>{editingKey ? '✏️ Modifier l\'instruction' : '➕ Ajouter une instruction'}</h4>
            
            <div style={{display:'grid', gap:12}}>
              <div>
                <label style={{display:'block', fontSize:13, color:'var(--muted)', marginBottom:4}}>
                  Nom de l'instruction
                </label>
                <input 
                  placeholder="ex: Installation Windows, Guide Linux..." 
                  value={form.name} 
                  onChange={e=>setForm({...form, name: e.target.value})}
                  style={{width:'100%'}}
                  disabled={editingKey !== null}
                />
                {editingKey && (
                  <div style={{fontSize:11, color:'var(--muted)', marginTop:4}}>
                    💡 Pour renommer, supprimez et recréez l'instruction
                  </div>
                )}
              </div>

              <div>
                <label style={{display:'block', fontSize:13, color:'var(--muted)', marginBottom:4}}>
                  Contenu de l'instruction
                </label>
                <textarea 
                  placeholder="Instructions d'installation détaillées..."
                  value={form.content} 
                  onChange={e=>setForm({...form, content: e.target.value})}
                  rows={8}
                  style={{width:'100%', fontFamily:'monospace', fontSize:13}}
                  spellCheck={true}
                  lang="fr-FR"
                />
                <div style={{fontSize:11, color:'var(--muted)', marginTop:4}}>
                  💡 Cette instruction sera disponible via la variable [instruction] dans tous les templates
                </div>
              </div>

              <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:8}}>
                {editingKey !== null && (
                  <button onClick={cancelEdit}>🚪 Fermer</button>
                )}
                <button onClick={saveInstructionItem}>
                  {editingKey !== null ? '✅ Enregistrer' : '➕ Ajouter'}
                </button>
                <button onClick={onClose}>🚪 Fermer</button>
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
    </div>
  );
}
