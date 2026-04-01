import { useEffect, useMemo, useState } from 'react';
import { useConfirm } from '../../hooks/useConfirm';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';
import { createApiHeaders } from '../../lib/api-helpers';
import { getSupabase } from '../../lib/supabase';
import { PublishedPost, useApp } from '../../state/appContext';
import { useAuth } from '../../state/authContext';
import ConfirmModal from '../Modals/ConfirmModal';
import DeleteConfirmModal from '../Modals/DeleteConfirmModal';
import { useToast } from '../shared/ToastProvider';
import HistoryContent from './components/HistoryContent';
import HistoryFilters from './components/HistoryFilters';
import HistoryModalHeader from './components/HistoryModalHeader';
import HistoryTabs from './components/HistoryTabs';
import TransferOwnershipModal from './components/TransferOwnershipModal';
import type { TransferSelectionMode } from './components/TransferOwnershipModal';
import {
  type ExternalTranslatorPublic,
  type ProfilePublic,
  type TabId,
  PREFIX_EXT,
  PREFIX_PROFILE,
  POSTS_PER_PAGE,
} from './constants';

interface HistoryModalProps {
  onClose?: () => void;
}

export default function HistoryModal({ onClose }: HistoryModalProps) {
  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  const { profile } = useAuth();
  const {
    publishedPosts,
    deletePublishedPost,
    loadPostForEditing,
    fetchHistoryFromAPI,
    updatePublishedPost,
  } = useApp();
  const { showToast } = useToast();
  const { confirmState, handleConfirm, handleCancel } = useConfirm();

  const [allProfilesForEdit, setAllProfilesForEdit] = useState<ProfilePublic[]>([]);
  const [externalTranslators, setExternalTranslators] = useState<
    ExternalTranslatorPublic[]
  >([]);
  const [ownerIdsWhoAllowedMe, setOwnerIdsWhoAllowedMe] = useState<Set<string>>(
    new Set()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [postToDelete, setPostToDelete] = useState<PublishedPost | null>(null);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSourceId, setTransferSourceId] = useState<string>('');
  const [transferTargetId, setTransferTargetId] = useState<string>('');
  const [transferSelectionMode, setTransferSelectionMode] =
    useState<TransferSelectionMode>('all');
  const [transferPostIds, setTransferPostIds] = useState<string[]>([]);
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  const [activeTab, setActiveTab] = useState<TabId>('actifs');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc'>('date-desc');
  const [filterAuthorId, setFilterAuthorId] = useState<string>('me');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !profile?.id) return;
    (async () => {
      try {
        const [profilesRes, externalsRes, allowedRes] = await Promise.all([
          sb.from('profiles').select('id, pseudo, discord_id'),
          sb
            .from('external_translators')
            .select('id, name')
            .order('created_at', { ascending: true }),
          sb.from('allowed_editors').select('owner_id').eq('editor_id', profile.id),
        ]);
        setAllProfilesForEdit((profilesRes.data ?? []) as ProfilePublic[]);
        setExternalTranslators((externalsRes.data ?? []) as ExternalTranslatorPublic[]);
        const ids = new Set(
          (allowedRes.data ?? []).map((r: { owner_id: string }) => r.owner_id)
        );
        setOwnerIdsWhoAllowedMe(ids);
      } catch {
        setAllProfilesForEdit([]);
        setExternalTranslators([]);
        setOwnerIdsWhoAllowedMe(new Set());
      }
    })();
  }, [profile?.id]);

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
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- exécuter une seule fois à l'ouverture
  }, []);

  const filteredAndSortedPosts = useMemo(() => {
    let list = [...publishedPosts];
    if (activeTab === 'actifs') list = list.filter((p) => !p.archived);
    else list = list.filter((p) => p.archived);

    if (filterAuthorId) {
      if (filterAuthorId === 'me') {
        list = list.filter((post) => post.authorDiscordId === profile?.discord_id);
      } else if (filterAuthorId.startsWith(PREFIX_EXT)) {
        const extId = filterAuthorId.slice(PREFIX_EXT.length);
        list = list.filter((post) => post.authorExternalTranslatorId === extId);
      } else if (filterAuthorId.startsWith(PREFIX_PROFILE)) {
        const profileId = filterAuthorId.slice(PREFIX_PROFILE.length);
        const authorDiscordIds = new Set(
          allProfilesForEdit.filter((p) => p.id === profileId).map((p) => p.discord_id)
        );
        list = list.filter(
          (post) => post.authorDiscordId && authorDiscordIds.has(post.authorDiscordId)
        );
      } else {
        const authorDiscordIds = new Set(
          allProfilesForEdit.filter((p) => p.id === filterAuthorId).map((p) => p.discord_id)
        );
        list = list.filter(
          (post) => post.authorDiscordId && authorDiscordIds.has(post.authorDiscordId)
        );
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
  }, [
    publishedPosts,
    activeTab,
    searchQuery,
    sortBy,
    filterAuthorId,
    profile?.discord_id,
    allProfilesForEdit,
  ]);

  const canEditPost = useMemo(() => {
    return (post: PublishedPost): boolean => {
      if (post.authorExternalTranslatorId) return profile?.is_master_admin === true;
      if (!profile?.discord_id) return false;
      if (profile.discord_id === post.authorDiscordId) return true;
      if (profile.is_master_admin) return true;
      const authorProfileId = allProfilesForEdit.find(
        (p) => p.discord_id === post.authorDiscordId
      )?.id;
      return authorProfileId != null && ownerIdsWhoAllowedMe.has(authorProfileId);
    };
  }, [
    profile?.discord_id,
    profile?.is_master_admin,
    allProfilesForEdit,
    ownerIdsWhoAllowedMe,
  ]);

  const transferSourceIsProfile = transferSourceId.startsWith(PREFIX_PROFILE);
  const transferSourceIsExt = transferSourceId.startsWith(PREFIX_EXT);
  const transferSourceProfileId = transferSourceIsProfile
    ? transferSourceId.slice(PREFIX_PROFILE.length)
    : '';
  const transferSourceExtId = transferSourceIsExt
    ? transferSourceId.slice(PREFIX_EXT.length)
    : '';
  const transferSourceDiscordId = transferSourceProfileId
    ? (allProfilesForEdit.find((p) => p.id === transferSourceProfileId)?.discord_id ??
      '')
    : '';
  const postsBySourceAuthor = useMemo(() => {
    if (transferSourceIsProfile && transferSourceDiscordId)
      return publishedPosts.filter(
        (p) => p.authorDiscordId === transferSourceDiscordId
      );
    if (transferSourceIsExt && transferSourceExtId)
      return publishedPosts.filter(
        (p) => p.authorExternalTranslatorId === transferSourceExtId
      );
    return [];
  }, [
    publishedPosts,
    transferSourceDiscordId,
    transferSourceExtId,
    transferSourceIsProfile,
    transferSourceIsExt,
  ]);

  async function handleTransferOwnership() {
    const targetIsProfile = transferTargetId.startsWith(PREFIX_PROFILE);
    const targetIsExt = transferTargetId.startsWith(PREFIX_EXT);
    const targetProfileId = targetIsProfile
      ? transferTargetId.slice(PREFIX_PROFILE.length)
      : '';
    const targetExtId = targetIsExt
      ? transferTargetId.slice(PREFIX_EXT.length)
      : '';
    const targetDiscordId = targetProfileId
      ? (allProfilesForEdit.find((p) => p.id === targetProfileId)?.discord_id ?? '')
      : '';

    const hasSource =
      (transferSourceIsProfile && transferSourceDiscordId) ||
      (transferSourceIsExt && transferSourceExtId);
    const hasTarget =
      (targetIsProfile && targetDiscordId) || (targetIsExt && targetExtId);
    if (!hasSource || !hasTarget) {
      showToast("Choisissez l'auteur source et l'auteur cible", 'error');
      return;
    }
    if (transferSourceId === transferTargetId) {
      showToast('Source et cible doivent être différents', 'error');
      return;
    }
    const baseUrl = (
      localStorage.getItem('apiUrl') || localStorage.getItem('apiBase') || ''
    ).replace(/\/+$/, '');
    const apiKey = localStorage.getItem('apiKey') || '';
    if (!baseUrl || !apiKey) {
      showToast('URL API ou clé API manquante', 'error');
      return;
    }
    setTransferSubmitting(true);
    try {
      const body: Record<string, string | undefined> = {};
      if (transferSourceIsProfile)
        body.source_author_discord_id = transferSourceDiscordId;
      else if (transferSourceIsExt)
        body.source_author_external_id = transferSourceExtId;
      if (targetIsProfile) body.target_author_discord_id = targetDiscordId;
      else if (targetIsExt) body.target_author_external_id = targetExtId;
      if (transferPostIds.length === 1)
        (body as Record<string, unknown>).post_id = transferPostIds[0];
      else if (transferPostIds.length > 1)
        (body as Record<string, unknown>).post_ids = transferPostIds;
      const headers = await createApiHeaders(apiKey, {
        'Content-Type': 'application/json',
      });
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
      showToast(
        count > 0
          ? `${count} publication(s) transférée(s).`
          : 'Aucune publication transférée.',
        'success'
      );
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
  const paginatedPosts = filteredAndSortedPosts.slice(
    startIndex,
    startIndex + POSTS_PER_PAGE
  );
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
    const threadId = String(
      (
        post as { threadId?: string; thread_id?: string }
      ).threadId ?? (post as { thread_id?: string }).thread_id ?? ''
    ).trim();
    const baseUrl = (localStorage.getItem('apiBase') || '').replace(/\/+$/, '');
    const apiKey = localStorage.getItem('apiKey') || '';
    if (!baseUrl || !apiKey) {
      showToast('URL API ou clé manquante dans la configuration', 'error');
      return;
    }
    try {
      const headers = await createApiHeaders(apiKey, {
        'Content-Type': 'application/json',
      });
      const res = await fetch(`${baseUrl}/api/forum-post/delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          threadId,
          postId: post.id,
          postTitle: post.title,
          reason: reason || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404) {
          deletePublishedPost(post.id);
          showToast(
            "Le thread était déjà supprimé sur Discord ; entrée retirée de l'historique.",
            'success'
          );
          return;
        }
        showToast(data?.error || `Erreur ${res.status}`, 'error');
        return;
      }
      deletePublishedPost(post.id);
      showToast(
        data?.skipped_discord
          ? "Aucun thread Discord associé ; entrée retirée de l'historique et de la base."
          : 'Publication supprimée définitivement (historique, base et Discord)',
        'success'
      );
    } catch (e: unknown) {
      showToast(
        'Erreur réseau : ' +
          (e && typeof e === 'object' && 'message' in e
            ? String((e as { message: unknown }).message)
            : 'inconnue'),
        'error'
      );
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
      showToast(
        'Erreur lors du chargement du post: ' +
          (e && typeof e === 'object' && 'message' in e
            ? String((e as { message: unknown }).message)
            : 'inconnue'),
        'error'
      );
    }
  }

  return (
    <div className="modal" onClick={() => onClose?.()}>
      <div
        className="panel history-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <HistoryModalHeader totalCount={publishedPosts.length} />
        <HistoryTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          activeCount={publishedPosts.filter((p) => !p.archived).length}
          archivedCount={publishedPosts.filter((p) => p.archived).length}
        />
        <HistoryFilters
          filterAuthorId={filterAuthorId}
          onFilterAuthorChange={setFilterAuthorId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortBy={sortBy}
          onSortChange={setSortBy}
          hasActiveFilters={hasActiveFilters}
          onResetFilters={resetFilters}
          onOpenTransfer={() => {
            setShowTransferModal(true);
            if (!profile?.is_master_admin && profile?.id)
              setTransferSourceId(PREFIX_PROFILE + profile.id);
          }}
          allProfiles={allProfilesForEdit}
          externalTranslators={externalTranslators}
          currentUserDiscordId={profile?.discord_id}
          isMasterAdmin={profile?.is_master_admin === true}
        />
        <HistoryContent
          isLoading={isLoading}
          error={error}
          paginatedPosts={paginatedPosts}
          filteredCount={filteredAndSortedPosts.length}
          totalPages={totalPages}
          currentPage={currentPage}
          searchQuery={searchQuery}
          activeTab={activeTab}
          canEditPost={canEditPost}
          onPagePrev={() => setCurrentPage((p) => Math.max(1, p - 1))}
          onPageNext={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          onArchiveChange={(post, archived) =>
            updatePublishedPost(post.id, { archived }).catch(() => {
              showToast("Impossible de mettre à jour l'état archivé", 'error');
            })
          }
          onEdit={handleEdit}
          onDelete={handleDeleteDefinitively}
        />
        <div className="history-footer">
          <button
            type="button"
            onClick={onClose}
            className="form-btn form-btn--ghost"
          >
            ↩️ Fermer
          </button>
        </div>
      </div>

      <TransferOwnershipModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        submitting={transferSubmitting}
        profileId={profile?.id}
        profilePseudo={profile?.pseudo ?? undefined}
        isMasterAdmin={profile?.is_master_admin === true}
        allProfiles={allProfilesForEdit}
        externalTranslators={externalTranslators}
        sourceId={transferSourceId}
        targetId={transferTargetId}
        selectionMode={transferSelectionMode}
        postIds={transferPostIds}
        postsBySourceAuthor={postsBySourceAuthor}
        onSourceChange={setTransferSourceId}
        onTargetChange={setTransferTargetId}
        onSelectionModeChange={setTransferSelectionMode}
        onPostIdsChange={setTransferPostIds}
        onConfirm={handleTransferOwnership}
      />

      <DeleteConfirmModal
        isOpen={deleteModalOpen}
        postTitle={postToDelete?.title || ''}
        onConfirm={performDelete}
        onCancel={() => {
          setDeleteModalOpen(false);
          setPostToDelete(null);
        }}
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
