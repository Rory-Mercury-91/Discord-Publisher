import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useToast } from './ToastProvider';

const POSTS_PER_PAGE = 15;
const GRID_COLUMNS = 3;

type ProfilePublic = Pick<Profile, 'id' | 'pseudo' | 'discord_id'>;
type TabId = 'actifs' | 'archive';

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
  const [ownerIdsWhoAllowedMe, setOwnerIdsWhoAllowedMe] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [postToDelete, setPostToDelete] = useState<PublishedPost | null>(null);

  const [activeTab, setActiveTab] = useState<TabId>('actifs');

  const toggleArchived = useCallback((post: PublishedPost) => {
    updatePublishedPost(post.id, { archived: !post.archived }).catch(() => {
      showToast('Impossible de mettre à jour l\'état archivé', 'error');
    });
  }, [updatePublishedPost, showToast]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !profile?.id) return;
    (async () => {
      try {
        const { data: profilesData } = await sb.from('profiles').select('id, pseudo, discord_id');
        setAllProfilesForEdit((profilesData ?? []) as ProfilePublic[]);
        const { data: allowedData } = await sb.from('allowed_editors').select('owner_id').eq('editor_id', profile.id);
        const ids = new Set((allowedData ?? []).map((r: { owner_id: string }) => r.owner_id));
        setOwnerIdsWhoAllowedMe(ids);
      } catch (_e) {
        setAllProfilesForEdit([]);
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
      } else {
        const authorDiscordIds = new Set(
          allProfilesForEdit.filter(p => p.id === filterAuthorId).map(p => p.discord_id)
        );
        list = list.filter(post => post.authorDiscordId && authorDiscordIds.has(post.authorDiscordId));
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        post =>
          (post.title || '').toLowerCase().includes(q) ||
          (post.content || '').toLowerCase().includes(q) ||
          (post.tags || '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) =>
      sortBy === 'date-desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
    );
    return list;
  }, [publishedPosts, activeTab, searchQuery, sortBy, filterAuthorId, profile?.discord_id, allProfilesForEdit]);

  const canEditPost = useMemo(() => {
    return (post: PublishedPost): boolean => {
      if (!profile?.discord_id) return false;
      if (profile.discord_id === post.authorDiscordId) return true;
      if (profile.is_master_admin) return true;
      const authorProfileId = allProfilesForEdit.find(p => p.discord_id === post.authorDiscordId)?.id;
      return authorProfileId != null && ownerIdsWhoAllowedMe.has(authorProfileId);
    };
  }, [profile?.discord_id, profile?.is_master_admin, allProfilesForEdit, ownerIdsWhoAllowedMe]);

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
              <option key={p.id} value={p.id}>{p.pseudo || p.discord_id || p.id}</option>
            ))}
          </select>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher (titre, contenu, tags)..."
            style={{ flex: 1, minWidth: 180, padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)' }}
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
                    <label style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap' }} title={post.archived ? 'Retirer de l\'archive' : 'Mettre dans l\'archive'}>
                      <input
                        type="checkbox"
                        checked={!!post.archived}
                        onChange={() => toggleArchived(post)}
                        style={{ width: 14, height: 14, cursor: 'pointer' }}
                      />
                      Archivé
                    </label>
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
            🚪 Fermer
          </button>
        </div>
      </div>

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
