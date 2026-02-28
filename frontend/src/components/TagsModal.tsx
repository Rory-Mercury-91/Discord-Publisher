import { Fragment, useEffect, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { apiFetch } from '../lib/api-helpers';
import { getSupabase } from '../lib/supabase';
import { useApp } from '../state/appContext';
import { useToast } from './ToastProvider';

// ─── Sections prédéfinies ─────────────────────────────────────────────────────
type Section = 'translationType' | 'gameStatus' | 'sites';
const SECTIONS: Section[] = ['translationType', 'gameStatus', 'sites'];

const PREDEFINED: Record<Section, { key: string; label: string }[]> = {
  gameStatus: [
    { key: 'completed', label: '✅ Terminé' },
    { key: 'ongoing', label: '🔄 En cours' },
    { key: 'abandoned', label: '❌ Abandonné' },
  ],
  translationType: [
    { key: 'manual', label: '🧠 Manuelle' },
    { key: 'semi_auto', label: '🖨️ Semi-Automatique' },
    { key: 'auto', label: '🤖 Automatique' },
  ],
  sites: [
    { key: 'f95', label: '🔞 F95' },
    { key: 'lewdcorner', label: '⛔ LewdCorner' },
    { key: 'other_sites', label: '🔗 Autres Sites' },
  ],
};

const SECTION_TITLES: Record<Section, string> = {
  gameStatus: '🎮 Statut du jeu',
  translationType: '📋 Type de traduction',
  sites: '🌐 Sites',
};

/**
 * Noms possibles des tags Discord (normalisés en minuscules) pour mapper
 * automatiquement vers nos slots (section + label_key). Tous les salons partagent la même logique.
 */
const DISCORD_TAG_ALIASES: { section: Section; key: string; aliases: string[] }[] = [
  { section: 'gameStatus', key: 'completed', aliases: ['terminé', 'termine', 'completed', 'fini'] },
  { section: 'gameStatus', key: 'ongoing', aliases: ['en cours', 'ongoing', 'en cours...', 'in progress'] },
  { section: 'gameStatus', key: 'abandoned', aliases: ['abandonné', 'abandonne', 'abandoned'] },
  { section: 'translationType', key: 'manual', aliases: ['manuelle', 'manual', 'manuel'] },
  { section: 'translationType', key: 'semi_auto', aliases: ['semi-auto', 'semi automatique', 'semi-auto', 'semi auto'] },
  { section: 'translationType', key: 'auto', aliases: ['automatique', 'automatic', 'auto'] },
  { section: 'sites', key: 'f95', aliases: ['f95', 'f95zone'] },
  { section: 'sites', key: 'lewdcorner', aliases: ['lewdcorner', 'lewd corner', 'lewd'] },
  { section: 'sites', key: 'other_sites', aliases: ['autres sites', 'autres', 'other sites', 'others', 'autre'] },
];

// ─── Types ────────────────────────────────────────────────────────────────────
type Translator = { id: string; name: string; kind: 'profile' | 'external' };

type MappingRow = {
  id: string;
  profile_id: string;
  tag_id: string;
  forum_channel_id: string;
  list_form_traducteur?: string | null;
};

type ExternalTranslator = {
  id: string;
  name: string;
  tag_id: string;
  forum_channel_id: string;
  list_form_traducteur?: string | null;
};

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

function emptyTagConfig(): TagConfig {
  return {
    translationType: Object.fromEntries(PREDEFINED.translationType.map(p => [p.key, { discordTagId: '' }])),
    gameStatus: Object.fromEntries(PREDEFINED.gameStatus.map(p => [p.key, { discordTagId: '' }])),
    sites: Object.fromEntries(PREDEFINED.sites.map(p => [p.key, { discordTagId: '' }])),
    others: [],
  };
}

// ─── Styles communs (alignés sur ConfigModal / thème app) ─────────────────────
const sectionStyle: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 14, padding: 20,
  background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column',
  gap: 16, boxSizing: 'border-box',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)',
  color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
};
const rowInputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)',
  color: 'var(--text)', fontSize: 13, boxSizing: 'border-box',
};
const colHdr: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: 0.5,
};
const sectionBox: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 14,
  background: 'rgba(255,255,255,0.02)', overflow: 'hidden',
};
const sectionHead: React.CSSProperties = {
  padding: '12px 16px', display: 'flex', justifyContent: 'space-between',
  alignItems: 'center', cursor: 'pointer', userSelect: 'none',
  borderBottom: '1px solid var(--border)',
};

// ─── Modale pour créer/éditer un tag translator ───────────────────────────────
interface TagEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialName?: string;
  onSave: (name: string) => void;
  title: string;
}

function TagEditorModal({ isOpen, onClose, initialName = '', onSave, title }: TagEditorModalProps) {
  const [name, setName] = useState(initialName);
  const { showToast } = useToast();

  useEffect(() => { setName(initialName); }, [initialName]);

  const handleSave = () => {
    if (!name.trim()) { showToast('Le nom est requis', 'error'); return; }
    onSave(name.trim());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--modal-backdrop)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'var(--modal-backdrop-blur)',
    }}>
      <div style={{
        background: 'var(--panel)', padding: 24, borderRadius: 14,
        border: '1px solid var(--border)', width: 320,
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
      }}>
        <h3 style={{ margin: '0 0 14px', fontSize: '1rem', color: 'var(--text)' }}>{title}</h3>
        <input
          type="text" value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          placeholder="Nom du tag"
          style={inputStyle}
          autoFocus
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{
            padding: '9px 18px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--muted)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>❌ Annuler</button>
          <button onClick={handleSave} style={{
            padding: '9px 18px', borderRadius: 8,
            background: 'var(--accent)', color: '#fff',
            border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
          }}>💾 Sauvegarder</button>
        </div>
      </div>
    </div>
  );
}

