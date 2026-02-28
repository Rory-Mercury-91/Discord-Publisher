import { useEffect, useMemo, useState } from 'react';
import { useConfirm } from '../hooks/useConfirm';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { createApiHeaders } from '../lib/api-helpers';
import { getSupabase } from '../lib/supabase';
import { PublishedPost, useApp } from '../state/appContext';
import type { Profile } from '../state/authContext';
import { useAuth } from '../state/authContext';
import ConfirmModal from './ConfirmModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import Toggle from './Toggle';
import { useToast } from './ToastProvider';

const POSTS_PER_PAGE = 15;
const GRID_COLUMNS = 3;

type ProfilePublic = Pick<Profile, 'id' | 'pseudo' | 'discord_id'>;
type ExternalTranslatorPublic = { id: string; name: string };
type TabId = 'actifs' | 'archive';

const PREFIX_PROFILE = 'profile:';
const PREFIX_EXT = 'ext:';

interface HistoryModalProps {
  onClose?: () => void;
}

export default function HistoryModal({ onClose }: HistoryModalProps) {
  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  const { profile } = useAuth();
  const { publishedPosts, deletePublishedPost, loadPostForEditing, fetchHistoryFromAPI, updatePublishedPost } = useApp();
  const { showToast } = useToast();
  const { confirmState, handleConfirm, handleCancel } = useConfirm();

  const [allProfilesForEdit, setAllProfilesForEdit] = useState<ProfilePublic[]>([]);
  const [externalTranslators, setExternalTranslators] = useState<ExternalTranslatorPublic[]>([]);
  const [ownerIdsWhoAllowedMe, setOwnerIdsWhoAllowedMe] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [postToDelete, setPostToDelete] = useState<PublishedPost | null>(null);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSourceId, setTransferSourceId] = useState<string>('');
  const [transferTargetId, setTransferTargetId] = useState<string>('');
  /** 'all' = tout, 'one' = un seul (radio), 'several' = plusieurs (checkboxes) */
  const [transferSelectionMode, setTransferSelectionMode] = useState<'all' | 'one' | 'several'>('all');
  const [transferPostIds, setTransferPostIds] = useState<string[]>([]);
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  const [activeTab, setActiveTab] = useState<TabId>('actifs');

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !profile?.id) return;
    (async () => {
      try {
        const [profilesRes, externalsRes, allowedRes] = await Promise.all([
          sb.from('profiles').select('id, pseudo, discord_id'),
          sb.from('external_translators').select('id, name').order('created_at', { ascending: true }),
          sb.from('allowed_editors').select('owner_id').eq('editor_id', profile.id),
        ]);
        setAllProfilesForEdit((profilesRes.data ?? []) as ProfilePublic[]);
        setExternalTranslators((externalsRes.data ?? []) as ExternalTranslatorPublic[]);
        const ids = new Set((allowedRes.data ?? []).map((r: { owner_id: string }) => r.owner_id));
        setOwnerIdsWhoAllowedMe(ids);
      } catch (_e) {
        setAllProfilesForEdit([]);
        setExternalTranslators([]);
        setOwnerIdsWhoAllowedMe(new Set());
      }
    })();
  }, [profile?.id]);

  // Chargement une seule fois à l'ouverture (éviter boucle si fetchHistoryFromAPI change de ref)
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchHistoryFromAPI()
      .then(() => {
        if (!cancelled) setIsLoading(false);
      })
      .catch((e) => {
        console.error('[Historique] ❌ Erreur chargement:', e);
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- exécuter une seule fois à l'ouverture de la modale
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc'>('date-desc');
  const [filterAuthorId, setFilterAuthorId] = useState<string>('me');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredAndSortedPosts = useMemo(() => {
    let list = [...publishedPosts];
    if (activeTab === 'actifs') list = list.filter(p => !p.archived);
    else list = list.filter(p => p.archived);

    if (filterAuthorId) {
      if (filterAuthorId === 'me') {
        list = list.filter(post => post.authorDiscordId === profile?.discord_id);
      } else if (filterAuthorId.startsWith(PREFIX_EXT)) {
        const extId = filterAuthorId.slice(PREFIX_EXT.length);
        list = list.filter(post => post.authorExternalTranslatorId === extId);
      } else if (filterAuthorId.startsWith(PREFIX_PROFILE)) {
        const profileId = filterAuthorId.slice(PREFIX_PROFILE.length);
        const authorDiscordIds = new Set(
          allProfilesForEdit.filter(p => p.id === profileId).map(p => p.discord_id)
        );
        list = list.filter(post => post.authorDiscordId && authorDiscordIds.has(post.authorDiscordId));
      } else {
        const authorDiscordIds = new Set(
          allProfilesForEdit.filter(p => p.id === filterAuthorId).map(p => p.discord_id)
        );
        list = list.filter(post => post.authorDiscordId && authorDiscordIds.has(post.authorDiscordId));
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((post) => {
        const titleMatch = (post.title || '').toLowerCase().includes(q);
        const idMatch = (post.id || '').toLowerCase().includes(q);
        const gameLink = post.savedLinkConfigs?.Game_link?.value ?? '';
        const linkMatch = gameLink.toLowerCase().includes(q);
        return titleMatch || idMatch || linkMatch;
      });
    }
    list.sort((a, b) =>
      sortBy === 'date-desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
    );
    return list;
  }, [publishedPosts, activeTab, searchQuery, sortBy, filterAuthorId, profile?.discord_id, allProfilesForEdit]);

  const canEditPost = useMemo(() => {
    return (post: PublishedPost): boolean => {
      if (post.authorExternalTranslatorId) return profile?.is_master_admin === true;
      if (!profile?.discord_id) return false;
      if (profile.discord_id === post.authorDiscordId) return true;
      if (profile.is_master_admin) return true;
      const authorProfileId = allProfilesForEdit.find(p => p.discord_id === post.authorDiscordId)?.id;
      return authorProfileId != null && ownerIdsWhoAllowedMe.has(authorProfileId);
    };
  }, [profile?.discord_id, profile?.is_master_admin, allProfilesForEdit, ownerIdsWhoAllowedMe]);

  const transferSourceIsProfile = transferSourceId.startsWith(PREFIX_PROFILE);
  const transferSourceIsExt = transferSourceId.startsWith(PREFIX_EXT);
  const transferSourceProfileId = transferSourceIsProfile ? transferSourceId.slice(PREFIX_PROFILE.length) : '';
  const transferSourceExtId = transferSourceIsExt ? transferSourceId.slice(PREFIX_EXT.length) : '';
  const transferSourceDiscordId = transferSourceProfileId ? (allProfilesForEdit.find(p => p.id === transferSourceProfileId)?.discord_id ?? '') : '';
  const postsBySourceAuthor = useMemo(() => {
    if (transferSourceIsProfile && transferSourceDiscordId) return publishedPosts.filter(p => p.authorDiscordId === transferSourceDiscordId);
    if (transferSourceIsExt && transferSourceExtId) return publishedPosts.filter(p => p.authorExternalTranslatorId === transferSourceExtId);
    return [];
  }, [publishedPosts, transferSourceDiscordId, transferSourceExtId, transferSourceIsProfile, transferSourceIsExt]);

  async function handleTransferOwnership() {
    const targetIsProfile = transferTargetId.startsWith(PREFIX_PROFILE);
    const targetIsExt = transferTargetId.startsWith(PREFIX_EXT);
    const targetProfileId = targetIsProfile ? transferTargetId.slice(PREFIX_PROFILE.length) : '';
    const targetExtId = targetIsExt ? transferTargetId.slice(PREFIX_EXT.length) : '';
    const targetDiscordId = targetProfileId ? (allProfilesForEdit.find(p => p.id === targetProfileId)?.discord_id ?? '') : '';

    const hasSource = (transferSourceIsProfile && transferSourceDiscordId) || (transferSourceIsExt && transferSourceExtId);
    const hasTarget = (targetIsProfile && targetDiscordId) || (targetIsExt && targetExtId);
    if (!hasSource || !hasTarget) {
      showToast('Choisissez l\'auteur source et l\'auteur cible', 'error');
      return;
    }
    if (transferSourceId === transferTargetId) {
      showToast('Source et cible doivent être différents', 'error');
      return;
    }
    const baseUrl = (localStorage.getItem('apiUrl') || localStorage.getItem('apiBase') || '').replace(/\/+$/, '');
    const apiKey = localStorage.getItem('apiKey') || '';
    if (!baseUrl || !apiKey) {
      showToast('URL API ou clé API manquante', 'error');
      return;
    }
    setTransferSubmitting(true);
    try {
      const body: Record<string, string | undefined> = {};
      if (transferSourceIsProfile) body.source_author_discord_id = transferSourceDiscordId;
      else if (transferSourceIsExt) body.source_author_external_id = transferSourceExtId;
      if (targetIsProfile) body.target_author_discord_id = targetDiscordId;
      else if (targetIsExt) body.target_author_external_id = targetExtId;
      if (transferPostIds.length === 1) (body as Record<string, unknown>).post_id = transferPostIds[0];
      else if (transferPostIds.length > 1) (body as Record<string, unknown>).post_ids = transferPostIds;
      const headers = await createApiHeaders(apiKey, { 'Content-Type': 'application/json' });
      const res = await fetch(`${baseUrl}/api/transfer-ownership`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showToast(data?.error || `Erreur ${res.status}`, 'error');
        return;
      }
      const count = data.count ?? 0;
      showToast(count > 0 ? `${count} publication(s) transférée(s).` : 'Aucune publication transférée.', 'success');
      setShowTransferModal(false);
      setTransferSourceId('');
      setTransferTargetId('');
      setTransferSelectionMode('all');
      setTransferPostIds([]);
      await fetchHistoryFromAPI();
    } catch (e: unknown) {
      showToast((e as Error)?.message || 'Erreur lors du transfert', 'error');
    } finally {
      setTransferSubmitting(false);
    }
  }

  const totalPages = Math.ceil(filteredAndSortedPosts.length / POSTS_PER_PAGE);
  const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
  const paginatedPosts = filteredAndSortedPosts.slice(startIndex, startIndex + POSTS_PER_PAGE);

  const hasActiveFilters = Boolean(searchQuery.trim() || filterAuthorId);

  function resetFilters() {
    setSearchQuery('');
    setSortBy('date-desc');
    setFilterAuthorId('me');
    setCurrentPage(1);
  }

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy, filterAuthorId, activeTab]);

  function handleDeleteDefinitively(post: PublishedPost) {
    setPostToDelete(post);
    setDeleteModalOpen(true);
  }

  async function performDelete(reason: string) {
    if (!postToDelete) return;
    setDeleteModalOpen(false);
    const post = postToDelete;
    const threadId = String((post as { threadId?: string; thread_id?: string }).threadId ?? (post as { thread_id?: string }).thread_id ?? '').trim();
    const baseUrl = (localStorage.getItem('apiBase') || '').replace(/\/+$/, '');
    const apiKey = localStorage.getItem('apiKey') || '';
    if (!baseUrl || !apiKey) {
      showToast('URL API ou clé manquante dans la configuration', 'error');
      return;
    }
    try {
      const headers = await createApiHeaders(apiKey, { 'Content-Type': 'application/json' });
      const res = await fetch(`${baseUrl}/api/forum-post/delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ threadId, postId: post.id, postTitle: post.title, reason: reason || undefined })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404) {
          deletePublishedPost(post.id);
          showToast('Le thread était déjà supprimé sur Discord ; entrée retirée de l\'historique.', 'success');
          return;
        }
        showToast(data?.error || `Erreur ${res.status}`, 'error');
        return;
      }
      deletePublishedPost(post.id);
      showToast(data?.skipped_discord ? 'Aucun thread Discord associé ; entrée retirée de l\'historique et de la base.' : 'Publication supprimée définitivement (historique, base et Discord)', 'success');
    } catch (e: unknown) {
      showToast('Erreur réseau : ' + (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'inconnue'), 'error');
    } finally {
      setPostToDelete(null);
    }
  }

  function handleEdit(post: PublishedPost) {
    try {
      loadPostForEditing(post);
      showToast('Post chargé en mode édition', 'info');
      if (onClose) onClose();
    } catch (e: unknown) {
      showToast('Erreur lors du chargement du post: ' + (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'inconnue'), 'error');
    }
  }

  function formatDate(timestamp: number) {
    return new Date(timestamp).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function tooltipText(post: PublishedPost) {
    const created = formatDate(post.createdAt ?? post.timestamp);
    const updated = formatDate(post.updatedAt ?? post.timestamp);
    return `Créé le ${created}\nModifié le ${updated}`;
  }

  const tabStyle = (tab: TabId) => ({
    padding: '10px 18px',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    background: activeTab === tab ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
    color: activeTab === tab ? '#fff' : 'var(--muted)',
    borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent'
  } as React.CSSProperties);

  return (
    <div className="modal">
      <div
        className="panel"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 1200, width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>📋 Historique des publications</h3>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {publishedPosts.length} publication{publishedPosts.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Onglets Actifs / Archive */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button type="button" style={tabStyle('actifs')} onClick={() => setActiveTab('actifs')}>
            Actifs ({publishedPosts.filter(p => !p.archived).length})
          </button>
          <button type="button" style={tabStyle('archive')} onClick={() => setActiveTab('archive')}>
            Archive ({publishedPosts.filter(p => p.archived).length})
          </button>
        </div>

        {/* Filtres */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={filterAuthorId}
            onChange={(e) => setFilterAuthorId(e.target.value)}
            style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer', minWidth: 160 }}
          >
            <option value="">Tous les auteurs</option>
            <option value="me">Moi</option>
            {allProfilesForEdit.filter(p => p.discord_id !== profile?.discord_id).map(p => (
              <option key={PREFIX_PROFILE + p.id} value={PREFIX_PROFILE + p.id}>👤 {p.pseudo || p.discord_id || p.id}</option>
            ))}
            {externalTranslators.map(ext => (
              <option key={PREFIX_EXT + ext.id} value={PREFIX_EXT + ext.id}>🔧 {ext.name}</option>
            ))}
          </select>
          <input
            type="text"
            className="app-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher (nom du jeu, lien ou ID)..."
            style={{ flex: 1, minWidth: 180 }}
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date-desc' | 'date-asc')}
            style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}
          >
            <option value="date-desc">Plus récent</option>
            <option value="date-asc">Plus ancien</option>
          </select>
          {hasActiveFilters && (
            <button type="button" onClick={resetFilters} style={{ padding: '10px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>
              Réinitialiser les filtres
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShowTransferModal(true);
              if (!profile?.is_master_admin && profile?.id) setTransferSourceId(PREFIX_PROFILE + profile.id);
            }}
            style={{
              padding: '10px 14px', borderRadius: 8, border: '1px solid var(--accent)',
              background: 'rgba(99,102,241,0.12)', color: 'var(--accent)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}
            title={profile?.is_master_admin ? 'Transférer la propriété (admin : tout auteur)' : 'Transférer vos publications vers un autre auteur'}
          >
            🔄 Transférer la propriété
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {error && (
            <div style={{ color: 'var(--error)', padding: 16, textAlign: 'center', background: 'rgba(240, 71, 71, 0.1)', borderRadius: 8, marginBottom: 12 }}>
              ⚠️ {error}
            </div>
          )}

          {isLoading && (
            <div style={{ color: 'var(--muted)', padding: 40, textAlign: 'center' }}>
              ⏳ Chargement de l'historique...
            </div>
          )}

          {!isLoading && filteredAndSortedPosts.length === 0 && (
            <div style={{ color: 'var(--muted)', fontStyle: 'italic', padding: 32, textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: 10 }}>
              {searchQuery.trim() ? 'Aucune publication ne correspond à la recherche.' : activeTab === 'archive' ? "Aucune publication dans l'archive." : "Aucune publication active."}
            </div>
          )}

          {!isLoading && filteredAndSortedPosts.length > 0 && (
            <>
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, fontSize: 12, color: 'var(--muted)' }}>
                  <span>{filteredAndSortedPosts.length} résultat{filteredAndSortedPosts.length !== 1 ? 's' : ''}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text)', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.5 : 1 }}
                    >
                      ← Préc.
                    </button>
                    <span>Page {currentPage} / {totalPages}</span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text)', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', opacity: currentPage === totalPages ? 0.5 : 1 }}
                    >
                      Suiv. →
                    </button>
                  </span>
                </div>
              )}

              {/* Grille 3 colonnes */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)`,
                  gap: 12
                }}
              >
                {paginatedPosts.map((post) => (
                  <div
                    key={post.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.02)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      minWidth: 0
                    }}
                  >
                    <div title={tooltipText(post)} style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'help' }}>
                      {post.title || 'Sans titre'}
                    </div>
                    <Toggle
                      checked={!!post.archived}
                      onChange={(archived) => {
                        updatePublishedPost(post.id, { archived }).catch(() => {
                          showToast('Impossible de mettre à jour l\'état archivé', 'error');
                        });
                      }}
                      label="Archivé"
                      size="sm"
                      title={post.archived ? 'Retirer de l\'archive' : 'Mettre dans l\'archive'}
                    />
                    {canEditPost(post) && (
                      <>
                        <button type="button" onClick={() => handleEdit(post)} title="Modifier" style={{ flexShrink: 0, padding: 6, background: 'var(--accent)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>
                          ✏️
                        </button>
                        <button type="button" onClick={() => handleDeleteDefinitively(post)} title="Supprimer définitivement (historique, base et Discord)" style={{ flexShrink: 0, padding: 6, background: 'transparent', border: '1px solid var(--error, #ef4444)', color: 'var(--error, #ef4444)', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ padding: '8px 20px', fontWeight: 600 }}>
            ↩️ Fermer
          </button>
        </div>
      </div>

      {showTransferModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'var(--modal-backdrop)', backdropFilter: 'var(--modal-backdrop-blur)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100001,
          }}
          onClick={() => !transferSubmitting && setShowTransferModal(false)}
        >
          <div
            style={{
              background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: 24,
              maxWidth: 520, width: '95%', maxHeight: '85vh', overflow: 'auto',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h4 style={{ margin: '0 0 16px', fontSize: 16 }}>🔄 Transférer la propriété des publications</h4>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)' }}>
              {profile?.is_master_admin ? 'Choisissez l\'auteur source (profil ou traducteur externe), éventuellement un post précis, puis l\'auteur cible.' : 'Transférez vos publications vers un autre auteur (profil ou traducteur externe).'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Auteur source</label>
              <select
                value={transferSourceId}
                onChange={(e) => { setTransferSourceId(e.target.value); setTransferSelectionMode('all'); setTransferPostIds([]); }}
                disabled={!profile?.is_master_admin}
                style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}
              >
                <option value="">— Choisir —</option>
                {profile?.is_master_admin ? (
                  <>
                    {allProfilesForEdit.map(p => (
                      <option key={PREFIX_PROFILE + p.id} value={PREFIX_PROFILE + p.id}>👤 {p.pseudo || p.discord_id || p.id}</option>
                    ))}
                    {externalTranslators.map(ext => (
                      <option key={PREFIX_EXT + ext.id} value={PREFIX_EXT + ext.id}>🔧 {ext.name}</option>
                    ))}
                  </>
                ) : (
                  profile?.id && <option value={PREFIX_PROFILE + profile.id}>👤 Moi ({profile.pseudo || profile.discord_id || profile.id})</option>
                )}
              </select>

              {((transferSourceIsProfile && transferSourceDiscordId) || (transferSourceIsExt && transferSourceExtId)) && (
                <>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                    Que transférer ? ({postsBySourceAuthor.length} publication{postsBySourceAuthor.length !== 1 ? 's' : ''})
                  </label>
                  <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8, background: 'rgba(0,0,0,0.15)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: 13 }}>
                      <input type="radio" name="transferScope" checked={transferSelectionMode === 'all'} onChange={() => { setTransferSelectionMode('all'); setTransferPostIds([]); }} />
                      <span>Tous</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: 13 }}>
                      <input type="radio" name="transferScope" checked={transferSelectionMode === 'one'} onChange={() => { setTransferSelectionMode('one'); setTransferPostIds(transferPostIds.length === 1 ? transferPostIds : []); }} />
                      <span>Un seul</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: 13 }}>
                      <input type="radio" name="transferScope" checked={transferSelectionMode === 'several'} onChange={() => { setTransferSelectionMode('several'); }} />
                      <span>Plusieurs</span>
                    </label>
                    {transferSelectionMode === 'one' && (
                      <div style={{ marginLeft: 20, marginTop: 6 }}>
                        {postsBySourceAuthor.map(post => (
                          <label key={post.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 12, color: 'var(--text)' }}>
                            <input type="radio" name="transferOne" checked={transferPostIds[0] === post.id} onChange={() => setTransferPostIds([post.id])} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title || post.id}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {transferSelectionMode === 'several' && (
                      <div style={{ marginLeft: 20, marginTop: 6 }}>
                        {postsBySourceAuthor.map(post => (
                          <label key={post.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 12, color: 'var(--text)' }}>
                            <input
                              type="checkbox"
                              checked={transferPostIds.includes(post.id)}
                              onChange={(e) => setTransferPostIds(prev => e.target.checked ? [...prev, post.id] : prev.filter(id => id !== post.id))}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title || post.id}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Auteur cible</label>
              <select
                value={transferTargetId}
                onChange={(e) => setTransferTargetId(e.target.value)}
                style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}
              >
                <option value="">— Choisir —</option>
                {allProfilesForEdit.filter(p => PREFIX_PROFILE + p.id !== transferSourceId).map(p => (
                  <option key={PREFIX_PROFILE + p.id} value={PREFIX_PROFILE + p.id}>👤 {p.pseudo || p.discord_id || p.id}</option>
                ))}
                {externalTranslators.filter(ext => PREFIX_EXT + ext.id !== transferSourceId).map(ext => (
                  <option key={PREFIX_EXT + ext.id} value={PREFIX_EXT + ext.id}>🔧 {ext.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button type="button" onClick={() => setShowTransferModal(false)} disabled={transferSubmitting} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: transferSubmitting ? 'not-allowed' : 'pointer' }}>
                Annuler
              </button>
              <button
                type="button"
                onClick={handleTransferOwnership}
                disabled={transferSubmitting || !transferSourceId || !transferTargetId || (transferSelectionMode !== 'all' && transferPostIds.length === 0)}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: (transferSourceId && transferTargetId && (transferSelectionMode === 'all' || transferPostIds.length > 0)) ? 'var(--accent)' : 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 600, cursor: (transferSubmitting || !transferSourceId || !transferTargetId || (transferSelectionMode !== 'all' && transferPostIds.length === 0)) ? 'not-allowed' : 'pointer' }}
              >
                {transferSubmitting ? '⏳ Transfert…' : 'Confirmer le transfert'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DeleteConfirmModal
        isOpen={deleteModalOpen}
        postTitle={postToDelete?.title || ''}
        onConfirm={performDelete}
        onCancel={() => { setDeleteModalOpen(false); setPostToDelete(null); }}
      />

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
