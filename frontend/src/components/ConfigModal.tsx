declare global {
  interface Window { __TAURI__?: any; }
}

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConfirm } from '../hooks/useConfirm';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { getSupabase } from '../lib/supabase';
import { useApp } from '../state/appContext';
import type { Profile } from '../state/authContext';
import { useAuth } from '../state/authContext';
import ConfirmModal from './ConfirmModal';
import { useToast } from './ToastProvider';

// ─── Types ────────────────────────────────────────────────────────────────────
type WindowState = 'normal' | 'maximized' | 'fullscreen' | 'minimized';
type Tab = 'preferences' | 'account' | 'admin';
type ProfilePublic = Pick<Profile, 'id' | 'pseudo' | 'discord_id'>;

type MappingRow = {
  id: string;
  profile_id: string;
  tag_id: string;
  forum_channel_id: string;
};

// Traducteur externe : géré directement dans external_translators (pas de FK profiles)
type ExternalTranslator = {
  id: string;       // UUID Supabase
  name: string;
  tag_id: string;
  forum_channel_id: string;
};

// ─── Constantes ───────────────────────────────────────────────────────────────
const STORAGE_KEY_MASTER_ADMIN = 'discord-publisher:master-admin-code';

const getSupabaseConfig = () => ({
  url: (typeof import.meta?.env?.VITE_SUPABASE_URL === 'string' ? import.meta.env.VITE_SUPABASE_URL : '').trim(),
  anonKey: (typeof import.meta?.env?.VITE_SUPABASE_ANON_KEY === 'string' ? import.meta.env.VITE_SUPABASE_ANON_KEY : '').trim(),
});
const getMasterAdminCodeEnv = (): string =>
  (typeof import.meta?.env?.VITE_MASTER_ADMIN_CODE === 'string' ? import.meta.env.VITE_MASTER_ADMIN_CODE : '') || '';

// ─── Styles communs ───────────────────────────────────────────────────────────
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
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 14, color: 'var(--muted)', fontWeight: 500,
};
const gridStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start',
};
const fullWidthStyle: React.CSSProperties = { gridColumn: '1 / -1' };

// ─── Sous-composant MappingRowItem ────────────────────────────────────────────
interface MappingRowProps {
  label: string;
  hasMapping: boolean;
  edit: { tag_id: string; forum_channel_id: string };
  tags: { id?: string; name: string }[];
  onEditChange: (field: 'tag_id' | 'forum_channel_id', val: string) => void;
  onSave: () => void;
  onDelete: () => void;
  isExternal?: boolean;
}

