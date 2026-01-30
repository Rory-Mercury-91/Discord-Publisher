import { useEffect, useMemo, useState } from 'react';
import { useConfirm } from '../hooks/useConfirm';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { getSupabase } from '../lib/supabase';
import { PublishedPost, useApp } from '../state/appContext';
import type { Profile } from '../state/authContext';
import { useAuth } from '../state/authContext';
import ConfirmModal from './ConfirmModal';
import { useToast } from './ToastProvider';

type ProfilePublic = Pick<Profile, 'id' | 'pseudo' | 'discord_id'>;

interface HistoryModalProps {
  onClose?: () => void;
}

const POSTS_PER_PAGE = 15;

export default function HistoryModal({ onClose }: HistoryModalProps) {
  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  const { profile } = useAuth();
  const { publishedPosts, deletePublishedPost, loadPostForEditing, fetchHistoryFromAPI } = useApp();
  const { showToast } = useToast();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  // Droits d'édition : profils (pour author_discord_id -> id) et owners qui m'ont autorisé
  const [allProfilesForEdit, setAllProfilesForEdit] = useState<ProfilePublic[]>([]);
  const [ownerIdsWhoAllowedMe, setOwnerIdsWhoAllowedMe] = useState<Set<string>>(new Set());

  // Gestion des erreurs et états de chargement
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charger profils et droits d'édition à l'ouverture
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

  // Forcer le refresh de l'historique à l'ouverture de la modale
  useEffect(() => {
    setIsLoading(true);
    setError(null);

    fetchHistoryFromAPI()
      .then(() => {
        setIsLoading(false);
      })
      .catch((e: any) => {
        setIsLoading(false);
        console.log('ℹ️ Koyeb non disponible, utilisation de localStorage uniquement');
      });
  }, []);

  // Recherche, tri et filtre par auteur
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc'>('date-desc');
  const [filterAuthorId, setFilterAuthorId] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredAndSortedPosts = useMemo(() => {
    let list = [...publishedPosts];
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
  }, [publishedPosts, searchQuery, sortBy, filterAuthorId, profile?.discord_id, allProfilesForEdit]);

  // Peut modifier ce post : auteur, master admin, ou autorisé par l'auteur
  const canEditPost = useMemo(() => {
    return (post: PublishedPost): boolean => {
      if (!profile?.discord_id) return false;
      if (profile.discord_id === post.authorDiscordId) return true;
      if (profile.is_master_admin) return true;
      const authorProfileId = allProfilesForEdit.find(p => p.discord_id === post.authorDiscordId)?.id;
      return authorProfileId != null && ownerIdsWhoAllowedMe.has(authorProfileId);
    };
  }, [profile?.discord_id, profile?.is_master_admin, allProfilesForEdit, ownerIdsWhoAllowedMe]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedPosts.length / POSTS_PER_PAGE);
  const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
  const endIndex = startIndex + POSTS_PER_PAGE;
  const paginatedPosts = filteredAndSortedPosts.slice(startIndex, endIndex);

  const hasActiveFilters = Boolean(searchQuery.trim() || filterAuthorId);

  function resetFilters() {
    setSearchQuery('');
    setSortBy('date-desc');
    setFilterAuthorId('');
    setCurrentPage(1);
  }

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy, filterAuthorId]);

  async function handleDeleteDefinitively(post: PublishedPost) {
    const ok = await confirm({
      title: 'Supprimer définitivement',
      message:
        'Cette action va :\n' +
        '• Retirer le post de ton historique\n' +
        '• Le supprimer de la base de données\n' +
        '• Supprimer le thread (et tout son contenu) sur Discord\n\n' +
        'Cette action est irréversible.',
      confirmText: 'Supprimer définitivement',
      cancelText: 'Annuler',
      type: 'danger'
    });
    if (!ok) return;
    if (!post.threadId) {
      showToast('Aucun thread Discord associé ; suppression de l\'historique uniquement.', 'warning');
      deletePublishedPost(post.id);
      return;
    }
    const baseUrl = (localStorage.getItem('apiBase') || '').replace(/\/+$/, '');
    const apiKey = localStorage.getItem('apiKey') || '';
    if (!baseUrl || !apiKey) {
      showToast('URL API ou clé manquante dans la configuration', 'error');
      return;
    }
    try {
      const res = await fetch(`${baseUrl}/api/forum-post/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
        body: JSON.stringify({ threadId: post.threadId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404) {
          deletePublishedPost(post.id);
          showToast('Le thread était déjà supprimé sur Discord ; entrée retirée de l\'historique.', 'success');
          return;
        }
        const msg = data?.error || `Erreur ${res.status}`;
        showToast(msg, 'error');
        return;
      }
      deletePublishedPost(post.id);
      showToast('Publication supprimée définitivement (historique, base et Discord)', 'success');
    } catch (e: any) {
      showToast('Erreur réseau : ' + (e?.message || 'inconnue'), 'error');
    }
  }

  function handleEdit(post: PublishedPost) {
    try {
      loadPostForEditing(post);
      showToast('Post chargé en mode édition', 'info');
      if (onClose) onClose();
    } catch (e: any) {
      showToast('Erreur lors du chargement du post: ' + (e.message || 'inconnue'), 'error');
      console.error('Erreur chargement post:', e);
    }
  }

  function formatDate(timestamp: number) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  return (
    <div className="modal">
      <div
        className="panel"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 1200,
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: '1px solid var(--border)'
        }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>📋 Historique des publications</h3>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {publishedPosts.length} publication{publishedPosts.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Filtres : auteur, recherche, tri + réinitialiser */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={filterAuthorId}
            onChange={(e) => setFilterAuthorId(e.target.value)}
            style={{
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13,
              color: 'var(--text)',
              cursor: 'pointer',
              minWidth: 160
            }}
          >
            <option value="">Tous les auteurs</option>
            <option value="me">Moi</option>
            {allProfilesForEdit
              .filter(p => p.discord_id !== profile?.discord_id)
              .map(p => (
                <option key={p.id} value={p.id}>{p.pseudo || p.discord_id || p.id}</option>
              ))}
          </select>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher (titre, contenu, tags)..."
            style={{
              flex: 1,
              minWidth: 180,
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13,
              color: 'var(--text)'
            }}
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date-desc' | 'date-asc')}
            style={{
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13,
              color: 'var(--text)',
              cursor: 'pointer'
            }}
          >
            <option value="date-desc">Plus récent</option>
            <option value="date-asc">Plus ancien</option>
          </select>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              style={{
                padding: '10px 14px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 13,
                color: 'var(--muted)',
                cursor: 'pointer'
              }}
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>

        {/* Liste scrollable en grille 2 colonnes */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {error && (
            <div style={{
              color: 'var(--error)',
              padding: 16,
              textAlign: 'center',
              background: 'rgba(240, 71, 71, 0.1)',
              borderRadius: 8,
              marginBottom: 12
            }}>
              ⚠️ {error}
            </div>
          )}

          {isLoading && (
            <div style={{
              color: 'var(--muted)',
              padding: 40,
              textAlign: 'center'
            }}>
              ⏳ Chargement de l'historique...
            </div>
          )}

          {!isLoading && filteredAndSortedPosts.length === 0 ? (
            <div style={{
              color: 'var(--muted)',
              fontStyle: 'italic',
              padding: 32,
              textAlign: 'center',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 10
            }}>
              {searchQuery.trim() ? 'Aucune publication ne correspond à la recherche.' : 'Aucune publication dans l\'historique.'}
            </div>
          ) : (
            <>
              {totalPages > 1 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                  fontSize: 12,
                  color: 'var(--muted)'
                }}>
                  <span>{filteredAndSortedPosts.length} résultat{filteredAndSortedPosts.length !== 1 ? 's' : ''}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      style={{
                        padding: '4px 10px',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        background: 'transparent',
                        color: 'var(--text)',
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                        opacity: currentPage === 1 ? 0.5 : 1
                      }}
                    >
                      ← Préc.
                    </button>
                    <span>Page {currentPage} / {totalPages}</span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      style={{
                        padding: '4px 10px',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        background: 'transparent',
                        color: 'var(--text)',
                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                        opacity: currentPage === totalPages ? 0.5 : 1
                      }}
                    >
                      Suiv. →
                    </button>
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {paginatedPosts.map((post) => (
                  <div
                    key={post.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '12px 16px',
                      background: 'rgba(255,255,255,0.02)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      flexWrap: 'wrap'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{post.title || 'Sans titre'}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span>Créé le {formatDate(post.createdAt ?? post.timestamp)}</span>
                        <span>•</span>
                        <span>Modifié le {formatDate(post.updatedAt ?? post.timestamp)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {canEditPost(post) && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleEdit(post)}
                            style={{
                              padding: '6px 12px',
                              background: 'var(--accent)',
                              border: 'none',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#fff'
                            }}
                          >
                            ✏️ Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDefinitively(post)}
                            style={{
                              padding: '6px 10px',
                              background: 'transparent',
                              border: '1px solid var(--error, #ef4444)',
                              color: 'var(--error, #ef4444)',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 12
                            }}
                            title="Supprimer définitivement (historique, base et Discord)"
                          >
                            🗑️ Supprimer définitivement
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px solid var(--border)'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              fontWeight: 600
            }}
          >
            🚪 Fermer
          </button>
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
