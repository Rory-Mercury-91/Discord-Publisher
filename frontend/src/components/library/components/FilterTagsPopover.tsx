/**
 * Popover pour filtrer la collection par tags : inclusion (jeu doit avoir le tag)
 * ou exclusion (jeu ne doit pas avoir le tag). Un clic sur un tag cycle : aucun → inclure → exclure → aucun.
 */
import { useRef, useEffect } from 'react';

export type FilterTagState = 'include' | 'exclude';

interface FilterTagsPopoverProps {
  allTags: string[];
  filterState: Record<string, FilterTagState>;
  onCycleTag: (tag: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export default function FilterTagsPopover({
  allTags,
  filterState,
  onCycleTag,
  onClose,
  anchorRef,
}: FilterTagsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const anchor = anchorRef.current;
      const pop = popoverRef.current;
      if (pop && anchor && !pop.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, anchorRef]);

  const includedCount = Object.values(filterState).filter((v) => v === 'include').length;
  const excludedCount = Object.values(filterState).filter((v) => v === 'exclude').length;

  return (
    <div ref={popoverRef} className="filter-tags-popover" role="dialog" aria-label="Filtrer par tags">
      <div className="filter-tags-popover-header">
        <span className="filter-tags-popover-title">Filtrer par tags</span>
        <p className="filter-tags-popover-desc">
          Inclure = afficher les jeux qui ont au moins un des tags inclus. Exclure = masquer les jeux qui ont ce tag. 1 clic = inclure, 2e = exclure, 3e = retirer. Un tag exclu prévaut.
        </p>
        {(includedCount > 0 || excludedCount > 0) && (
          <p className="filter-tags-popover-summary">
            <span className="filter-tags-chip filter-tags-chip--include">✓ {includedCount} inclus</span>
            {' '}
            <span className="filter-tags-chip filter-tags-chip--exclude">✕ {excludedCount} exclus</span>
          </p>
        )}
      </div>
      <div className="filter-tags-popover-body styled-scrollbar">
        {allTags.length === 0 ? (
          <p className="filter-tags-popover-empty">Aucun tag dans la collection.</p>
        ) : (
          <div className="filter-tags-popover-list">
            {allTags.map((tag) => {
              const state = filterState[tag];
              return (
                <button
                  key={tag}
                  type="button"
                  className={`filter-tags-popover-tag filter-tags-popover-tag--${state ?? 'off'}`}
                  onClick={() => onCycleTag(tag)}
                  title={state === 'include' ? `${tag} — inclus (clic pour exclure)` : state === 'exclude' ? `${tag} — exclu (clic pour retirer)` : `${tag} — clic pour inclure`}
                >
                  {state === 'include' && <span className="filter-tags-popover-tag-icon">✓</span>}
                  {state === 'exclude' && <span className="filter-tags-popover-tag-icon">✕</span>}
                  <span>{tag}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

