import { Fragment, useEffect, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { getSupabase } from '../lib/supabase';
import { useToast } from './ToastProvider';

// ─── Définitions des slots prédéfinis ────────────────────────────────────────
type Section = 'translationType' | 'gameStatus' | 'sites';
const SECTIONS: Section[] = ['translationType', 'gameStatus', 'sites'];

const PREDEFINED: Record<Section, { key: string; label: string }[]> = {
  translationType: [
    { key: 'auto', label: '🤖 Automatique' },
    { key: 'semi_auto', label: '🖨️ Semi-Automatique' },
    { key: 'manual', label: '🧠 Manuelle' },
  ],
  gameStatus: [
    { key: 'abandoned', label: '❌ Abandonné' },
    { key: 'ongoing', label: '🔄 En cours' },
    { key: 'completed', label: '✅ Terminé' },
  ],
  sites: [
    { key: 'other_sites', label: '🔗 Autres Sites' },
    { key: 'f95', label: '🔞 F95' },
    { key: 'lewdcorner', label: '⛔ LewdCorner' },
  ],
};

const SECTION_TITLES: Record<Section, string> = {
  translationType: '📋 Type de traduction',
  gameStatus: '🎮 Statut du jeu',
  sites: '🌐 Sites',
};

// ─── Types ────────────────────────────────────────────────────────────────────
type Translator = { id: string; name: string; kind: 'profile' | 'external' };
type Slot = { id?: string; discordTagId: string };
type FreeTag = { id?: string; name: string; discordTagId: string; _k: string };

type TagConfig = {
  translationType: Record<string, Slot>;
  gameStatus: Record<string, Slot>;
  sites: Record<string, Slot>;
  others: FreeTag[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
let _seq = 0;
const uid = () => `_n${++_seq}`;

function emptyConfig(): TagConfig {
  return {
    translationType: Object.fromEntries(PREDEFINED.translationType.map(p => [p.key, { discordTagId: '' }])),
    gameStatus: Object.fromEntries(PREDEFINED.gameStatus.map(p => [p.key, { discordTagId: '' }])),
    sites: Object.fromEntries(PREDEFINED.sites.map(p => [p.key, { discordTagId: '' }])),
    others: [],
  };
}

// ─── Composant ────────────────────────────────────────────────────────────────
export default function TagsModal({ onClose }: { onClose?: () => void }) {
  const { showToast } = useToast();
  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  // Liste des traducteurs (inscrits + externes)
  const [translators, setTranslators] = useState<Translator[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Traducteur sélectionné
  const [selId, setSelId] = useState<string | null>(null);
  const [selKind, setSelKind] = useState<'profile' | 'external'>('profile');

  // Config en cours d'édition
  const [cfg, setCfg] = useState<TagConfig>(emptyConfig());
  const [loadingCfg, setLoadingCfg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [delIds, setDelIds] = useState<string[]>([]); // IDs DB des "autres" supprimés

  // ── Chargement de la liste des traducteurs ──────────────────────────────────
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    setLoadingList(true);
    Promise.all([
      sb.from('profiles').select('id, pseudo'),
      sb.from('external_translators').select('id, name'),
    ]).then(([p, e]) => {
      const list: Translator[] = [
        ...((p.data ?? []) as any[]).map(x => ({ id: x.id, name: x.pseudo || '(sans nom)', kind: 'profile' as const })),
        ...((e.data ?? []) as any[]).map(x => ({ id: x.id, name: x.name || '(sans nom)', kind: 'external' as const })),
      ];
      setTranslators(list);
      if (list.length > 0) { setSelId(list[0].id); setSelKind(list[0].kind); }
    }).finally(() => setLoadingList(false));
  }, []);

  // ── Chargement de la config du traducteur sélectionné ──────────────────────
  useEffect(() => {
    if (!selId) return;
    const sb = getSupabase();
    if (!sb) return;
    setLoadingCfg(true);
    setDelIds([]);
    (async () => {
      try {
        const { data } = selKind === 'profile'
          ? await sb.from('tags').select('*').eq('profile_id', selId)
          : await sb.from('tags').select('*').eq('external_translator_id', selId);
        const c = emptyConfig();
        for (const row of (data ?? []) as any[]) {
          const sec = row.tag_type as string;
          if (row.label_key && (SECTIONS as string[]).includes(sec)) {
            const typedSec = sec as Section;
            c[typedSec][row.label_key] = { id: row.id, discordTagId: row.discord_tag_id ?? '' };
          } else {
            c.others.push({ id: row.id, name: row.name ?? '', discordTagId: row.discord_tag_id ?? '', _k: row.id });
          }
        }
        setCfg(c);
      } finally {
        setLoadingCfg(false);
      }
    })();
  }, [selId, selKind]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const setSlot = (sec: Section, key: string, val: string) =>
    setCfg(p => ({ ...p, [sec]: { ...p[sec], [key]: { ...p[sec][key], discordTagId: val } } }));

  const addFree = () =>
    setCfg(p => ({ ...p, others: [...p.others, { name: '', discordTagId: '', _k: uid() }] }));

  const setFree = (k: string, f: 'name' | 'discordTagId', v: string) =>
    setCfg(p => ({ ...p, others: p.others.map(o => o._k === k ? { ...o, [f]: v } : o) }));

  const delFree = (k: string) => {
    const tag = cfg.others.find(o => o._k === k);
    if (tag?.id) setDelIds(d => [...d, tag.id!]);
    setCfg(p => ({ ...p, others: p.others.filter(o => o._k !== k) }));
  };

  // ── Sauvegarde ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selId) return;
    const sb = getSupabase();
    if (!sb) { showToast('Supabase non disponible', 'error'); return; }
    setSaving(true);
    const ownerF = selKind === 'profile' ? 'profile_id' : 'external_translator_id';

    try {
      // 1) Suppression des "autres" retirés
      for (const id of delIds) {
        await sb.from('tags').delete().eq('id', id);
      }

      // 2) Slots prédéfinis
      for (const sec of SECTIONS) {
        for (const { key, label } of PREDEFINED[sec]) {
          const slot = cfg[sec][key] ?? { discordTagId: '' };
          const did = slot.discordTagId.trim() || null;
          if (slot.id) {
            // Mise à jour (on conserve la ligne même si did devient null)
            await sb.from('tags').update({ discord_tag_id: did, name: label }).eq('id', slot.id);
          } else if (did) {
            // Insertion uniquement si un ID Discord a été renseigné
            const { data: d } = await sb
              .from('tags')
              .insert({ name: label, tag_type: sec, label_key: key, discord_tag_id: did, [ownerF]: selId })
              .select('id')
              .single();
            if (d?.id) {
              const k = key;
              setCfg(p => ({ ...p, [sec]: { ...p[sec], [k]: { id: d.id, discordTagId: slot.discordTagId } } }));
            }
          }
        }
      }

      // 3) Tags libres ("autres")
      for (const o of cfg.others) {
        if (!o.name.trim()) continue;
        const did = o.discordTagId.trim() || null;
        const tk = o._k;
        if (o.id) {
          await sb.from('tags').update({ name: o.name.trim(), discord_tag_id: did }).eq('id', o.id);
        } else {
          const { data: d } = await sb
            .from('tags')
            .insert({ name: o.name.trim(), tag_type: 'other', discord_tag_id: did, [ownerF]: selId })
            .select('id')
            .single();
          if (d?.id) {
            setCfg(p => ({ ...p, others: p.others.map(x => x._k === tk ? { ...x, id: d.id } : x) }));
          }
        }
      }

      setDelIds([]);
      window.dispatchEvent(new CustomEvent('tagsUpdated'));
      showToast('Tags sauvegardés ✓', 'success');
    } catch (e: any) {
      showToast(`Erreur : ${e?.message || 'Inconnue'}`, 'error');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // ── Styles utilitaires ────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    height: 36, padding: '0 10px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)',
    color: 'var(--text)', fontSize: 13, width: '100%', boxSizing: 'border-box',
  };
  const sec: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px',
    background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: 10,
  };
  const colHdr: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5,
  };
  const navHdr: React.CSSProperties = {
    ...colHdr, padding: '4px 10px', margin: '4px 0 2px',
  };

  const selEntry = translators.find(t => t.id === selId);
  const accentColor = selKind === 'external' ? '#ffc84a' : '#4a9eff';

  // ── Rendu ─────────────────────────────────────────────────────────────────────
  return (
    <div className="modal" onClick={onClose}>
      <div className="panel" onClick={e => e.stopPropagation()} style={{
        maxWidth: 900, width: '95%', height: '88vh', display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>🏷️ Gestion des Tags</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: 26, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

          {/* ── Panneau gauche : liste des traducteurs ─────────────────────── */}
          <div className="styled-scrollbar" style={{
            width: 200, borderRight: '1px solid var(--border)', overflowY: 'auto',
            padding: '10px 6px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            {loadingList ? (
              <p style={{ fontSize: 13, color: 'var(--muted)', padding: '0 10px' }}>Chargement…</p>
            ) : (
              <>
                {/* Utilisateurs inscrits */}
                {translators.some(t => t.kind === 'profile') && (
                  <p style={navHdr}>👤 Inscrits</p>
                )}
                {translators.filter(t => t.kind === 'profile').map(t => (
                  <button key={t.id} onClick={() => { setSelId(t.id); setSelKind('profile'); }} style={{
                    padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
                    fontSize: 13, fontWeight: selId === t.id ? 600 : 400, transition: 'all 0.15s',
                    background: selId === t.id ? 'rgba(74,158,255,0.18)' : 'transparent',
                    color: selId === t.id ? '#4a9eff' : 'var(--text)',
                    borderLeft: `2px solid ${selId === t.id ? '#4a9eff' : 'transparent'}`,
                  }}>{t.name}</button>
                ))}

                {/* Traducteurs externes */}
                {translators.some(t => t.kind === 'external') && (
                  <p style={{ ...navHdr, marginTop: 12 }}>🔧 Externes</p>
                )}
                {translators.filter(t => t.kind === 'external').map(t => (
                  <button key={t.id} onClick={() => { setSelId(t.id); setSelKind('external'); }} style={{
                    padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
                    fontSize: 13, fontWeight: selId === t.id ? 600 : 400, transition: 'all 0.15s',
                    background: selId === t.id ? 'rgba(255,200,74,0.18)' : 'transparent',
                    color: selId === t.id ? '#ffc84a' : 'var(--text)',
                    borderLeft: `2px solid ${selId === t.id ? '#ffc84a' : 'transparent'}`,
                  }}>{t.name}</button>
                ))}

                {translators.length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', padding: '0 10px' }}>
                    Aucun traducteur
                  </p>
                )}
              </>
            )}
          </div>

          {/* ── Panneau droit : configuration des tags ─────────────────────── */}
          <div className="styled-scrollbar" style={{
            flex: 1, overflowY: 'auto', padding: 20,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            {!selId ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontStyle: 'italic', fontSize: 14 }}>
                Sélectionnez un traducteur
              </div>
            ) : loadingCfg ? (
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>Chargement…</p>
            ) : (
              <>
                {/* Titre du traducteur */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 20 }}>{selKind === 'external' ? '🔧' : '👤'}</span>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{selEntry?.name}</h4>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
                      {selKind === 'external' ? 'Traducteur externe' : 'Utilisateur inscrit'} — IDs propres à son salon Discord
                    </p>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: `${accentColor}22`, color: accentColor, fontWeight: 600 }}>
                      {cfg.others.length + Object.values(cfg.translationType).filter(s => s.discordTagId).length + Object.values(cfg.gameStatus).filter(s => s.discordTagId).length + Object.values(cfg.sites).filter(s => s.discordTagId).length} tag(s) configuré(s)
                    </span>
                  </div>
                </div>

                {/* Sections prédéfinies */}
                {(['translationType', 'gameStatus', 'sites'] as Section[]).map(s => (
                  <div key={s} style={sec}>
                    <h5 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{SECTION_TITLES[s]}</h5>
                    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '8px 14px', alignItems: 'center' }}>
                      <span style={colHdr}>Label</span>
                      <span style={colHdr}>ID Discord du tag</span>
                      {PREDEFINED[s].map(({ key, label }) => (
                        <Fragment key={key}>
                          <label style={{ fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {label}
                            {cfg[s][key]?.discordTagId && (
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor, flexShrink: 0, display: 'inline-block' }} />
                            )}
                          </label>
                          <input
                            value={cfg[s][key]?.discordTagId ?? ''}
                            onChange={e => setSlot(s, key, e.target.value)}
                            placeholder="ex: 1234567890123456789"
                            style={inp}
                          />
                        </Fragment>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Tags libres */}
                <div style={sec}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h5 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>📦 Tags libres</h5>
                    <button onClick={addFree} style={{
                      padding: '5px 12px', borderRadius: 8, border: '1px dashed rgba(74,158,255,0.5)',
                      background: 'rgba(74,158,255,0.08)', color: '#4a9eff', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    }}>
                      ➕ Ajouter
                    </button>
                  </div>

                  {cfg.others.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>
                      Aucun tag libre. Cliquez sur « Ajouter ».
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 36px', gap: '0 8px' }}>
                        <span style={colHdr}>Label</span>
                        <span style={colHdr}>ID Discord</span>
                        <span />
                      </div>
                      {cfg.others.map(o => (
                        <div key={o._k} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 36px', gap: 8, alignItems: 'center' }}>
                          <input
                            value={o.name}
                            onChange={e => setFree(o._k, 'name', e.target.value)}
                            placeholder="Ex: VF Complète, Guide…"
                            style={inp}
                          />
                          <input
                            value={o.discordTagId}
                            onChange={e => setFree(o._k, 'discordTagId', e.target.value)}
                            placeholder="ID Discord du tag…"
                            style={inp}
                          />
                          <button onClick={() => delFree(o._k)} style={{
                            height: 36, width: 36, borderRadius: 8, border: 'none',
                            background: 'rgba(239,68,68,0.12)', color: '#ef4444', cursor: 'pointer', fontSize: 14,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>🗑️</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bouton sauvegarder */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
                  <button onClick={handleSave} disabled={saving} style={{
                    padding: '10px 28px', borderRadius: 10, border: 'none',
                    background: saving ? 'rgba(74,158,255,0.3)' : 'var(--accent)',
                    color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700,
                  }}>
                    {saving ? '⏳ Sauvegarde…' : '💾 Sauvegarder'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}>
            🚪 Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
