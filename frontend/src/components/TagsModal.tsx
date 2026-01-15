import React, {useState} from 'react';
import { useApp } from '../state/appContext';
import { useToast } from './ToastProvider';
import { useConfirm } from '../hooks/useConfirm';
import ConfirmModal from './ConfirmModal';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

export default function TagsModal({onClose}:{onClose?:()=>void}){
  const { savedTags, addSavedTag, deleteSavedTag, templates } = useApp();
  const { showToast } = useToast();
  
  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();
  const { confirm, confirmState, closeConfirm } = useConfirm();
  const [form, setForm] = useState({name:'', id:'', template: 'mes'});
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  function startEdit(idx: number){
    const t = savedTags[idx];
    setForm({
      name: t.name,
      id: t.id || '',
      template: t.template || ''
    });
    setEditingIdx(idx);
  }

  function cancelEdit(){
    setForm({name:'', id:'', template:'mes'});
    setEditingIdx(null);
  }

  function saveTag(){
    if(!form.name.trim() || !form.id.trim()){
      showToast('Le nom et l\'ID Discord sont requis', 'warning');
      return;
    }

    if(!form.template){
      showToast('Le template est requis (Mes traductions ou Traductions partenaire)', 'warning');
      return;
    }

    // Vérifier si l'ID existe déjà (sauf si on édite le même tag)
    const existingIdx = savedTags.findIndex((t, i) => t.id === form.id && i !== editingIdx);
    if(existingIdx !== -1){
      showToast('Un tag avec cet ID existe déjà', 'warning');
      return;
    }

    const tag = {
      name: form.name,
      id: form.id,
      template: form.template
    };

    if(editingIdx !== null){
      // Pour update, il faut supprimer et rajouter car pas de updateSavedTag dans appContext
      const newTags = [...savedTags];
      newTags[editingIdx] = tag;
      deleteSavedTag(editingIdx);
      addSavedTag(tag);
    } else {
      addSavedTag(tag);
    }

    setForm({name:'', id:'', template:''});
    setEditingIdx(null);
    showToast(editingIdx !== null ? 'Tag modifié' : 'Tag ajouté', 'success');
  }

  async function handleDelete(idx: number){
    const ok = await confirm({
      title: 'Supprimer le tag',
      message: 'Voulez-vous vraiment supprimer ce tag ?',
      confirmText: 'Supprimer',
      type: 'danger'
    });
    if(!ok) return;
    deleteSavedTag(idx);
    if(editingIdx === idx) cancelEdit();
    showToast('Tag supprimé', 'success');
  }

  return (
    <div className="modal">
      <div className="panel" onClick={e=>e.stopPropagation()} style={{maxWidth: 1000, width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column'}}>
        <h3>🏷️ Gestion des tags</h3>

        <div style={{display:'grid', gap:16, overflowY: 'auto', flex: 1}}>
          {/* Liste des tags existants */}
          <div>
            <h4>Tags sauvegardés ({savedTags.length})</h4>
            {savedTags.length === 0 ? (
              <div style={{color:'var(--muted)', fontStyle:'italic', padding: 12, textAlign:'center'}}>
                Aucun tag sauvegardé. Utilisez le formulaire ci-dessous pour en ajouter.
              </div>
            ) : (
              <div style={{display:'grid', gap:8}}>
                {savedTags.map((t, idx) => (
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
                          <strong>{t.name}</strong>
                          <div style={{color:'var(--muted)', fontSize:12}}>
                            ID : {t.id} | Template : {templates.find(tp => tp.id === t.template)?.name || t.template}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <div>
                            <strong 
                              onClick={async () => { 
                                try {
                                  await navigator.clipboard.writeText(t.id || t.name);
                                  setCopiedIdx(idx);
                                  setTimeout(() => setCopiedIdx(null), 2000);
                                  showToast('ID du tag copié', 'success', 2000);
                                } catch(e) { 
                                  showToast('Erreur lors de la copie', 'error');
                                } 
                              }}
                              style={{
                                cursor:'pointer', 
                                color: copiedIdx === idx ? '#4ade80' : '#4a9eff',
                                transition: 'color 0.3s'
                              }}
                              title="Cliquer pour copier l'ID"
                            >
                              {t.name} {copiedIdx === idx && <span style={{fontSize:11, marginLeft:6}}>✓ Copié</span>}
                            </strong>
                          </div>
                          <div style={{color:'var(--muted)', fontSize:12}}>
                            ID : {t.id}
                            {t.template 
                              ? ` | Template : ${templates.find(tp => tp.id === t.template)?.name || t.template}`
                              : ' | ⚠️ Template manquant'
                            }
                          </div>
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
            <h4>{editingIdx !== null ? '✏️ Modifier le tag' : '➕ Ajouter un tag'}</h4>
            <div style={{display:'grid', gap:8}}>
              <div style={{display:'grid', gridTemplateColumns: '1fr 1fr 1fr', gap:8}}>
                <div>
                  <label style={{display:'block', fontSize:13, color:'var(--muted)', marginBottom:4}}>
                    Nom du tag *
                  </label>
                  <input 
                    placeholder="ex: Traduction FR" 
                    value={form.name} 
                    onChange={e=>setForm({...form, name:e.target.value})}
                    style={{width:'100%'}}
                  />
                </div>
                <div>
                  <label style={{display:'block', fontSize:13, color:'var(--muted)', marginBottom:4}}>
                    ID Discord *
                  </label>
                  <input 
                    placeholder="ex: 1234567890" 
                    value={form.id} 
                    onChange={e=>setForm({...form, id:e.target.value})}
                    style={{width:'100%'}}
                  />
                </div>
                <div>
                  <label style={{display:'block', fontSize:13, color:'var(--muted)', marginBottom:4}}>
                    Template (salon) *
                  </label>
                  <select 
                    value={form.template} 
                    onChange={e=>setForm({...form, template:e.target.value})}
                    style={{width:'100%', background:'var(--panel)', color:'var(--text)', border:'1px solid var(--border)'}}
                  >
                    {templates.map(t => (
                      <option key={t.id} value={t.id || t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{fontSize:11, color:'var(--muted)'}}>
                L'ID Discord du tag est lié à un salon Forum spécifique
              </div>

              <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:8}}>
                {editingIdx !== null && (
                  <button onClick={cancelEdit}>🚪 Fermer</button>
                )}
                <button onClick={saveTag}>
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
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}