// ─── Sous-composant MappingRowItem (5 colonnes : Traducteur, Tag, Salon Discord, Concordance Formulaire, Action) ───
type EditRow = { tag_id: string; forum_channel_id: string; list_form_traducteur: string };
interface MappingRowProps {
  label: string;
  hasMapping: boolean;
  edit: EditRow;
  tags: { id?: string; name: string }[];
  traducteurOptions: string[];
  onEditChange: (field: 'tag_id' | 'forum_channel_id' | 'list_form_traducteur', val: string) => void;
  onSave: () => void;
  onDelete: () => void;
  isExternal?: boolean;
}

function MappingRowItem({ label, hasMapping, edit, tags, traducteurOptions, onEditChange, onSave, onDelete, isExternal }: MappingRowProps) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '180px 1fr 1fr 1fr 90px 40px',
      gap: 10, alignItems: 'center',
      padding: '8px 14px', borderRadius: 10,
      border: `1px solid ${hasMapping ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
      background: hasMapping ? 'rgba(99,102,241,0.06)' : isExternal ? 'rgba(255,200,74,0.03)' : 'transparent',
      transition: 'background 0.2s',
    }}>
      <div style={{
        fontSize: 13, fontWeight: 600, color: 'var(--text)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ opacity: 0.5, fontSize: 11 }}>{isExternal ? '🔧' : hasMapping ? '🔗' : '⬜'}</span>
        {label}
      </div>

      <select value={edit.tag_id} onChange={e => onEditChange('tag_id', e.target.value)} style={rowInputStyle}>
        <option value="">— Tag —</option>
        {tags.map(t => <option key={t.id ?? t.name} value={t.id ?? ''}>{t.name}</option>)}
      </select>

      <input
        type="text" value={edit.forum_channel_id}
        onChange={e => onEditChange('forum_channel_id', e.target.value)}
        placeholder="ID salon forum" style={rowInputStyle}
      />

      <select
        value={edit.list_form_traducteur ?? ''}
        onChange={e => onEditChange('list_form_traducteur', e.target.value)}
        style={rowInputStyle}
        title="Valeur du champ traducteur à l'export (liste issue de f95_jeux.traducteur)"
      >
        <option value="">— Aucune concordance —</option>
        {traducteurOptions.map(name => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>

      <button type="button" onClick={onSave} style={{
        padding: '7px 0', borderRadius: 8, border: 'none',
        background: 'rgba(99,102,241,0.18)', color: 'var(--accent)',
        cursor: 'pointer', fontSize: 12, fontWeight: 700, width: '100%',
      }}>
        💾 Sauver
      </button>

      <button type="button" onClick={onDelete} title="Supprimer" style={{
        padding: '7px 0', borderRadius: 8, border: 'none',
        background: hasMapping || isExternal ? 'rgba(239,68,68,0.13)' : 'transparent',
        color: hasMapping || isExternal ? '#ef4444' : 'var(--muted)',
        cursor: hasMapping || isExternal ? 'pointer' : 'default',
        fontSize: 14, width: '100%', opacity: hasMapping || isExternal ? 1 : 0.3,
      }}>
        🗑️
      </button>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function TagsModal({ onClose }: { onClose?: () => void }) {
  const { apiUrl } = useApp();
  const { showToast } = useToast();
  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  // ── État pour accordéon exclusif
  const [openSection, setOpenSection] = useState<'s1' | 's2' | 's3' | null>('s1');

  // ── Données globales (pour sections 2 et 3)
  const [translators, setTranslators] = useState<Translator[]>([]);
  const [allProfiles, setAllProfiles] = useState<{ id: string; pseudo: string }[]>([]);
  const [externals, setExternals] = useState<ExternalTranslator[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [loadingAll, setLoadingAll] = useState(true);

  // ── Section 1 : tags traducteurs
  const [translatorTags, setTranslatorTags] = useState<{ id: string; name: string }[]>([]);
  const [loadingTranslatorTags, setLoadingTranslatorTags] = useState(true);
  const [showTagModal, setShowTagModal] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);

  // ── Section 2 : routing (list_form_traducteur = valeur f95_jeux.traducteur pour l'export)
  const [editMappings, setEditMappings] = useState<Record<string, { tag_id: string; forum_channel_id: string; list_form_traducteur: string }>>({});
  const [editExternals, setEditExternals] = useState<Record<string, { tag_id: string; forum_channel_id: string; list_form_traducteur: string }>>({});
  const [f95TraducteurOptions, setF95TraducteurOptions] = useState<string[]>([]);
  const [newExtName, setNewExtName] = useState('');
  const [addingExternal, setAddingExternal] = useState(false);

  // ── Section 3 : éditeur de tags
  const [selId, setSelId] = useState<string | null>(null);
  const [selKind, setSelKind] = useState<'profile' | 'external'>('profile');
  const [cfg, setCfg] = useState<TagConfig>(emptyTagConfig());
  const [loadingCfg, setLoadingCfg] = useState(false);
  const [delIds, setDelIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [syncFromDiscordLoading, setSyncFromDiscordLoading] = useState(false);
  /** true = overlay "Génération en cours" (création + récupération ID) */
  const [generatingTagsLoading, setGeneratingTagsLoading] = useState(false);

  // ── Chargement initial
  useEffect(() => { void loadAll(); }, []);

  async function loadAll() {
    const sb = getSupabase();
    if (!sb) return;
    setLoadingAll(true);
    try {
      const [
        { data: profilesData },
        { data: externalsData },
        { data: mapsData },
      ] = await Promise.all([
        sb.from('profiles').select('id, pseudo'),
        sb.from('external_translators').select('id, name, tag_id, forum_channel_id, list_form_traducteur').order('created_at', { ascending: true }),
        sb.from('translator_forum_mappings').select('id, profile_id, tag_id, forum_channel_id, list_form_traducteur'),
      ]);

      const profiles = (profilesData ?? []) as { id: string; pseudo: string }[];
      const exts = (externalsData ?? []) as ExternalTranslator[];
      const maps = (mapsData ?? []) as MappingRow[];

      const list: Translator[] = [
        ...profiles.map(p => ({ id: p.id, name: p.pseudo || '(sans nom)', kind: 'profile' as const })),
        ...exts.map(e => ({ id: e.id, name: e.name || '(sans nom)', kind: 'external' as const })),
      ];

      setTranslators(list);
      setAllProfiles(profiles);
      setExternals(exts);
      setMappings(maps);

      const initMaps: Record<string, { tag_id: string; forum_channel_id: string; list_form_traducteur: string }> = {};
      maps.forEach(m => { initMaps[m.profile_id] = { tag_id: m.tag_id ?? '', forum_channel_id: m.forum_channel_id ?? '', list_form_traducteur: m.list_form_traducteur ?? '' }; });
      setEditMappings(initMaps);

      const initExts: Record<string, { tag_id: string; forum_channel_id: string; list_form_traducteur: string }> = {};
      exts.forEach(e => { initExts[e.id] = { tag_id: e.tag_id ?? '', forum_channel_id: e.forum_channel_id ?? '', list_form_traducteur: e.list_form_traducteur ?? '' }; });
      setEditExternals(initExts);

      if (list.length > 0) { setSelId(list[0].id); setSelKind(list[0].kind); }

      // Récupérer tous les traducteurs distincts de f95_jeux (pagination pour tout charger)
      const traducteurSet = new Set<string>();
      const pageSize = 1000;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data: page } = await sb.from('f95_jeux').select('traducteur').range(offset, offset + pageSize - 1);
        const rows = page ?? [];
        rows.forEach((r: { traducteur?: string | null }) => {
          const v = (r.traducteur ?? '').trim();
          if (v) traducteurSet.add(v);
        });
        hasMore = rows.length === pageSize;
        offset += pageSize;
      }
      setF95TraducteurOptions(Array.from(traducteurSet).sort());
    } catch {
      showToast('Erreur chargement des données', 'error');
    } finally {
      setLoadingAll(false);
    }
  }

  // ── Section 1 : chargement des tags translators
  useEffect(() => {
    const loadTranslatorTags = async () => {
      const sb = getSupabase();
      if (!sb) return;
      setLoadingTranslatorTags(true);
      try {
        const { data } = await sb.from('tags').select('id, name').eq('tag_type', 'translator');
        setTranslatorTags((data ?? []) as { id: string; name: string }[]);
      } catch {
        showToast('Erreur chargement des tags translators', 'error');
      } finally {
        setLoadingTranslatorTags(false);
      }
    };
    void loadTranslatorTags();
  }, []);

  const handleCreateOrUpdateTag = async (name: string) => {
    const sb = getSupabase();
    if (!sb) return;
    try {
      if (editingTagId) {
        const { error } = await sb.from('tags').update({ name }).eq('id', editingTagId);
        if (error) throw error;
        setTranslatorTags(prev => prev.map(t => t.id === editingTagId ? { ...t, name } : t));
        showToast('Tag mis à jour', 'success');
      } else {
        const { data, error } = await sb.from('tags').insert({ name, tag_type: 'translator' }).select('id, name').single();
        if (error) throw error;
        setTranslatorTags(prev => [...prev, data as { id: string; name: string }]);
        showToast('Tag créé', 'success');
      }
    } catch (e: any) {
      showToast(`Erreur : ${e?.message || 'Inconnue'}`, 'error');
    }
    setEditingTagId(null);
  };

  const handleDeleteTag = async (id: string) => {
    const sb = getSupabase();
    if (!sb) return;
    try {
      const { error } = await sb.from('tags').delete().eq('id', id);
      if (error) throw error;
      setTranslatorTags(prev => prev.filter(t => t.id !== id));
      showToast('Tag supprimé', 'success');
    } catch (e: any) {
      showToast(`Erreur : ${e?.message || 'Inconnue'}`, 'error');
    }
  };

  // ── Section 2 : fonctions routing
  async function saveMapping(profileId: string) {
    const sb = getSupabase();
    if (!sb) return;
    const edit = editMappings[profileId];
    if (!edit) return;
    const payload = {
      tag_id: (edit.tag_id || '').trim() || null,
      forum_channel_id: (edit.forum_channel_id || '').trim() || null,
      list_form_traducteur: (edit.list_form_traducteur || '').trim() || null,
    };
    try {
      const existing = mappings.find(m => m.profile_id === profileId);
      if (existing) {
        const { error } = await sb.from('translator_forum_mappings').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from('translator_forum_mappings').insert({ ...payload, profile_id: profileId }).select().single();
        if (error) throw error;
        setMappings(prev => [...prev, data as MappingRow]);
      }
      showToast('Mapping sauvegardé', 'success');
    } catch (e: any) {
      showToast(`Erreur : ${e?.message || 'Inconnue'}`, 'error');
    }
  }

  async function deleteMapping(profileId: string) {
    const sb = getSupabase();
    if (!sb) return;
    const existing = mappings.find(m => m.profile_id === profileId);
    if (!existing) return;
    try {
      const { error } = await sb.from('translator_forum_mappings').delete().eq('id', existing.id);
      if (error) throw error;
      setMappings(prev => prev.filter(m => m.id !== existing.id));
      setEditMappings(prev => { const next = { ...prev }; delete next[profileId]; return next; });
      showToast('Mapping supprimé', 'success');
    } catch (e: any) {
      showToast(`Erreur : ${e?.message || 'Inconnue'}`, 'error');
    }
  }

  async function handleAddExternal() {
    const name = newExtName.trim();
    if (!name) return;
    const sb = getSupabase();
    if (!sb) return;
    try {
      const { data, error } = await sb.from('external_translators').insert({
        name,
        tag_id: null,
        forum_channel_id: null,
        list_form_traducteur: null,
      }).select().single();
      if (error) throw error;
      const newExt = data as ExternalTranslator;
      setExternals(prev => [...prev, newExt]);
      setEditExternals(prev => ({ ...prev, [newExt.id]: { tag_id: '', forum_channel_id: '', list_form_traducteur: '' } }));
      setTranslators(prev => [...prev, { id: newExt.id, name: newExt.name || '(sans nom)', kind: 'external' as const }]);
      setSelId(newExt.id);
      setSelKind('external');
      setNewExtName('');
      setAddingExternal(false);
      showToast('Traducteur externe ajouté', 'success');
    } catch (e: any) {
      showToast(`Erreur : ${e?.message || 'Inconnue'}`, 'error');
    }
  }

  async function saveExternal(extId: string) {
    const sb = getSupabase();
    if (!sb) return;
    const edit = editExternals[extId];
    if (!edit) return;
    const payload = {
      tag_id: (edit.tag_id || '').trim() || null,
      forum_channel_id: (edit.forum_channel_id || '').trim() || null,
      list_form_traducteur: (edit.list_form_traducteur || '').trim() || null,
    };
    try {
      const { error } = await sb.from('external_translators').update(payload).eq('id', extId);
      if (error) throw error;
      setExternals(prev => prev.map(e => e.id === extId ? { ...e, tag_id: payload.tag_id ?? '', forum_channel_id: payload.forum_channel_id ?? '', list_form_traducteur: payload.list_form_traducteur ?? undefined } : e));
      showToast('Routing sauvegardé', 'success');
    } catch (e: any) {
      showToast(`Erreur : ${e?.message || 'Inconnue'}`, 'error');
    }
  }

  async function deleteExternal(extId: string) {
    const sb = getSupabase();
    if (!sb) return;
    try {
      const { error } = await sb.from('external_translators').delete().eq('id', extId);
      if (error) throw error;
      setExternals(prev => prev.filter(e => e.id !== extId));
      setEditExternals(prev => { const next = { ...prev }; delete next[extId]; return next; });
      showToast('Traducteur externe supprimé', 'success');
    } catch (e: any) {
      showToast(`Erreur : ${e?.message || 'Inconnue'}`, 'error');
    }
  }

  // ── Section 3 : chargement config
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
        const c = emptyTagConfig();
        for (const row of (data ?? []) as any[]) {
          if (row.tag_type === 'translator') continue;
          if (row.label_key && (SECTIONS as string[]).includes(row.tag_type)) {
            const s = row.tag_type as Section;
            c[s][row.label_key] = { id: row.id, discordTagId: row.discord_tag_id ?? '' };
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

  // ── Fonctions Section 3
  const setSlot = (section: Section, key: string, value: string) => {
    setCfg(prev => ({
      ...prev,
      [section]: { ...prev[section], [key]: { ...prev[section][key], discordTagId: value } },
    }));
  };

  const addFree = () => {
    const k = uid();
    setCfg(prev => ({ ...prev, others: [...prev.others, { name: '', discordTagId: '', _k: k }] }));
  };

  const setFree = (k: string, field: 'name' | 'discordTagId', value: string) => {
    setCfg(prev => ({
      ...prev,
      others: prev.others.map((o: FreeTag) => o._k === k ? { ...o, [field]: value } : o),
    }));
  };

  const delFree = (k: string) => {
    setCfg(prev => ({ ...prev, others: prev.others.filter(o => o._k !== k) }));
    const id = cfg.others.find(o => o._k === k)?.id;
    if (id) setDelIds(prev => [...prev, id]);
  };

  /** Appelle l'API création des tags fixes. Retourne true si succès. */
  async function createFixedTagsApi(): Promise<boolean> {
    const forumChannelId = (selKind === 'profile' ? editMappings[selId!]?.forum_channel_id : editExternals[selId!]?.forum_channel_id)?.trim();
    const raw = (localStorage.getItem('apiBase') || apiUrl || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
    const baseUrl = raw.replace(/\/api\/forum-post\/?$/, '') || raw;
    const apiKey = localStorage.getItem('apiKey') || '';
    if (!forumChannelId || !baseUrl || !apiKey) return false;
    const res = await apiFetch(`${baseUrl}/api/forum-tags/sync`, apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forum_id: forumChannelId }),
    });
    const data = await res.json().catch(() => ({}));
    return !!(res.ok && data.ok);
  }

  /** Récupère les tags du salon via l'API et applique le mapping (prédéfinis + tags libres par nom). Retourne { ok, updatesCount, othersMatched }. */
  async function fetchAndMapTags(): Promise<{ ok: boolean; updatesCount: number; othersMatched: number }> {
    const forumChannelId = (selKind === 'profile' ? editMappings[selId!]?.forum_channel_id : editExternals[selId!]?.forum_channel_id)?.trim();
    const raw = (localStorage.getItem('apiBase') || apiUrl || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
    const baseUrl = raw.replace(/\/api\/forum-post\/?$/, '') || raw;
    const apiKey = localStorage.getItem('apiKey') || '';
    if (!forumChannelId || !baseUrl || !apiKey) return { ok: false, updatesCount: 0, othersMatched: 0 };
    const res = await apiFetch(`${baseUrl}/api/forum-tags?forum_id=${encodeURIComponent(forumChannelId)}`, apiKey);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, updatesCount: 0, othersMatched: 0 };
    const tags: { id: string; name: string }[] = data.tags || [];
    const updates: { section: Section; key: string; discordTagId: string }[] = [];
    const matchedTagIds = new Set<string>();
    for (const tag of tags) {
      const nameNorm = (tag.name || '').toLowerCase().trim();
      if (!nameNorm) continue;
      for (const { section, key, aliases } of DISCORD_TAG_ALIASES) {
        if (aliases.some(a => nameNorm === a || nameNorm.includes(a) || a.includes(nameNorm))) {
          updates.push({ section, key, discordTagId: tag.id });
          matchedTagIds.add(tag.id);
          break;
        }
      }
    }
    setCfg(prev => {
      const next = { ...prev };
      for (const u of updates) {
        next[u.section] = { ...next[u.section], [u.key]: { ...(next[u.section] as Record<string, Slot>)[u.key], discordTagId: u.discordTagId } };
      }
      for (const tag of tags) {
        if (matchedTagIds.has(tag.id)) continue;
        const nameNorm = (tag.name || '').trim().toLowerCase();
        const idx = prev.others.findIndex(o => (o.name || '').trim().toLowerCase() === nameNorm);
        if (idx >= 0) {
          next.others = next.others.map((o, i) => i === idx ? { ...o, discordTagId: tag.id } : o);
        }
      }
      return next;
    });
    const othersMatched = tags.filter(t => !matchedTagIds.has(t.id)).filter(t => cfg.others.some(o => (o.name || '').trim().toLowerCase() === (t.name || '').trim().toLowerCase())).length;
    return { ok: true, updatesCount: updates.length, othersMatched };
  }

  /** Un seul bouton : crée les tags fixes sur Discord puis récupère les ID. Overlay pendant toute l'opération. */
  async function handleGenerateTags() {
    const forumChannelId = (selKind === 'profile' ? editMappings[selId!]?.forum_channel_id : editExternals[selId!]?.forum_channel_id)?.trim();
    if (!forumChannelId) {
      showToast('Configurez d\'abord un Salon Discord (ID) dans le Routing des Traducteurs.', 'error');
      return;
    }
    const raw = (localStorage.getItem('apiBase') || apiUrl || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
    const baseUrl = raw.replace(/\/api\/forum-post\/?$/, '') || raw;
    if (!baseUrl) {
      showToast('URL de l\'API non configurée', 'error');
      return;
    }
    if (!localStorage.getItem('apiKey')) {
      showToast('Clé API non configurée', 'error');
      return;
    }
    setGeneratingTagsLoading(true);
    try {
      const createOk = await createFixedTagsApi();
      if (!createOk) {
        showToast('Erreur lors de la création des tags sur Discord.', 'error');
        return;
      }
      const { ok, updatesCount, othersMatched } = await fetchAndMapTags();
      if (ok) {
        const total = updatesCount + othersMatched;
        showToast(total > 0 ? `Tags générés et ${total} ID récupéré(s). Pensez à sauvegarder.` : 'Tags générés sur Discord. Récupérez les ID si besoin.', 'success');
      } else {
        showToast('Tags créés sur Discord mais récupération des ID a échoué. Utilisez « Récupérer les tags ».', 'warning');
      }
    } catch (e: any) {
      showToast(e?.message || 'Erreur lors de la génération des tags', 'error');
    } finally {
      setGeneratingTagsLoading(false);
    }
  }

  /** Récupère les tags du salon Discord et remplit les champs (prédéfinis + tags libres par nom). */
  async function syncTagsFromDiscord() {
    const forumChannelId = (selKind === 'profile' ? editMappings[selId!]?.forum_channel_id : editExternals[selId!]?.forum_channel_id)?.trim();
    if (!forumChannelId) {
      showToast('Configurez d\'abord un Salon Discord (ID) dans le Routing des Traducteurs pour ce traducteur.', 'error');
      return;
    }
    const raw = (localStorage.getItem('apiBase') || apiUrl || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
    const baseUrl = raw.replace(/\/api\/forum-post\/?$/, '') || raw;
    if (!baseUrl) {
      showToast('URL de l\'API non configurée', 'error');
      return;
    }
    if (!localStorage.getItem('apiKey')) {
      showToast('Clé API non configurée', 'error');
      return;
    }
    setSyncFromDiscordLoading(true);
    try {
      const { ok, updatesCount, othersMatched } = await fetchAndMapTags();
      if (ok) {
        const total = updatesCount + othersMatched;
        showToast(
          total > 0
            ? `${total} tag(s) Discord mappé(s) (dont ${othersMatched} tag(s) libre(s) par nom). Pensez à sauvegarder.`
            : 'Aucun tag Discord ne correspond aux slots. Créez les tags sur Discord (ou « Générer les tags ») puis réessayez.',
          total > 0 ? 'success' : 'info'
        );
      } else {
        showToast('Erreur lors de la récupération des tags.', 'error');
      }
    } catch (e: any) {
      showToast(e?.message || 'Erreur lors de la récupération des tags', 'error');
    } finally {
      setSyncFromDiscordLoading(false);
    }
  }

  async function handleSave() {
    const sb = getSupabase();
    if (!sb || loadingCfg || !selId) return;
    setSaving(true);
    try {
      for (const s of SECTIONS) {
        for (const { key } of PREDEFINED[s]) {
          const slot = cfg[s][key];
          const existingId = slot.id;
          if (slot.discordTagId.trim()) {
            const payload = {
              name: PREDEFINED[s].find(p => p.key === key)?.label ?? key,
              discord_tag_id: slot.discordTagId,
              tag_type: s,
              label_key: key,
              ...(selKind === 'profile' ? { profile_id: selId } : { external_translator_id: selId }),
            };
            if (existingId) {
              await sb.from('tags').update(payload).eq('id', existingId);
            } else {
              const { data } = await sb.from('tags').insert(payload).select('id').single();
              if (data) setCfg(prev => ({ ...prev, [s]: { ...prev[s], [key]: { ...prev[s][key], id: data.id } } }));
            }
          } else if (existingId) {
            await sb.from('tags').delete().eq('id', existingId);
            setCfg(prev => ({ ...prev, [s]: { ...prev[s], [key]: { discordTagId: '' } } }));
          }
        }
      }
      for (const o of cfg.others) {
        const payload = {
          name: o.name.trim(),
          discord_tag_id: o.discordTagId.trim() || null,
          tag_type: 'other',
          ...(selKind === 'profile' ? { profile_id: selId } : { external_translator_id: selId }),
        };
        if (o.name.trim() && o.discordTagId.trim()) {
          if (o.id) {
            await sb.from('tags').update(payload).eq('id', o.id);
          } else {
            const { data } = await sb.from('tags').insert(payload).select('id').single();
            if (data) setCfg(prev => ({
              ...prev,
              others: prev.others.map(x => x._k === o._k ? { ...x, id: data.id } : x),
            }));
          }
        } else if (o.id) {
          await sb.from('tags').delete().eq('id', o.id);
        }
      }
      if (delIds.length) {
        await sb.from('tags').delete().in('id', delIds);
        setDelIds([]);
      }
      showToast('Tags sauvegardés', 'success');
    } catch (e: any) {
      showToast(`Erreur : ${e?.message || 'Inconnue'}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  const selEntry = translators.find(t => t.id === selId && t.kind === selKind);

  // ─── Rendu ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--modal-backdrop)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999, backdropFilter: 'var(--modal-backdrop-blur)',
    }}>
      <div style={{
        position: 'relative',
        background: 'var(--panel)', width: '90%', maxWidth: 900, height: '88vh',
        borderRadius: 14, border: '1px solid var(--border)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>

        {/* ── Header */}
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text)' }}>🏷️ Gestion des Tags</h2>
        </div>

        {/* ── Body avec scroll */}
        <div className="styled-scrollbar" style={{
          flex: 1, overflowY: 'auto', padding: '20px 24px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>

          {/* ══ SECTION 1 : Tags Traducteurs ══ */}
          <div style={sectionBox}>
            <div style={sectionHead} onClick={() => setOpenSection(openSection === 's1' ? null : 's1')}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>👤 Tags Traducteurs</span>
              <span style={{
                fontSize: 20, color: 'var(--muted)', fontWeight: 300,
                transform: openSection === 's1' ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s', display: 'inline-block', lineHeight: 1,
              }}>›</span>
            </div>
            {openSection === 's1' && (
              <div className="styled-scrollbar" style={{ padding: 20, overflowY: 'auto', maxHeight: 300 }}>
                <button onClick={() => { setEditingTagId(null); setShowTagModal(true); }} style={{
                  padding: '9px 16px', borderRadius: 10,
                  background: 'var(--accent)', color: '#fff', border: 'none',
                  cursor: 'pointer', fontWeight: 700, fontSize: 13, marginBottom: 16,
                }}>➕ Ajouter Tag Traducteur</button>

                {loadingTranslatorTags ? (
                  <p style={{ color: 'var(--muted)', fontSize: 14 }}>Chargement…</p>
                ) : translatorTags.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: 13 }}>Aucun tag translator.</p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {translatorTags.map(tag => (
                      <div key={tag.id} style={{
                        flex: '0 1 calc(33.333% - 10px)',
                        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 13px',
                        border: '1px solid var(--border)', borderRadius: 10,
                        background: 'rgba(255,255,255,0.03)',
                      }}>
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag.name}</span>
                        <button
                          onClick={() => { setEditingTagId(tag.id); setShowTagModal(true); }}
                          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: '2px 4px', fontSize: 13 }}
                          title="Modifier le nom"
                        >✏️</button>
                        <button
                          onClick={() => handleDeleteTag(tag.id)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 4px', fontSize: 13 }}
                          title="Supprimer"
                        >🗑️</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ══ SECTION 2 : Routing des Traducteurs ══ */}
          <div style={sectionBox}>
            <div style={sectionHead} onClick={() => setOpenSection(openSection === 's2' ? null : 's2')}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>🗺️ Routing des Traducteurs</span>
              <span style={{
                fontSize: 20, color: 'var(--muted)', fontWeight: 300,
                transform: openSection === 's2' ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s', display: 'inline-block', lineHeight: 1,
              }}>›</span>
            </div>
            {openSection === 's2' && (
              <div className="styled-scrollbar" style={{ padding: 20, overflowY: 'auto', maxHeight: 420 }}>
                {loadingAll ? (
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>Chargement…</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                    {/* En-têtes */}
                    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr 1fr 90px 40px', gap: 10, padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                      {['Traducteur', 'Tag', 'Salon Discord (ID)', 'Concordance Formulaire', 'Action', ''].map(h => (
                        <span key={h} style={colHdr}>{h}</span>
                      ))}
                    </div>

                    {/* Utilisateurs inscrits */}
                    {allProfiles.length > 0 && (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', padding: '4px 14px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          👤 Utilisateurs inscrits
                        </div>
                        {allProfiles.map(p => (
                          <MappingRowItem
                            key={p.id}
                            label={p.pseudo || '—'}
                            hasMapping={mappings.some(m => m.profile_id === p.id)}
                            edit={editMappings[p.id] ?? { tag_id: '', forum_channel_id: '', list_form_traducteur: '' }}
                            tags={translatorTags.map(t => ({ id: t.id, name: t.name }))}
                            traducteurOptions={f95TraducteurOptions}
                            onEditChange={(field, val) => setEditMappings(prev => ({
                              ...prev,
                              [p.id]: { ...(prev[p.id] ?? { tag_id: '', forum_channel_id: '', list_form_traducteur: '' }), [field]: val }
                            }))}
                            onSave={() => saveMapping(p.id)}
                            onDelete={() => deleteMapping(p.id)}
                          />
                        ))}
                      </>
                    )}
                    {allProfiles.length === 0 && (
                      <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', padding: '8px 14px' }}>Aucun utilisateur inscrit.</div>
                    )}

                    {/* Traducteurs externes */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px 4px', marginTop: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        🔧 Traducteurs externes
                      </span>
                      <button type="button" onClick={() => setAddingExternal(v => !v)} style={{
                        padding: '5px 12px', borderRadius: 8,
                        border: '1px dashed rgba(99,102,241,0.5)',
                        background: 'rgba(99,102,241,0.08)', color: 'var(--accent)',
                        cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      }}>
                        {addingExternal ? '✕ Annuler' : '＋ Ajouter'}
                      </button>
                    </div>

                    {addingExternal && (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', borderRadius: 10, border: '1px dashed rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.05)' }}>
                        <input
                          type="text" value={newExtName}
                          onChange={e => setNewExtName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAddExternal()}
                          placeholder="Nom du traducteur (ex: JohnDoe)"
                          style={{ ...inputStyle, flex: 1 }}
                          autoFocus
                        />
                        <button type="button" onClick={handleAddExternal} disabled={!newExtName.trim()} style={{
                          padding: '10px 16px', borderRadius: 8, border: 'none',
                          background: newExtName.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                          color: newExtName.trim() ? '#fff' : 'var(--muted)',
                          cursor: newExtName.trim() ? 'pointer' : 'not-allowed',
                          fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap',
                        }}>Créer</button>
                      </div>
                    )}

                    {externals.length === 0 && !addingExternal && (
                      <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', padding: '4px 14px 8px' }}>
                        Aucun traducteur externe. Cliquez sur « Ajouter » pour en créer un.
                      </div>
                    )}

                    {externals.map(ext => (
                      <MappingRowItem
                        key={ext.id}
                        label={ext.name}
                        hasMapping={!!(editExternals[ext.id]?.forum_channel_id?.trim())}
                        edit={editExternals[ext.id] ?? { tag_id: '', forum_channel_id: '', list_form_traducteur: '' }}
                        tags={translatorTags.map(t => ({ id: t.id, name: t.name }))}
                        traducteurOptions={f95TraducteurOptions}
                        onEditChange={(field, val) => setEditExternals(prev => ({
                          ...prev,
                          [ext.id]: { ...(prev[ext.id] ?? { tag_id: '', forum_channel_id: '', list_form_traducteur: '' }), [field]: val }
                        }))}
                        onSave={() => saveExternal(ext.id)}
                        onDelete={() => deleteExternal(ext.id)}
                        isExternal
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ══ SECTION 3 : Gestion des Tags Secondaires ══ */}
          <div style={sectionBox}>
            <div style={sectionHead} onClick={() => setOpenSection(openSection === 's3' ? null : 's3')}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>🏷️ Gestion des Tags Secondaires</span>
              <span style={{
                fontSize: 20, color: 'var(--muted)', fontWeight: 300,
                transform: openSection === 's3' ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s', display: 'inline-block', lineHeight: 1,
              }}>›</span>
            </div>
            {openSection === 's3' && (
              <div className="styled-scrollbar" style={{ overflowY: 'auto', maxHeight: 520 }}>
                <div style={{ display: 'flex', height: 520 }}>

                  {/* Panneau gauche : sélecteur traducteur */}
                  <div className="styled-scrollbar" style={{
                    width: 190, borderRight: '1px solid var(--border)',
                    overflowY: 'auto', padding: '10px 8px', flexShrink: 0,
                    display: 'flex', flexDirection: 'column', gap: 2,
                  }}>
                    {loadingAll ? (
                      <p style={{ fontSize: 13, color: 'var(--muted)', padding: '0 10px' }}>Chargement…</p>
                    ) : (
                      <>
                        {translators.some(t => t.kind === 'profile') && (
                          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', padding: '4px 10px', margin: '4px 0 2px', textTransform: 'uppercase', letterSpacing: 0.5 }}>👤 Inscrits</p>
                        )}
                        {translators.filter(t => t.kind === 'profile').map(t => (
                          <button key={t.id} onClick={() => { setSelId(t.id); setSelKind('profile'); }} style={{
                            padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
                            fontSize: 13, fontWeight: selId === t.id ? 600 : 400, transition: 'all 0.15s',
                            background: selId === t.id ? 'rgba(99,102,241,0.18)' : 'transparent',
                            color: selId === t.id ? 'var(--accent)' : 'var(--text)',
                            borderLeft: `2px solid ${selId === t.id ? 'var(--accent)' : 'transparent'}`,
                          }}>{t.name}</button>
                        ))}

                        {translators.some(t => t.kind === 'external') && (
                          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', padding: '4px 10px', margin: '10px 0 2px', textTransform: 'uppercase', letterSpacing: 0.5 }}>🔧 Externes</p>
                        )}
                        {translators.filter(t => t.kind === 'external').map(t => (
                          <button key={t.id} onClick={() => { setSelId(t.id); setSelKind('external'); }} style={{
                            padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
                            fontSize: 13, fontWeight: selId === t.id ? 600 : 400, transition: 'all 0.15s',
                            background: selId === t.id ? 'rgba(255,200,74,0.15)' : 'transparent',
                            color: selId === t.id ? '#ffc84a' : 'var(--text)',
                            borderLeft: `2px solid ${selId === t.id ? '#ffc84a' : 'transparent'}`,
                          }}>{t.name}</button>
                        ))}

                        {translators.length === 0 && (
                          <p style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', padding: '0 10px' }}>Aucun traducteur</p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Panneau droit : éditeur de tags */}
                  <div className="styled-scrollbar" style={{
                    flex: 1, overflowY: 'auto', padding: 16,
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
                        {/* Titre + bouton sync Discord */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 18 }}>{selKind === 'external' ? '🔧' : '👤'}</span>
                          <div>
                            <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text)' }}>{selEntry?.name}</h4>
                            <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
                              {selKind === 'external' ? 'Traducteur externe' : 'Utilisateur inscrit'} — Tags secondaires
                            </p>
                          </div>
                          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            {(selKind === 'profile' ? editMappings[selId]?.forum_channel_id : editExternals[selId]?.forum_channel_id)?.trim() && (
                              <>
                                <button
                                  type="button"
                                  onClick={handleGenerateTags}
                                  disabled={generatingTagsLoading}
                                  style={{
                                    padding: '6px 14px', borderRadius: 8, border: '1px solid var(--accent)',
                                    background: 'rgba(99,102,241,0.12)', color: 'var(--accent)', fontWeight: 600, fontSize: 12,
                                    cursor: generatingTagsLoading ? 'not-allowed' : 'pointer',
                                  }}
                                  title="Créer les tags fixes sur le salon Discord puis récupérer les ID automatiquement"
                                >
                                  {generatingTagsLoading ? '⏳…' : '📤 Générer les tags'}
                                </button>
                                <button
                                  type="button"
                                  onClick={syncTagsFromDiscord}
                                  disabled={syncFromDiscordLoading || generatingTagsLoading}
                                  style={{
                                    padding: '6px 14px', borderRadius: 8, border: '1px solid var(--accent)',
                                    background: 'rgba(99,102,241,0.12)', color: 'var(--accent)', fontWeight: 600, fontSize: 12,
                                    cursor: syncFromDiscordLoading || generatingTagsLoading ? 'not-allowed' : 'pointer',
                                  }}
                                  title="Récupérer les ID Discord (prédéfinis + tags libres par correspondance de nom). Utile après avoir ajouté un tag libre sur Discord."
                                >
                                  {syncFromDiscordLoading ? '⏳ Sync…' : '🔄 Récupérer les ID (tags libres)'}
                                </button>
                              </>
                            )}
                            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', fontWeight: 600 }}>
                              {cfg.others.length
                                + Object.values(cfg.translationType).filter(s => s.discordTagId).length
                                + Object.values(cfg.gameStatus).filter(s => s.discordTagId).length
                                + Object.values(cfg.sites).filter(s => s.discordTagId).length
                              } tag(s) configuré(s)
                            </span>
                          </div>
                        </div>

                        {/* Sections prédéfinies */}
                        {(['translationType', 'gameStatus', 'sites'] as Section[]).map(s => (
                          <div key={s} style={{ ...sectionStyle, padding: '12px 14px' }}>
                            <h5 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{SECTION_TITLES[s]}</h5>
                            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '8px 14px', alignItems: 'center' }}>
                              <span style={colHdr}>Label</span>
                              <span style={colHdr}>ID Discord du tag</span>
                              {PREDEFINED[s].map(({ key, label }) => (
                                <Fragment key={key}>
                                  <label style={{ fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {label}
                                    {cfg[s][key]?.discordTagId && (
                                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, display: 'inline-block' }} />
                                    )}
                                  </label>
                                  <input
                                    value={cfg[s][key]?.discordTagId ?? ''}
                                    onChange={e => setSlot(s, key, e.target.value)}
                                    placeholder="ex: 1234567890123456789"
                                    style={inputStyle}
                                  />
                                </Fragment>
                              ))}
                            </div>
                          </div>
                        ))}

                        {/* Tags libres */}
                        <div style={{ ...sectionStyle, padding: '12px 14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h5 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>📦 Tags libres</h5>
                            <button onClick={addFree} style={{
                              padding: '5px 12px', borderRadius: 8,
                              border: '1px dashed rgba(99,102,241,0.5)',
                              background: 'rgba(99,102,241,0.08)', color: 'var(--accent)',
                              cursor: 'pointer', fontSize: 12, fontWeight: 700,
                            }}>➕ Ajouter Tag Libre</button>
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
                                  <input value={o.name} onChange={e => setFree(o._k, 'name', e.target.value)} placeholder="Ex: VF Complète…" style={inputStyle} />
                                  <input value={o.discordTagId} onChange={e => setFree(o._k, 'discordTagId', e.target.value)} placeholder="ID Discord du tag…" style={inputStyle} />
                                  <button onClick={() => delFree(o._k)} style={{
                                    height: 36, width: 36, borderRadius: 8, border: 'none',
                                    background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                                    cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}>🗑️</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>{/* fin body */}

        {/* ── Footer */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid var(--border)',
          flexShrink: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10,
        }}>
          <button onClick={onClose} style={{
            padding: '10px 28px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text)', cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}>↩️ Fermer</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '10px 32px', borderRadius: 10, border: 'none',
            background: saving ? 'rgba(99,102,241,0.4)' : 'var(--accent)',
            color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 14, fontWeight: 700,
          }}>
            {saving ? '⏳ Sauvegarde…' : '💾 Sauvegarder'}
          </button>
        </div>

        {/* Modale pour tag translator */}
        <TagEditorModal
          isOpen={showTagModal}
          onClose={() => setShowTagModal(false)}
          initialName={editingTagId ? translatorTags.find(t => t.id === editingTagId)?.name || '' : ''}
          onSave={handleCreateOrUpdateTag}
          title={editingTagId ? 'Modifier Tag Translator' : 'Créer Tag Translator'}
        />

        {/* Overlay "en cours" pendant génération des tags (création + récupération ID) */}
        {generatingTagsLoading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 14,
            zIndex: 10,
          }}>
            <div style={{ textAlign: 'center', color: 'var(--text)', fontSize: 16, fontWeight: 600 }}>
              <div style={{ marginBottom: 12 }}>⏳ Génération des tags en cours…</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>Création sur Discord puis récupération des ID</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
