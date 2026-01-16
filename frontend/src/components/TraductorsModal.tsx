import React, {useState} from 'react';
import { useApp } from '../state/appContext';
import { useToast } from './ToastProvider';
import { useConfirm } from '../hooks/useConfirm';
import ConfirmModal from './ConfirmModal';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { tauriAPI } from '../lib/tauri-api';

export default function TraductorsModal({onClose}:{onClose?:()=>void}){
  const { savedTraductors, saveTraductor, deleteTraductor } = useApp();
  const { showToast } = useToast();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  
  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();
  
  const [form, setForm] = useState({name: ''});
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  function startEdit(idx: number){
    const t = savedTraductors[idx];
    setForm({name: t});
    setEditingIdx(idx);
  }

  function cancelEdit(){
    setForm({name: ''});
    setEditingIdx(null);
  }

  function saveTraductorItem(){
    if(!form.name.trim()){
      showToast('Le nom du traducteur est requis', 'warning');
      return;
    }

    // Vérifier si le nom existe déjà (sauf si on édite le même)
    const existingIdx = savedTraductors.findIndex((t, i) => t.toLowerCase() === form.name.trim().toLowerCase() && i !== editingIdx);
    if(existingIdx !== -1){
      showToast('Ce traducteur existe déjà', 'warning');
      return;
    }

    if(editingIdx !== null){
      // Pour update, supprimer et rajouter
      deleteTraductor(editingIdx);
      saveTraductor(form.name.trim());
    } else {
      saveTraductor(form.name.trim());
    }

    setForm({name: ''});
    setEditingIdx(null);
    showToast(editingIdx !== null ? 'Traducteur modifié' : 'Traducteur ajouté', 'success');
  }

  async function handleDelete(idx: number){
    const ok = await confirm({
      title: 'Supprimer le traducteur',
      message: 'Voulez-vous vraiment supprimer ce traducteur ?',
      confirmText: 'Supprimer',
      type: 'danger'
    });
    if(!ok) return;
    deleteTraductor(idx);
    if(editingIdx === idx) cancelEdit();
    showToast('Traducteur supprimé', 'success');
  }

  return (
    <div className="modal">
      <div className="panel" onClick={e=>e.stopPropagation()} style={{maxWidth: 1000, width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column'}}>
        <h3>👥 Gestion des traducteurs</h3>

        <div style={{display:'grid', gap:16, overflowY: 'auto', flex: 1}}>
          {/* Liste des traducteurs existants */}
          <div>
            <h4>Traducteurs enregistrés ({savedTraductors.length})</h4>
            {savedTraductors.length === 0 ? (
              <div style={{color:'var(--muted)', fontStyle:'italic', padding: 12, textAlign:'center'}}>
                Aucun traducteur enregistré. Utilisez le formulaire ci-dessous pour en ajouter.
              </div>
            ) : (
              <div style={{display:'grid', gap:8}}>
                {savedTraductors.map((t, idx) => (
                  <div key={idx} style={{
                    display:'grid', 
                    gridTemplateColumns: editingIdx === idx ? '1fr' : '1fr auto auto',
                    gap:8, 
                    alignItems:'center', 
                    borderBottom:'1px solid var(--border)', 
                    padding:'8px 0',
                    background: editingIdx === idx ? 'rgba(255,255,255,0.05)' : 'transparent'
                  }}>
                    {editingIdx === idx ? (
                      <div style={{display:'grid', gap:8}}>
                        <div style={{color:'var(--muted)', fontSize:12}}>✏️ Mode édition</div>
                        <div>
                          <strong>{t}</strong>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <strong 
                            onClick={async () => { 
                              try { 
                                await tauriAPI.writeClipboard(t); 
                                setCopiedIdx(idx);
                                setTimeout(() => setCopiedIdx(null), 2000);
                              } catch(e) { 
                                // Erreur silencieuse
                              } 
                            }}
                            style={{
                              cursor:'pointer', 
                              color: copiedIdx === idx ? '#4ade80' : '#4a9eff',
                              transition: 'color 0.3s'
                            }}
                            title="Cliquer pour copier"
                          >
                            {t} {copiedIdx === idx && <span style={{fontSize:11, marginLeft:6}}>✓ Copié</span>}
                          </strong>
                        </div>
                        <button onClick={() => startEdit(idx)} title="Éditer">✏️</button>
                        <button onClick={() => handleDelete(idx)} title="Supprimer">🗑️</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Formulaire d'ajout/édition */}
          <div style={{borderTop: '2px solid var(--border)', paddingTop: 16}}>
            <h4>{editingIdx !== null ? '✏️ Modifier le traducteur' : '➕ Ajouter un traducteur'}</h4>
            <div style={{display:'grid', gap:8}}>
              <div>
                <label style={{display:'block', fontSize:13, color:'var(--muted)', marginBottom:4}}>
                  Nom du traducteur *
                </label>
                <input 
                  placeholder="ex: Rory Mercury 91" 
                  value={form.name} 
                  onChange={e=>setForm({...form, name:e.target.value})}
                  style={{width:'100%'}}
                />
              </div>

              <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:8}}>
                {editingIdx !== null && (
                  <button onClick={cancelEdit}>🚪 Fermer</button>
                )}
                <button onClick={saveTraductorItem}>
                  {editingIdx !== null ? '✅ Enregistrer' : '➕ Ajouter'}
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
