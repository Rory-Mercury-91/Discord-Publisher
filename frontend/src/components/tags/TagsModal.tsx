import { useEffect, useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';
import { apiFetch } from '../../lib/api-helpers';
import { getSupabase } from '../../lib/supabase';
import { useApp } from '../../state/appContext';
import { useToast } from '../shared/ToastProvider';
import {
  DISCORD_TAG_ALIASES,
  emptyTagConfig,
  PREDEFINED,
  SECTIONS,
  type ExternalTranslator,
  type FreeTag,
  type MappingRow,
  type Section,
  type Slot,
  type TagConfig,
  type Translator,
  uid,
} from './tags-modal-constants';
import TagEditorModal from './components/TagEditorModal';
import TagsModalHeader from './components/TagsModalHeader';
import TagsModalFooter from './components/TagsModalFooter';
import TagsSectionAccordion from './components/TagsSectionAccordion';
import TagsSectionTranslators from './components/TagsSectionTranslators';
import TagsSectionRouting from './components/TagsSectionRouting';
import TagsSectionSecondary from './components/TagsSectionSecondary';

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

  return (
    <div className="tags-modal-backdrop">
      <div className="tags-modal-panel">
        <TagsModalHeader />

        <div className="tags-modal__body styled-scrollbar">
          <TagsSectionAccordion
            id="s1"
            title="👤 Tags Traducteurs"
            open={openSection === 's1'}
            onToggle={() => setOpenSection(openSection === 's1' ? null : 's1')}
          >
            <TagsSectionTranslators
              loading={loadingTranslatorTags}
              translatorTags={translatorTags}
              onAdd={() => {
                setEditingTagId(null);
                setShowTagModal(true);
              }}
              onEdit={(id) => {
                setEditingTagId(id);
                setShowTagModal(true);
              }}
              onDelete={handleDeleteTag}
            />
          </TagsSectionAccordion>

          <TagsSectionAccordion
            id="s2"
            title="🗺️ Routing des Traducteurs"
            open={openSection === 's2'}
            onToggle={() => setOpenSection(openSection === 's2' ? null : 's2')}
          >
            <TagsSectionRouting
              loadingAll={loadingAll}
              allProfiles={allProfiles}
              externals={externals}
              mappings={mappings}
              editMappings={editMappings}
              editExternals={editExternals}
              translatorTags={translatorTags}
              f95TraducteurOptions={f95TraducteurOptions}
              newExtName={newExtName}
              addingExternal={addingExternal}
              setNewExtName={setNewExtName}
              setAddingExternal={setAddingExternal}
              onEditMapping={(profileId, field, val) =>
                setEditMappings((prev) => ({
                  ...prev,
                  [profileId]: { ...(prev[profileId] ?? { tag_id: '', forum_channel_id: '', list_form_traducteur: '' }), [field]: val },
                }))
              }
              onEditExternal={(extId, field, val) =>
                setEditExternals((prev) => ({
                  ...prev,
                  [extId]: { ...(prev[extId] ?? { tag_id: '', forum_channel_id: '', list_form_traducteur: '' }), [field]: val },
                }))
              }
              saveMapping={saveMapping}
              deleteMapping={deleteMapping}
              saveExternal={saveExternal}
              deleteExternal={deleteExternal}
              handleAddExternal={handleAddExternal}
            />
          </TagsSectionAccordion>

          <TagsSectionAccordion
            id="s3"
            title="🏷️ Gestion des Tags Secondaires"
            open={openSection === 's3'}
            onToggle={() => setOpenSection(openSection === 's3' ? null : 's3')}
          >
            <TagsSectionSecondary
              loadingAll={loadingAll}
              loadingCfg={loadingCfg}
              translators={translators}
              selId={selId}
              selKind={selKind}
              cfg={cfg}
              editMappings={editMappings}
              editExternals={editExternals}
              generatingTagsLoading={generatingTagsLoading}
              syncFromDiscordLoading={syncFromDiscordLoading}
              onSelectTranslator={(id, kind) => {
                setSelId(id);
                setSelKind(kind);
              }}
              setSlot={setSlot}
              addFree={addFree}
              setFree={setFree}
              delFree={delFree}
              onGenerateTags={handleGenerateTags}
              onSyncTagsFromDiscord={syncTagsFromDiscord}
            />
          </TagsSectionAccordion>
        </div>

        <TagsModalFooter onClose={onClose ?? (() => {})} onSave={handleSave} saving={saving} />

        <TagEditorModal
          isOpen={showTagModal}
          onClose={() => setShowTagModal(false)}
          initialName={editingTagId ? translatorTags.find((t) => t.id === editingTagId)?.name ?? '' : ''}
          onSave={handleCreateOrUpdateTag}
          title={editingTagId ? 'Modifier Tag Translator' : 'Créer Tag Translator'}
        />

        {generatingTagsLoading && (
          <div className="tags-modal-overlay-loading">
            <div className="tags-modal-overlay-loading-text">
              <div>⏳ Génération des tags en cours…</div>
              <div className="tags-modal-overlay-loading-sub">Création sur Discord puis récupération des ID</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
