import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PublishedPost } from '../../../state/appContext';
import { useApp } from '../../../state/appContext';
import { useAuth } from '../../../state/authContext';
import { useToast } from '../../shared/ToastProvider';
import HeaderSearchResultItem from './HeaderSearchResultItem';

interface HeaderSearchProps {
  masterAdmin: boolean;
}

export default function HeaderSearch({ masterAdmin }: HeaderSearchProps) {
  const { publishedPosts, savedTags, loadPostForEditing } = useApp();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo((): PublishedPost[] => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return publishedPosts
      .filter(p => (p.title || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, publishedPosts]);

  const getTranslators = useCallback(
    (post: PublishedPost): string => {
      const ids = (post.tags || '').split(',').map(s => s.trim()).filter(Boolean);
      const names = savedTags
        .filter(t => t.tagType === 'translator' && ids.includes(String(t.discordTagId ?? '')))
        .map(t => t.name);
      return names.length ? names.join(', ') : '—';
    },
    [savedTags]
  );

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const handleSelect = useCallback(
    (post: PublishedPost) => {
      const canEdit = post.authorDiscordId === profile?.discord_id || masterAdmin;
      if (canEdit) {
        loadPostForEditing(post);
        showToast('Post chargé en mode édition', 'info');
        setShowDrop(false);
        setQuery('');
      }
    },
    [profile?.discord_id, loadPostForEditing, showToast, masterAdmin]
  );

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  return (
    <div ref={searchWrapRef} className="app-header-search">
      <div className="app-header-search__input-wrap">
        <span className="app-header-search__icon">🔍</span>
        <input
          type="text"
          className="app-input"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setShowDrop(true);
          }}
          onFocus={() => query.trim() && setShowDrop(true)}
          placeholder="Rechercher parmi mes publications…"
        />
      </div>
      {showDrop && query.trim() && (
        <div className="app-header-search-dropdown">
          {results.length === 0 ? (
            <div className="app-header-search-dropdown__empty">Aucune publication trouvée</div>
          ) : (
            results.map(post => {
              const canEdit = post.authorDiscordId === profile?.discord_id || masterAdmin;
              return (
                <HeaderSearchResultItem
                  key={post.id}
                  post={post}
                  translatorsLabel={getTranslators(post)}
                  dateLabel={fmtDate(post.timestamp)}
                  canEdit={canEdit}
                  onSelect={() => handleSelect(post)}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
