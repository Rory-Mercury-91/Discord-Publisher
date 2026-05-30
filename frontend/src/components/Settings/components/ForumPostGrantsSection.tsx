/**
 * Gestion admin des autorisations de publication par salon forum.
 */
import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../../lib/supabase';
import { createApiHeaders } from '../../../lib/api-helpers';
import { useToast } from '../../shared/ToastProvider';

type AdminProfileRow = {
  id: string;
  pseudo: string | null;
  discord_id: string | null;
};

type ForumOption = {
  forum_channel_id: string;
  label: string;
};

type ForumPostGrant = {
  id: string;
  profile_id: string;
  forum_channel_id: string;
  created_at?: string;
};

function getApiBase(): string {
  return (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
}

export default function ForumPostGrantsSection() {
  const { showToast } = useToast();
  const [profiles, setProfiles] = useState<AdminProfileRow[]>([]);
  const [forums, setForums] = useState<ForumOption[]>([]);
  const [grants, setGrants] = useState<ForumPostGrant[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [selectedForumId, setSelectedForumId] = useState('');
  const [customForumId, setCustomForumId] = useState('');
  const [saving, setSaving] = useState(false);

  const loadProfiles = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb
      .from('profiles')
      .select('id, pseudo, discord_id')
      .order('pseudo', { ascending: true });
    if (error) {
      showToast('Erreur chargement des profils', 'error');
      return;
    }
    setProfiles((data ?? []) as AdminProfileRow[]);
  }, [showToast]);

  const loadForums = useCallback(async () => {
    const baseUrl = getApiBase();
    const apiKey = (localStorage.getItem('apiKey') || '').trim();
    if (!baseUrl || !apiKey) return;
    try {
      const headers = await createApiHeaders(apiKey);
      const res = await fetch(`${baseUrl}/api/admin/forum-channels`, { headers });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setForums(data.forums ?? []);
      }
    } catch {
      /* non bloquant */
    }
  }, []);

  const loadGrants = useCallback(async (profileId?: string) => {
    const baseUrl = getApiBase();
    const apiKey = (localStorage.getItem('apiKey') || '').trim();
    if (!baseUrl || !apiKey) {
      showToast('URL API ou clé API manquante', 'error');
      return;
    }
    setLoading(true);
    try {
      const headers = await createApiHeaders(apiKey);
      const q = profileId ? `?profile_id=${encodeURIComponent(profileId)}` : '';
      const res = await fetch(`${baseUrl}/api/admin/forum-post-grants${q}`, { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showToast(data?.error || `Erreur ${res.status}`, 'error');
        setGrants([]);
        return;
      }
      setGrants(data.grants ?? []);
    } catch (e) {
      showToast(`Erreur : ${(e as Error).message}`, 'error');
      setGrants([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadProfiles();
    void loadForums();
    void loadGrants();
  }, [loadProfiles, loadForums, loadGrants]);

  useEffect(() => {
    void loadGrants(selectedProfileId || undefined);
  }, [selectedProfileId, loadGrants]);

  const effectiveForumId = (customForumId.trim() || selectedForumId).trim();

  const handleAddGrant = async () => {
    if (!selectedProfileId || !effectiveForumId) {
      showToast('Sélectionnez un utilisateur et un salon forum', 'error');
      return;
    }
    const baseUrl = getApiBase();
    const apiKey = (localStorage.getItem('apiKey') || '').trim();
    if (!baseUrl || !apiKey) {
      showToast('URL API ou clé API manquante', 'error');
      return;
    }
    setSaving(true);
    try {
      const headers = await createApiHeaders(apiKey, { 'Content-Type': 'application/json' });
      const res = await fetch(`${baseUrl}/api/admin/forum-post-grants`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          profile_id: selectedProfileId,
          forum_channel_id: effectiveForumId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showToast(data?.error || `Erreur ${res.status}`, 'error');
        return;
      }
      showToast('Autorisation accordée', 'success');
      setCustomForumId('');
      await loadGrants(selectedProfileId || undefined);
    } catch (e) {
      showToast(`Erreur : ${(e as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveGrant = async (grantId: string) => {
    const baseUrl = getApiBase();
    const apiKey = (localStorage.getItem('apiKey') || '').trim();
    if (!baseUrl || !apiKey) return;
    if (!window.confirm('Retirer cette autorisation de publication ?')) return;
    try {
      const headers = await createApiHeaders(apiKey, { 'Content-Type': 'application/json' });
      const res = await fetch(`${baseUrl}/api/admin/forum-post-grants`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ id: grantId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showToast(data?.error || `Erreur ${res.status}`, 'error');
        return;
      }
      showToast('Autorisation retirée', 'success');
      await loadGrants(selectedProfileId || undefined);
    } catch (e) {
      showToast(`Erreur : ${(e as Error).message}`, 'error');
    }
  };

  const profileLabel = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    if (!p) return id;
    return `${p.pseudo || '(sans pseudo)'}${p.discord_id ? ` · ${p.discord_id}` : ''}`;
  };

  return (
    <section className="settings-section">
      <h4 className="settings-section__title">📢 Autorisations de publication (forums)</h4>
      <p className="settings-section__intro">
        Accordez à un utilisateur le droit de publier sur un salon forum précis, sans être master admin.
        Les traducteurs dont le routing pointe vers ce salon deviennent sélectionnables pour cet utilisateur.
      </p>

      <div className="settings-config-fields">
        <div className="settings-config-field">
          <label>Utilisateur</label>
          <select
            className="form-input"
            value={selectedProfileId}
            onChange={(e) => setSelectedProfileId(e.target.value)}
          >
            <option value="">— Tous (liste complète) —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.pseudo || '(sans pseudo)')} {p.discord_id ? `· ${p.discord_id}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="settings-config-field">
          <label>Salon forum (depuis les routings configurés)</label>
          <select
            className="form-input"
            value={selectedForumId}
            onChange={(e) => setSelectedForumId(e.target.value)}
          >
            <option value="">— Sélectionner —</option>
            {forums.map((f) => (
              <option key={f.forum_channel_id} value={f.forum_channel_id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="settings-config-field">
          <label>Ou ID salon Discord manuel</label>
          <input
            type="text"
            className="form-input"
            value={customForumId}
            onChange={(e) => setCustomForumId(e.target.value)}
            placeholder="Ex. : 123456789012345678"
          />
        </div>
      </div>

      <div className="settings-config-actions" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="form-btn form-btn--primary"
          onClick={() => void handleAddGrant()}
          disabled={saving || !selectedProfileId || !effectiveForumId}
        >
          {saving ? 'Enregistrement…' : '➕ Accorder l\'autorisation'}
        </button>
        <button
          type="button"
          className="form-btn form-btn--ghost"
          onClick={() => void loadGrants(selectedProfileId || undefined)}
          disabled={loading}
          style={{ marginLeft: 8 }}
        >
          {loading ? 'Chargement…' : 'Rafraîchir'}
        </button>
      </div>

      {grants.length > 0 ? (
        <ul className="forum-post-grants-list" style={{ marginTop: 16 }}>
          {grants.map((g) => (
            <li key={g.id} className="forum-post-grants-list__item">
              <span className="forum-post-grants-list__text" title={g.forum_channel_id}>
                <strong>{profileLabel(g.profile_id)}</strong>
                {' → '}
                <code>{g.forum_channel_id}</code>
              </span>
              <button
                type="button"
                className="form-btn form-btn--ghost forum-post-grants-list__remove"
                onClick={() => void handleRemoveGrant(g.id)}
                title="Retirer"
              >
                🗑️
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings-section__intro" style={{ marginTop: 12, fontStyle: 'italic' }}>
          {loading ? 'Chargement…' : 'Aucune autorisation pour ce filtre.'}
        </p>
      )}
    </section>
  );
}