function MappingRowItem({ label, hasMapping, edit, tags, onEditChange, onSave, onDelete, isExternal }: MappingRowProps) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '180px 1fr 1fr 90px 40px',
      gap: 10, alignItems: 'center',
      padding: '8px 14px', borderRadius: 10,
      border: `1px solid ${hasMapping ? 'rgba(74,158,255,0.28)' : 'var(--border)'}`,
      background: hasMapping ? 'rgba(74,158,255,0.05)' : isExternal ? 'rgba(255,200,74,0.03)' : 'transparent',
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

      <button type="button" onClick={onSave} style={{
        padding: '7px 0', borderRadius: 8, border: 'none',
        background: 'rgba(74,158,255,0.18)', color: '#4a9eff',
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

// ─── Props ────────────────────────────────────────────────────────────────────
interface ConfigModalProps {
  onClose?: () => void;
  onOpenLogs?: () => void;
}

export default function ConfigModal({ onClose, onOpenLogs }: ConfigModalProps) {
  const { showToast } = useToast();
  const { profile, user, refreshProfile } = useAuth();
  const {
    templates, savedTags, savedInstructions, allVarsConfig,
    publishedPosts, importFullConfig, setApiBaseFromSupabase, clearAllAppData
  } = useApp();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  // ─── Onglet actif ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('preferences');

  // ─── Préférences ──────────────────────────────────────────────────────────
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('apiKey') || '');
  const [defaultTranslationLabel, setDefaultTranslationLabel] = useState(
    () => localStorage.getItem('default_translation_label') || 'Traduction'
  );
  const [defaultModLabel, setDefaultModLabel] = useState(
    () => localStorage.getItem('default_mod_label') || 'Mod'
  );
  const [windowState, setWindowState] = useState<WindowState>(
    () => (localStorage.getItem('windowState') as WindowState) || 'maximized'
  );

  // ─── Mon compte ───────────────────────────────────────────────────────────
  const [allProfiles, setAllProfiles] = useState<ProfilePublic[]>([]);
  const [allowedEditorIds, setAllowedEditorIds] = useState<Set<string>>(new Set());
  const [editorsLoading, setEditorsLoading] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // ─── Administration : mappings (utilisateurs inscrits) ────────────────────
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [mappingsLoading, setMappingsLoading] = useState(false);
  const [editingMappings, setEditingMappings] = useState<
    Record<string, { tag_id: string; forum_channel_id: string }>
  >({});

  // ─── Administration : traducteurs externes ────────────────────────────────
  const [externals, setExternals] = useState<ExternalTranslator[]>([]);
  const [externalsLoading, setExternalsLoading] = useState(false);
  const [editingExternals, setEditingExternals] = useState<
    Record<string, { tag_id: string; forum_channel_id: string }>
  >({});
  const [newExtName, setNewExtName] = useState('');
  const [addingExternal, setAddingExternal] = useState(false);

  // ─── Administration : général ─────────────────────────────────────────────
  const [apiUrl, setApiUrl] = useState(
    () => localStorage.getItem('apiUrl') || localStorage.getItem('apiBase') || 'http://138.2.182.125:8080'
  );
  const [adminUnlocked, setAdminUnlocked] = useState(
    () => !!localStorage.getItem(STORAGE_KEY_MASTER_ADMIN)
  );
  const [adminCode, setAdminCode] = useState('');
  const [adminCodeError, setAdminCodeError] = useState<string | null>(null);
  const [adminCodeLoading, setAdminCodeLoading] = useState(false);
  const [checkingStored, setCheckingStored] = useState(false);
  const hasCheckedStoredRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  // ─── Vérification code mémorisé ───────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'admin' || adminUnlocked || hasCheckedStoredRef.current) return;
    const stored = localStorage.getItem(STORAGE_KEY_MASTER_ADMIN);
    if (!stored?.trim()) return;
    hasCheckedStoredRef.current = true;
    const validate = async () => {
      setCheckingStored(true);
      const trimmed = stored.trim();
      const { url, anonKey } = getSupabaseConfig();
      if (url && anonKey) {
        try {
          const res = await fetch(`${url.replace(/\/+$/, '')}/functions/v1/validate-master-admin-code`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: trimmed }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data?.valid === true) {
            setAdminUnlocked(true);
            void loadMappings();
            void loadExternals();
            window.dispatchEvent(new CustomEvent('masterAdminUnlocked'));
            setCheckingStored(false); return;
          }
          localStorage.removeItem(STORAGE_KEY_MASTER_ADMIN);
          setAdminCodeError('Code mémorisé révoqué. Saisissez le nouveau code.');
        } catch {
          setAdminUnlocked(true);
          void loadMappings();
          void loadExternals();
          window.dispatchEvent(new CustomEvent('masterAdminUnlocked'));
        }
      } else {
        const refEnv = getMasterAdminCodeEnv().trim();
        if (refEnv && trimmed === refEnv) {
          setAdminUnlocked(true);
          void loadMappings();
          void loadExternals();
          window.dispatchEvent(new CustomEvent('masterAdminUnlocked'));
        } else {
          localStorage.removeItem(STORAGE_KEY_MASTER_ADMIN);
          setAdminCodeError('Code mémorisé invalide.');
        }
      }
      setCheckingStored(false);
    };
    void validate();
  }, [activeTab, adminUnlocked]);

  // ─── Déverrouillage admin manuel ──────────────────────────────────────────
  const handleAdminUnlock = async () => {
    setAdminCodeError(null);
    const trimmed = adminCode.trim();
    if (!trimmed) { setAdminCodeError('Saisissez le code Master Admin.'); return; }
    const { url, anonKey } = getSupabaseConfig();
    setAdminCodeLoading(true);
    try {
      if (url && anonKey) {
        const base = url.replace(/\/+$/, '');
        const res = await fetch(`${base}/functions/v1/validate-master-admin-code`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: trimmed }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.valid === true) {
          localStorage.setItem(STORAGE_KEY_MASTER_ADMIN, trimmed);
          await _grantMasterAdmin(trimmed, base);
          setAdminUnlocked(true);
          void loadMappings();
          void loadExternals();
          window.dispatchEvent(new CustomEvent('masterAdminUnlocked'));
          setAdminCode(''); showToast('Accès administrateur déverrouillé', 'success'); return;
        }
        setAdminCodeError(
          data?.error === 'MASTER_ADMIN_CODE not configured'
            ? 'Code Master Admin non configuré côté Supabase.'
            : 'Code incorrect.'
        );
      } else {
        const refEnv = getMasterAdminCodeEnv().trim();
        if (!refEnv) { setAdminCodeError('VITE_MASTER_ADMIN_CODE non configuré dans .env.'); return; }
        if (trimmed !== refEnv) { setAdminCodeError('Code incorrect.'); return; }
        localStorage.setItem(STORAGE_KEY_MASTER_ADMIN, trimmed);
        setAdminUnlocked(true);
        void loadMappings();
        void loadExternals();
        window.dispatchEvent(new CustomEvent('masterAdminUnlocked'));
        setAdminCode(''); showToast('Accès administrateur déverrouillé', 'success');
      }
    } catch {
      const refEnv = getMasterAdminCodeEnv().trim();
      if (refEnv && trimmed === refEnv) {
        localStorage.setItem(STORAGE_KEY_MASTER_ADMIN, trimmed);
        setAdminUnlocked(true);
        void loadMappings();
        void loadExternals();
        window.dispatchEvent(new CustomEvent('masterAdminUnlocked'));
        setAdminCode(''); showToast('Accès administrateur déverrouillé (mode hors-ligne)', 'success');
      } else {
        setAdminCodeError('Impossible de joindre Supabase et code env incorrect.');
      }
    } finally { setAdminCodeLoading(false); }
  };

  const _grantMasterAdmin = async (code: string, base: string) => {
    const sb = getSupabase();
    if (!sb) return;
    try {
      // On rafraîchit la session pour être sûr d'avoir un token valide
      const { data: { session } } = await sb.auth.refreshSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${base}/functions/v1/grant-master-admin`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        // 1. Met à jour le profil local pour refléter le statut admin
        await refreshProfile();
        // 2. FORCE le chargement immédiat des données admin
        // Cela évite que la liste reste vide juste après le déverrouillage
        await Promise.all([
          loadMappings(),
          loadExternals()
        ]);
        showToast('Droits administrateur mis à jour', 'success');
      }
    } catch (err) {
      console.error('Erreur lors de l\'attribution des droits:', err);
    }
  };

  // ─── Mappings (utilisateurs inscrits) ─────────────────────────────────────
  const loadMappings = async () => {
    const sb = getSupabase();
    if (!sb) return;
    setMappingsLoading(true);
    try {
      const { data } = await sb
        .from('translator_forum_mappings')
        .select('id, profile_id, tag_id, forum_channel_id');
      const rows = (data ?? []) as MappingRow[];
      setMappings(rows);
      const init: Record<string, { tag_id: string; forum_channel_id: string }> = {};
      rows.forEach(r => { init[r.profile_id] = { tag_id: r.tag_id, forum_channel_id: r.forum_channel_id }; });
      setEditingMappings(init);
    } catch { showToast('Erreur chargement des mappings', 'error'); }
    finally { setMappingsLoading(false); }
  };

  const saveMapping = async (profileId: string) => {
    const sb = getSupabase();
    if (!sb) return;
    const edit = editingMappings[profileId];
    if (!edit?.tag_id || !edit?.forum_channel_id?.trim()) {
      showToast('Tag traducteur et salon forum requis', 'warning'); return;
    }
    const existing = mappings.find(m => m.profile_id === profileId);
    try {
      if (existing) {
        await sb.from('translator_forum_mappings')
          .update({ tag_id: edit.tag_id, forum_channel_id: edit.forum_channel_id.trim() })
          .eq('id', existing.id);
      } else {
        await sb.from('translator_forum_mappings')
          .insert({ profile_id: profileId, tag_id: edit.tag_id, forum_channel_id: edit.forum_channel_id.trim() });
      }
      showToast('Mapping sauvegardé', 'success');
      await loadMappings();
    } catch { showToast('Erreur lors de la sauvegarde', 'error'); }
  };

  const deleteMapping = async (profileId: string) => {
    const sb = getSupabase();
    if (!sb) return;
    const existing = mappings.find(m => m.profile_id === profileId);
    if (!existing) return;
    try {
      await sb.from('translator_forum_mappings').delete().eq('id', existing.id);
      showToast('Mapping supprimé', 'success');
      await loadMappings();
    } catch { showToast('Erreur lors de la suppression', 'error'); }
  };

  // ─── Traducteurs externes (table external_translators) ────────────────────
  const loadExternals = async () => {
    const sb = getSupabase();
    if (!sb) return;
    setExternalsLoading(true);
    try {
      const { data, error } = await sb
        .from('external_translators')
        .select('id, name, tag_id, forum_channel_id')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as ExternalTranslator[];
      setExternals(rows);
      const init: Record<string, { tag_id: string; forum_channel_id: string }> = {};
      rows.forEach(r => { init[r.id] = { tag_id: r.tag_id ?? '', forum_channel_id: r.forum_channel_id ?? '' }; });
      setEditingExternals(init);
    } catch { showToast('Erreur chargement des traducteurs externes', 'error'); }
    finally { setExternalsLoading(false); }
  };

  const handleAddExternal = async () => {
    const name = newExtName.trim();
    if (!name) return;
    if (externals.some(e => e.name.toLowerCase() === name.toLowerCase())) {
      showToast('Ce traducteur existe déjà', 'warning'); return;
    }
    const sb = getSupabase();
    if (!sb) return;
    try {
      const { data, error } = await sb
        .from('external_translators')
        .insert({ name, tag_id: null, forum_channel_id: '' })
        .select('id, name, tag_id, forum_channel_id')
        .single();
      if (error) throw error;
      const entry = data as ExternalTranslator;
      setExternals(prev => [...prev, entry]);
      setEditingExternals(prev => ({ ...prev, [entry.id]: { tag_id: '', forum_channel_id: '' } }));
      setNewExtName('');
      setAddingExternal(false);
      showToast('Traducteur externe créé', 'success');
    } catch { showToast('Erreur lors de la création', 'error'); }
  };

  const saveExternal = async (extId: string) => {
    const sb = getSupabase();
    if (!sb) return;
    const edit = editingExternals[extId];
    if (!edit?.forum_channel_id?.trim()) {
      showToast('Le salon forum est requis', 'warning'); return;
    }
    try {
      await sb.from('external_translators')
        .update({
          tag_id: edit.tag_id || null,
          forum_channel_id: edit.forum_channel_id.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', extId);
      showToast('Traducteur externe sauvegardé', 'success');
      await loadExternals();
    } catch { showToast('Erreur lors de la sauvegarde', 'error'); }
  };

  const deleteExternal = async (extId: string) => {
    const sb = getSupabase();
    if (!sb) return;
    try {
      await sb.from('external_translators').delete().eq('id', extId);
      setExternals(prev => prev.filter(e => e.id !== extId));
      setEditingExternals(prev => { const n = { ...prev }; delete n[extId]; return n; });
      showToast('Traducteur externe supprimé', 'success');
    } catch { showToast('Erreur lors de la suppression', 'error'); }
  };

  // ─── Sauvegarde auto préférences ──────────────────────────────────────────
  useEffect(() => { localStorage.setItem('apiKey', apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem('default_translation_label', defaultTranslationLabel); }, [defaultTranslationLabel]);
  useEffect(() => { localStorage.setItem('default_mod_label', defaultModLabel); }, [defaultModLabel]);

  // ─── Sauvegarde auto URL (admin) ──────────────────────────────────────────
  useEffect(() => {
    if (!adminUnlocked) return;
    const base = apiUrl.trim().replace(/\/+$/, '');
    if (!base) return;
    localStorage.setItem('apiUrl', base);
    localStorage.setItem('apiBase', base);
    setApiBaseFromSupabase(base);
    const sb = getSupabase();
    if (sb) {
      sb.from('app_config').upsert(
        { key: 'api_base_url', value: base, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      ).then(r => { if (r?.error) console.warn('app_config:', r.error.message); });
    }
  }, [apiUrl, adminUnlocked]);

  // ─── Éditeurs autorisés ───────────────────────────────────────────────────
  useEffect(() => {
    if (!['account', 'admin'].includes(activeTab) || !profile?.id) return;
    const sb = getSupabase();
    if (!sb) return;
    setEditorsLoading(true);
    (async () => {
      try {
        const { data: profilesData } = await sb.from('profiles').select('id, pseudo, discord_id');
        setAllProfiles((profilesData ?? []) as ProfilePublic[]);
        const { data: allowedData } = await sb.from('allowed_editors').select('editor_id').eq('owner_id', profile.id);
        setAllowedEditorIds(new Set((allowedData ?? []).map((r: { editor_id: string }) => r.editor_id)));
      } catch { setAllProfiles([]); setAllowedEditorIds(new Set()); }
      finally { setEditorsLoading(false); }
    })();
  }, [activeTab, profile?.id]);

  // ─── Rechargement automatique des données Admin ───────────────────────────
  useEffect(() => {
    // Si on est sur l'onglet admin et que c'est déjà déverrouillé, on rafraîchit
    if (activeTab === 'admin' && adminUnlocked) {
      void loadMappings();
      void loadExternals();
    }
  }, [activeTab, adminUnlocked]);

  const toggleEditor = async (editorId: string, currentlyAllowed: boolean) => {
    const sb = getSupabase();
    if (!sb || !profile?.id) return;
    if (currentlyAllowed) {
      const { error } = await sb.from('allowed_editors').delete().eq('owner_id', profile.id).eq('editor_id', editorId);
      if (error) { showToast('Erreur lors de la révocation', 'error'); return; }
      setAllowedEditorIds(prev => { const n = new Set(prev); n.delete(editorId); return n; });
      showToast('Autorisation révoquée', 'success');
    } else {
      const { error } = await sb.from('allowed_editors').insert({ owner_id: profile.id, editor_id: editorId });
      if (error) { showToast("Erreur lors de l'autorisation", 'error'); return; }
      setAllowedEditorIds(prev => new Set(prev).add(editorId));
      showToast('Utilisateur autorisé', 'success');
    }
  };

  // ─── Changement de mot de passe ───────────────────────────────────────────
  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) { showToast('Tous les champs sont obligatoires', 'error'); return; }
    if (newPassword.length < 6) { showToast('Minimum 6 caractères', 'error'); return; }
    if (newPassword !== confirmPassword) { showToast('Les mots de passe ne correspondent pas', 'error'); return; }
    if (oldPassword === newPassword) { showToast('Le nouveau mot de passe doit être différent', 'error'); return; }
    setIsChangingPassword(true);
    try {
      const sb = getSupabase();
      if (!sb) { showToast('Supabase non configuré', 'error'); return; }
      const { data: { user: u } } = await sb.auth.getUser();
      if (!u?.email) { showToast('Utilisateur non connecté', 'error'); return; }
      const { error: signInError } = await sb.auth.signInWithPassword({ email: u.email, password: oldPassword });
      if (signInError) { showToast('Ancien mot de passe incorrect', 'error'); return; }
      const { error: updateError } = await sb.auth.updateUser({ password: newPassword });
      if (updateError) { showToast(`Erreur : ${updateError.message}`, 'error'); return; }
      showToast('Mot de passe modifié avec succès', 'success');
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (e: any) { showToast(`Erreur : ${e.message || 'Inconnue'}`, 'error'); }
    finally { setIsChangingPassword(false); }
  };

  // ─── Suppression de compte ────────────────────────────────────────────────
  const handleDeleteAccount = async () => {
    if (!deletePassword) { showToast('Saisissez votre mot de passe pour confirmer', 'error'); return; }
    const sb = getSupabase();
    if (!sb || !user?.email) { showToast('Utilisateur non connecté', 'error'); return; }
    setIsDeletingAccount(true);
    try {
      const { error: signInError } = await sb.auth.signInWithPassword({ email: user.email, password: deletePassword });
      if (signInError) { showToast('Mot de passe incorrect', 'error'); return; }
      const confirmed = await confirm({
        title: '⚠️ Suppression définitive du compte',
        message:
          `Vous êtes sur le point de supprimer définitivement votre compte.\n\n` +
          `Seront supprimés :\n• Votre profil\n• Vos instructions\n• Vos templates\n• Vos autorisations d'édition\n\n` +
          `⚠️ Vos publications Discord restent visibles sur le serveur.\n\nCette action est IRRÉVERSIBLE.`,
        confirmText: 'Supprimer mon compte', cancelText: 'Annuler', type: 'danger'
      });
      if (!confirmed) return;
      const baseUrl = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || 'http://138.2.182.125:8080').replace(/\/+$/, '');
      const key = localStorage.getItem('apiKey') || '';
      const res = await fetch(`${baseUrl}/api/account/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': key, 'X-User-ID': user.id },
        body: JSON.stringify({ user_id: user.id })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { showToast(`Erreur : ${data.error || 'Inconnue'}`, 'error'); return; }
      showToast('Compte supprimé. Au revoir !', 'success');
      onClose?.();
      setTimeout(async () => {
        if (sb) await sb.auth.signOut();
        sessionStorage.removeItem('sessionActive');
        localStorage.removeItem('rememberMe');
      }, 1000);
    } catch (err: any) { showToast(`Erreur : ${err?.message || err}`, 'error'); }
    finally { setIsDeletingAccount(false); setDeletePassword(''); }
  };

  // ─── Fenêtre (Tauri) ──────────────────────────────────────────────────────
  const applyWindowStateLive = async (next: WindowState) => {
    try {
      if (!window.__TAURI__) return;
      let win: any = null;
      try {
        const wv: any = await import('@tauri-apps/api/webviewWindow');
        win = typeof wv.getCurrentWebviewWindow === 'function' ? wv.getCurrentWebviewWindow() : (wv.appWindow ?? null);
      } catch { }
      if (!win) {
        try {
          const w: any = await import('@tauri-apps/api/window');
          win = typeof w.getCurrentWindow === 'function' ? w.getCurrentWindow() : (w.appWindow ?? null);
        } catch { }
      }
      if (!win) return;
      if (next !== 'fullscreen' && typeof win.setFullscreen === 'function') {
        const isFs = typeof win.isFullscreen === 'function' ? await win.isFullscreen() : false;
        if (isFs) await win.setFullscreen(false);
      }
      if (next !== 'minimized' && typeof win.isMinimized === 'function') {
        const isMin = await win.isMinimized();
        if (isMin && typeof win.unminimize === 'function') await win.unminimize();
      }
      switch (next) {
        case 'fullscreen': await win.unmaximize?.(); await win.setFullscreen?.(true); break;
        case 'maximized': await win.maximize?.(); break;
        case 'normal': await win.unmaximize?.(); break;
        case 'minimized': await win.minimize?.(); break;
      }
    } catch (e) { console.error('Erreur état fenêtre:', e); }
  };

  const handleWindowStateChange = async (state: WindowState) => {
    setWindowState(state);
    await applyWindowStateLive(state);
    localStorage.setItem('windowState', state);
  };

  // ─── Export / Import / Nettoyage ──────────────────────────────────────────
  const handleExportConfig = () => {
    try {
      const blob = new Blob([JSON.stringify({
        apiUrl, apiBase: apiUrl, apiKey,
        templates, allVarsConfig, savedTags, savedInstructions, publishedPosts,
        windowState, defaultTranslationLabel, defaultModLabel,
        exportDate: new Date().toISOString(), version: '1.0'
      }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `backup_discord_generator_${Date.now()}.json`;
      a.click(); URL.revokeObjectURL(a.href);
      showToast('Sauvegarde téléchargée', 'success');
    } catch { showToast("Erreur lors de l'export", 'error'); }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const ok = await confirm({
      title: '⚠️ Importer une sauvegarde',
      message: 'Importer va écraser vos données actuelles (templates, tags, instructions, historique). Continuer ?',
      confirmText: 'Importer', cancelText: 'Annuler', type: 'danger'
    });
    if (!ok) return;
    try {
      const data = JSON.parse(await file.text());
      importFullConfig(data);
      setApiUrl(localStorage.getItem('apiUrl') || 'http://138.2.182.125:8080');
      setApiKey(localStorage.getItem('apiKey') || '');
      if (data.windowState) { setWindowState(data.windowState); void applyWindowStateLive(data.windowState); }
      if (data.defaultTranslationLabel) setDefaultTranslationLabel(data.defaultTranslationLabel);
      if (data.defaultModLabel) setDefaultModLabel(data.defaultModLabel);
      showToast('Sauvegarde importée avec succès !', 'success');
    } catch { showToast("Erreur lors de l'import (fichier invalide ?)", 'error'); }
  };

  const handleCleanupAllData = async () => {
    const ok = await confirm({
      title: 'Nettoyage complet des données',
      message: 'Supprimer toutes les données (publications, tags, config, autorisations) sur Supabase. Irréversible. Continuer ?',
      confirmText: 'Tout supprimer', type: 'danger'
    });
    if (!ok) return;
    const { ok: success, error } = await clearAllAppData(profile?.id);
    if (success) { showToast('Données nettoyées', 'success'); onClose?.(); }
    else showToast('Erreur : ' + (error ?? 'inconnue'), 'error');
  };

  // ─── Tabs ─────────────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'preferences', label: 'Préférences', icon: '⚙️' },
    { id: 'account', label: 'Mon compte', icon: '👤' },
    { id: 'admin', label: 'Administration', icon: '🛡️' },
  ];

  const translatorTags = savedTags.filter(t => t.tagType === 'translator');

  // ─── Rendu ────────────────────────────────────────────────────────────────
  const modalContent = (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--panel)', borderRadius: 14, width: '92%', maxWidth: 960, maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* En-tête */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>⚙️ Configuration</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: 28, cursor: 'pointer', lineHeight: 1, padding: 0 }}>&times;</button>
        </div>

        {/* Onglets */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, padding: '0 24px' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: '12px 20px', background: 'none', border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--muted)',
              cursor: 'pointer', fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400,
              display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.15s', marginBottom: -1,
            }}>
              <span>{tab.icon}</span>{tab.label}
              {tab.id === 'admin' && !adminUnlocked && <span style={{ fontSize: 10, opacity: 0.6 }}>🔒</span>}
            </button>
          ))}
        </div>

        {/* Contenu scrollable */}
        <div className="styled-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          {/* ══ PRÉFÉRENCES ═══════════════════════════════════════════════════ */}
          {activeTab === 'preferences' && (
            <div style={gridStyle}>
              <section style={sectionStyle}>
                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>🔑 Clé API</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={labelStyle}>Clé d'accès à l'API</label>
                  <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Votre clé secrète" style={inputStyle} />
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>🔒 Transmise par l'administrateur. Nécessaire pour publier.</p>
                </div>
              </section>

              <section style={sectionStyle}>
                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>🪟 Affichage de la fenêtre</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={labelStyle}>Mode d'affichage au démarrage</label>
                  <select value={windowState} onChange={e => handleWindowStateChange(e.target.value as WindowState)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="normal">🔲 Normal</option>
                    <option value="maximized">⬛ Maximisé</option>
                    <option value="fullscreen">🖥️ Plein écran</option>
                    <option value="minimized">➖ Minimisé</option>
                  </select>
                </div>
              </section>

              <section style={{ ...sectionStyle, ...fullWidthStyle }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>🏷️ Labels par défaut</h4>
                <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>Valeurs préservées lors de la réinitialisation du formulaire.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={labelStyle}>Label de traduction</label>
                    <input type="text" value={defaultTranslationLabel} onChange={e => setDefaultTranslationLabel(e.target.value)} placeholder="Traduction" style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={labelStyle}>Label de mod</label>
                    <input type="text" value={defaultModLabel} onChange={e => setDefaultModLabel(e.target.value)} placeholder="Mod" style={inputStyle} />
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ══ MON COMPTE ════════════════════════════════════════════════════ */}
          {activeTab === 'account' && (
            <div style={gridStyle}>
              {profile?.id && (
                <section style={{ ...sectionStyle, alignSelf: 'stretch', display: 'flex', flexDirection: 'column' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', flexShrink: 0 }}>👥 Qui peut modifier mes posts</h4>
                  <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5, flexShrink: 0 }}>
                    Cliquez sur un utilisateur pour autoriser ou révoquer son droit d'édition.<br />
                    <span style={{ color: '#9ca3af' }}>⚪ Gris</span> = Non autorisé &nbsp;•&nbsp;
                    <span style={{ color: '#10b981' }}>🟢 Vert</span> = Autorisé
                  </p>
                  {editorsLoading ? (
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>Chargement…</div>
                  ) : (
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {allProfiles.filter(p => p.id !== profile.id).map(p => {
                        const allowed = allowedEditorIds.has(p.id);
                        return (
                          <button key={p.id} type="button" onClick={() => toggleEditor(p.id, allowed)} style={{
                            padding: '11px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                            fontSize: 13, fontWeight: 600, textAlign: 'center', transition: 'all 0.2s', flexShrink: 0,
                            background: allowed ? 'rgba(16,185,129,0.15)' : 'rgba(156,163,175,0.15)',
                            color: allowed ? '#10b981' : '#9ca3af',
                          }}
                            onMouseEnter={e => { e.currentTarget.style.boxShadow = allowed ? '0 0 0 2px rgba(16,185,129,0.3)' : '0 0 0 2px rgba(156,163,175,0.3)'; }}
                            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
                          >
                            {allowed ? '🔓 ' : '🔒 '}{p.pseudo || '—'}
                          </button>
                        );
                      })}
                      {allProfiles.filter(p => p.id !== profile.id).length === 0 && (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>
                          Aucun autre utilisateur en base.
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              <section style={{ ...sectionStyle, gridColumn: profile?.id ? undefined : '1 / -1' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>🔐 Sécurité du compte</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Modifier votre mot de passe de connexion.</p>
                  {([
                    { label: 'Ancien mot de passe', val: oldPassword, set: setOldPassword },
                    { label: 'Nouveau mot de passe', val: newPassword, set: setNewPassword, hint: 'Minimum 6 caractères' },
                    { label: 'Confirmer le nouveau mot de passe', val: confirmPassword, set: setConfirmPassword },
                  ] as { label: string; val: string; set: (v: string) => void; hint?: string }[]).map(({ label, val, set, hint }) => (
                    <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label style={labelStyle}>{label}</label>
                      <input type="password" value={val} onChange={e => set(e.target.value)} placeholder="••••••••" style={inputStyle} />
                      {hint && <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>{hint}</p>}
                    </div>
                  ))}
                  <button type="button" onClick={handleChangePassword} disabled={isChangingPassword} style={{
                    padding: '12px 16px', background: 'var(--accent)', border: 'none', color: '#fff',
                    borderRadius: 10, cursor: isChangingPassword ? 'not-allowed' : 'pointer',
                    fontSize: 14, fontWeight: 700, opacity: isChangingPassword ? 0.6 : 1,
                  }}>
                    {isChangingPassword ? '🔄 Changement…' : '🔐 Changer le mot de passe'}
                  </button>
                </div>

                <div style={{ padding: 16, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>☠️ Zone de danger</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>Action irréversible</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                    Supprime votre profil, instructions, templates et autorisations. Vos publications Discord restent visibles.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ ...labelStyle, color: '#ef4444' }}>Mot de passe de confirmation</label>
                    <input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} placeholder="••••••••"
                      style={{ ...inputStyle, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.05)' }} />
                  </div>
                  <button type="button" onClick={handleDeleteAccount} disabled={isDeletingAccount || !deletePassword} style={{
                    padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: isDeletingAccount || !deletePassword ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.18)',
                    border: '1px solid rgba(239,68,68,0.4)',
                    color: isDeletingAccount || !deletePassword ? 'rgba(239,68,68,0.35)' : '#ef4444',
                    borderRadius: 8, cursor: isDeletingAccount || !deletePassword ? 'not-allowed' : 'pointer',
                    fontSize: 13, fontWeight: 700, transition: 'all 0.2s',
                  }}>
                    {isDeletingAccount ? '⏳ Suppression…' : '🗑️ Supprimer définitivement mon compte'}
                  </button>
                </div>
              </section>
            </div>
          )}

          {/* ══ ADMINISTRATION ════════════════════════════════════════════════ */}
          {activeTab === 'admin' && (
            adminUnlocked ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* URL API */}
                <section style={sectionStyle}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem' }}>🌐 URL de l'API</h4>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input type="text" value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="http://138.2.182.125:8080" style={{ ...inputStyle, flex: 1 }} />
                    <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Propagée via Supabase</span>
                  </div>
                </section>

                {/* Routing des traducteurs */}
                <section style={sectionStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem' }}>🗺️ Routing des traducteurs</h4>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Sans mapping → salon par défaut (<code>PUBLISHER_FORUM_TRAD_ID</code>)
                    </span>
                  </div>

                  {/* En-têtes colonnes */}
                  <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr 90px 40px', gap: 10, padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                    {['Traducteur', 'Tag', 'Salon Discord (ID)', 'Action', ''].map(h => (
                      <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</span>
                    ))}
                  </div>

                  {(mappingsLoading || externalsLoading) ? (
                    <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 14px' }}>Chargement…</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

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
                              edit={editingMappings[p.id] ?? { tag_id: '', forum_channel_id: '' }}
                              tags={translatorTags}
                              onEditChange={(field, val) => setEditingMappings(prev => ({
                                ...prev,
                                [p.id]: { ...(prev[p.id] ?? { tag_id: '', forum_channel_id: '' }), [field]: val }
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
                          🔧 Traducteurs externes (gérés par vous)
                        </span>
                        <button type="button" onClick={() => setAddingExternal(v => !v)} style={{
                          padding: '5px 12px', borderRadius: 8, border: '1px dashed rgba(74,158,255,0.5)',
                          background: 'rgba(74,158,255,0.08)', color: '#4a9eff',
                          cursor: 'pointer', fontSize: 12, fontWeight: 700,
                        }}>
                          {addingExternal ? '✕ Annuler' : '＋ Ajouter'}
                        </button>
                      </div>

                      {addingExternal && (
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', borderRadius: 10, border: '1px dashed rgba(74,158,255,0.35)', background: 'rgba(74,158,255,0.05)' }}>
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
                          }}>
                            Créer
                          </button>
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
                          hasMapping={!!(editingExternals[ext.id]?.forum_channel_id?.trim())}
                          edit={editingExternals[ext.id] ?? { tag_id: '', forum_channel_id: '' }}
                          tags={translatorTags}
                          onEditChange={(field, val) => setEditingExternals(prev => ({
                            ...prev,
                            [ext.id]: { ...(prev[ext.id] ?? { tag_id: '', forum_channel_id: '' }), [field]: val }
                          }))}
                          onSave={() => saveExternal(ext.id)}
                          onDelete={() => deleteExternal(ext.id)}
                          isExternal
                        />
                      ))}
                    </div>
                  )}
                </section>

                {/* Sauvegarde & restauration */}
                <section style={{ ...sectionStyle, background: 'rgba(74,158,255,0.04)', border: '1px solid rgba(74,158,255,0.18)' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem' }}>💾 Sauvegarde et restauration</h4>
                  <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} style={{ display: 'none' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    {[
                      { label: '📤 Exporter', desc: 'Télécharge un JSON complet', color: '#4a9eff', bg: 'rgba(74,158,255,0.14)', border: 'rgba(74,158,255,0.35)', onClick: handleExportConfig },
                      { label: '📥 Restaurer', desc: 'Importe depuis un fichier', color: '#4aff9e', bg: 'rgba(74,255,158,0.10)', border: 'rgba(74,255,158,0.3)', onClick: () => fileInputRef.current?.click() },
                      { label: '🗑️ Tout supprimer', desc: 'Efface Supabase + local (irréversible)', color: '#ef4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.35)', onClick: handleCleanupAllData },
                    ].map(({ label, desc, color, bg, border, onClick }) => (
                      <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button onClick={onClick} style={{ padding: '13px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: bg, border: `1px solid ${border}`, color, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                          {label}
                        </button>
                        <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, textAlign: 'center' }}>{desc}</p>
                      </div>
                    ))}
                  </div>
                </section>

              </div>
            ) : (
              /* Écran de verrouillage */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 48, lineHeight: 1 }}>🔒</div>
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>Accès restreint</h3>
                  <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                    Cet espace est réservé aux administrateurs.<br />Saisissez le code Master Admin pour continuer.
                  </p>
                </div>
                {checkingStored ? (
                  <p style={{ fontSize: 14, color: 'var(--muted)' }}>Vérification du code mémorisé…</p>
                ) : (
                  <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input
                      type="password" value={adminCode}
                      onChange={e => { setAdminCode(e.target.value); setAdminCodeError(null); }}
                      onKeyDown={e => e.key === 'Enter' && handleAdminUnlock()}
                      placeholder="Code Master Admin"
                      style={{ ...inputStyle, textAlign: 'center', letterSpacing: 4 }}
                      autoFocus
                    />
                    {adminCodeError && <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{adminCodeError}</p>}
                    <button type="button" onClick={handleAdminUnlock} disabled={adminCodeLoading || !adminCode.trim()} style={{
                      padding: '12px 20px', background: 'var(--accent)', border: 'none', color: '#fff',
                      borderRadius: 10, cursor: adminCodeLoading ? 'not-allowed' : 'pointer',
                      fontWeight: 700, fontSize: 14, opacity: adminCodeLoading ? 0.7 : 1,
                    }}>
                      {adminCodeLoading ? 'Vérification…' : 'Déverrouiller'}
                    </button>
                  </div>
                )}
              </div>
            )
          )}

        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ padding: '10px 28px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            Fermer
          </button>
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
    </div>
  );

  return createPortal(modalContent, document.body);
}
