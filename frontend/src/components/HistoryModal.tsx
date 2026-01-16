import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp, PublishedPost } from '../state/appContext';
import { useToast } from './ToastProvider';
import { useConfirm } from '../hooks/useConfirm';
import ConfirmModal from './ConfirmModal';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

interface HistoryModalProps {
  onClose?: () => void;
}

// Composant pour lazy loading des images
function LazyImage({ src, alt, style }: { src: string; alt: string; style?: React.CSSProperties }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!imgRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '50px' }
    );

    observer.observe(imgRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <img
      ref={imgRef}
      src={isInView ? src : undefined}
      alt={alt}
      style={{
        ...style,
        opacity: isLoaded ? 1 : 0.5,
        transition: 'opacity 0.3s ease'
      }}
      onLoad={() => setIsLoaded(true)}
    />
  );
}

const POSTS_PER_PAGE = 20;

export default function HistoryModal({ onClose }: HistoryModalProps) {
  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();
  
  const { publishedPosts, deletePublishedPost, loadPostForEditing, loadPostForDuplication, fetchHistoryFromAPI } = useApp();
  const { showToast } = useToast();
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  // Gestion des erreurs et états de chargement
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Forcer le refresh de l'historique à l'ouverture de la modale
  // localStorage est la source principale, Koyeb est juste un backup
  useEffect(() => {
    setIsLoading(true);
    setError(null);
    
    // Récupérer depuis Koyeb (backup) pour synchroniser les posts récents
    // Mais localStorage reste la source principale
    fetchHistoryFromAPI()
      .then(() => {
        setIsLoading(false);
      })
      .catch((e: any) => {
        setIsLoading(false);
        // Ne pas afficher d'erreur si Koyeb n'est pas disponible
        // localStorage est la source principale, Koyeb est juste un backup
        console.log('ℹ️ Koyeb non disponible, utilisation de localStorage uniquement');
      });
  }, []); // Exécuté une seule fois à l'ouverture

  // États pour recherche et filtres
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // all, today, week, month, year
  const [templateFilter, setTemplateFilter] = useState('all'); // all, my, partner
  const [translatorFilter, setTranslatorFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date-desc'); // date-desc, date-asc, title-asc, title-desc
  const [currentPage, setCurrentPage] = useState(1);

  // Extraire la liste des traducteurs uniques
  const uniqueTranslators = useMemo(() => {
    const translators = new Set<string>();
    publishedPosts.forEach(post => {
      const content = post.content.toLowerCase();
      // Chercher le traducteur dans le contenu
      const translatorMatch = content.match(/traducteur[:\s]+([^\n]+)/i) || 
                             content.match(/translator[:\s]+([^\n]+)/i);
      if (translatorMatch && translatorMatch[1]) {
        const translator = translatorMatch[1].trim();
        if (translator && translator.length > 0 && translator.length < 50) {
          translators.add(translator);
        }
      }
    });
    return Array.from(translators).sort();
  }, [publishedPosts]);

  // Filtrer et trier les posts
  const filteredAndSortedPosts = useMemo(() => {
    let filtered = [...publishedPosts];

    // Recherche par titre, contenu et nom du jeu
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(post => {
        const title = post.title?.toLowerCase() || '';
        const content = post.content?.toLowerCase() || '';
        // Chercher le nom du jeu dans le contenu
        const gameMatch = content.match(/nom du jeu[:\s]+([^\n]+)/i) || 
                         content.match(/game[:\s]+([^\n]+)/i);
        const gameName = gameMatch ? gameMatch[1].toLowerCase() : '';
        
        return title.includes(query) || content.includes(query) || gameName.includes(query);
      });
    }

    // Filtre par date
    if (dateFilter !== 'all') {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      
      filtered = filtered.filter(post => {
        const postDate = post.timestamp;
        switch (dateFilter) {
          case 'today':
            return now - postDate < day;
          case 'week':
            return now - postDate < 7 * day;
          case 'month':
            return now - postDate < 30 * day;
          case 'year':
            return now - postDate < 365 * day;
          default:
            return true;
        }
      });
    }

    // Filtre par template
    if (templateFilter !== 'all') {
      filtered = filtered.filter(post => post.template === templateFilter);
    }

    // Filtre par traducteur
    if (translatorFilter !== 'all') {
      filtered = filtered.filter(post => {
        const content = post.content.toLowerCase();
        const translatorMatch = content.match(/traducteur[:\s]+([^\n]+)/i) || 
                               content.match(/translator[:\s]+([^\n]+)/i);
        if (translatorMatch && translatorMatch[1]) {
          return translatorMatch[1].trim().toLowerCase() === translatorFilter.toLowerCase();
        }
        return false;
      });
    }

    // Tri
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return b.timestamp - a.timestamp;
        case 'date-asc':
          return a.timestamp - b.timestamp;
        case 'title-asc':
          return (a.title || '').localeCompare(b.title || '');
        case 'title-desc':
          return (b.title || '').localeCompare(a.title || '');
        default:
          return 0;
      }
    });

    return filtered;
  }, [publishedPosts, searchQuery, dateFilter, templateFilter, translatorFilter, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedPosts.length / POSTS_PER_PAGE);
  const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
  const endIndex = startIndex + POSTS_PER_PAGE;
  const paginatedPosts = filteredAndSortedPosts.slice(startIndex, endIndex);

  // Reset page lors du changement de filtres
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFilter, templateFilter, translatorFilter, sortBy]);

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: 'Supprimer de l\'historique',
      message: 'Voulez-vous supprimer cette publication de l\'historique local ? (Le post Discord ne sera pas supprimé)',
      confirmText: 'Supprimer',
      type: 'warning'
    });
    if (!ok) return;
    deletePublishedPost(id);
    showToast('Publication supprimée de l\'historique', 'success');
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

  function handleDuplicate(post: any) {
    loadPostForDuplication(post);
    showToast('Contenu copié pour création d\'un nouveau post', 'success');
    if (onClose) onClose();
  }

  function handleOpen(url: string) {
    if (!url || url.trim() === '') {
      showToast('Lien Discord manquant ou invalide', 'error');
      return;
    }
    window.open(url, '_blank');
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

  function getTemplateLabel(type: string) {
    if (type === 'my') return '🇫🇷 Mes traductions';
    if (type === 'partner') return '🤝 Partenaire';
    return '📄 Autre';
  }

  return (
    <div className="modal">
      <div className="panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 1200, width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <h3>📋 Historique des publications</h3>

        {/* Barre de recherche */}
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 Rechercher par titre, contenu ou nom du jeu..."
            style={{ 
              width: '100%', 
              padding: '10px 14px', 
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 14,
              color: 'white'
            }}
          />
        </div>

        {/* Filtres et tri */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
          gap: 12, 
          marginBottom: 16 
        }}>
          {/* Filtre par date */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{ 
              padding: '8px 12px', 
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 13,
              color: 'white',
              cursor: 'pointer'
            }}
          >
            <option value="all">📅 Toutes les dates</option>
            <option value="today">Aujourd'hui</option>
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois</option>
            <option value="year">Cette année</option>
          </select>

          {/* Filtre par template */}
          <select
            value={templateFilter}
            onChange={(e) => setTemplateFilter(e.target.value)}
            style={{ 
              padding: '8px 12px', 
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 13,
              color: 'white',
              cursor: 'pointer'
            }}
          >
            <option value="all">📄 Tous les templates</option>
            <option value="my">✍️ Mes traductions</option>
            <option value="partner">🤝 Partenaires</option>
          </select>

          {/* Filtre par traducteur */}
          <select
            value={translatorFilter}
            onChange={(e) => setTranslatorFilter(e.target.value)}
            style={{ 
              padding: '8px 12px', 
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 13,
              color: 'white',
              cursor: 'pointer',
              opacity: uniqueTranslators.length === 0 ? 0.5 : 1
            }}
            disabled={uniqueTranslators.length === 0}
          >
            <option value="all">👤 Tous les traducteurs</option>
            {uniqueTranslators.map(translator => (
              <option key={translator} value={translator}>{translator}</option>
            ))}
          </select>

          {/* Tri */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ 
              padding: '8px 12px', 
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 13,
              color: 'white',
              cursor: 'pointer'
            }}
          >
            <option value="date-desc">📆 Plus récent</option>
            <option value="date-asc">📆 Plus ancien</option>
            <option value="title-asc">🔤 Titre A → Z</option>
            <option value="title-desc">🔤 Titre Z → A</option>
          </select>
        </div>

        {/* Pagination et compteur de résultats */}
        {filteredAndSortedPosts.length > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 6
          }}>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {filteredAndSortedPosts.length} publication{filteredAndSortedPosts.length > 1 ? 's' : ''}
              {searchQuery || dateFilter !== 'all' || templateFilter !== 'all' || translatorFilter !== 'all' 
                ? ` sur ${publishedPosts.length}` 
                : ''}
              {totalPages > 1 && ` • Page ${currentPage}/${totalPages}`}
            </div>
            
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{
                    fontSize: 12,
                    padding: '4px 10px',
                    background: currentPage === 1 ? 'var(--muted)' : 'var(--panel)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    opacity: currentPage === 1 ? 0.5 : 1
                  }}
                >
                  ← Précédent
                </button>
                <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{
                    fontSize: 12,
                    padding: '4px 10px',
                    background: currentPage === totalPages ? 'var(--muted)' : 'var(--panel)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    opacity: currentPage === totalPages ? 0.5 : 1
                  }}
                >
                  Suivant →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Liste scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', marginRight: -16, paddingRight: 16 }}>
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
              padding: 40, 
              textAlign: 'center',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 8
            }}>
              {searchQuery || dateFilter !== 'all' || templateFilter !== 'all' || translatorFilter !== 'all' ? (
                <>
                  Aucune publication ne correspond aux critères de recherche.
                  <div style={{ fontSize: 13, marginTop: 8 }}>
                    Essayez de modifier vos filtres ou votre recherche.
                  </div>
                </>
              ) : (
                <>
                  Aucune publication dans l'historique.
                  <div style={{ fontSize: 13, marginTop: 8 }}>
                    Les publications seront automatiquement sauvegardées ici après envoi.
                  </div>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {paginatedPosts.map((post) => (
              <div 
                key={post.id} 
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 16,
                  background: 'rgba(255,255,255,0.02)',
                  display: 'grid',
                  gap: 12
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                      {post.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span>{getTemplateLabel(post.template)}</span>
                      <span>•</span>
                      <span>📅 {formatDate(post.timestamp)}</span>
                      {post.tags && (
                        <>
                          <span>•</span>
                          <span>🏷️ {post.tags}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Content preview */}
                <div 
                  style={{
                    fontSize: 13,
                    color: 'var(--muted)',
                    maxHeight: 60,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.4
                  }}
                >
                  {post.content.substring(0, 200)}
                  {post.content.length > 200 && '...'}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {post.discordUrl && post.discordUrl.trim() !== '' && (
                    <button
                      onClick={() => handleOpen(post.discordUrl)}
                      style={{
                        fontSize: 13,
                        padding: '6px 12px',
                        background: 'var(--info)',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer'
                      }}
                      title="Ouvrir dans Discord"
                    >
                      🔗 Ouvrir
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(post)}
                    style={{
                      fontSize: 13,
                      padding: '6px 12px',
                      background: 'var(--accent)',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer'
                    }}
                    title="Charger pour modification"
                  >
                    ✏️ Modifier
                  </button>
                  <button
                    onClick={() => handleDelete(post.id)}
                    style={{
                      fontSize: 13,
                      padding: '6px 12px',
                      background: 'transparent',
                      border: '1px solid var(--error)',
                      color: 'var(--error)',
                      borderRadius: 4,
                      cursor: 'pointer'
                    }}
                    title="Supprimer de l'historique local"
                  >
                    🗑️ Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose}>🚪 Fermer</button>
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
