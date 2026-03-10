/**
 * Popover pour filtrer la collection par labels personnalisés.
 * Même logique que FilterTagsPopover : clic cycle none → inclure → exclure → none.
 */
import { useRef, useEffect } from 'react';
import type { CollectionLabel } from '../../../state/hooks/useCollection';

export type FilterLabelState = 'include' | 'exclude';

interface FilterLabelsPopoverProps {
  allLabels: CollectionLabel[];
  filterState: Record<string, FilterLabelState>;
  onCycleLabel: (label: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export default function FilterLabelsPopover({
  allLabels,
  filterState,
  onCycleLabel,
  onClose,
  anchorRef,
}: FilterLabelsPopoverProps) {
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

  const includedCount = Object.values(filterState).filter(v => v === 'include').length;
  const excludedCount = Object.values(filterState).filter(v => v === 'exclude').length;

  return (
    <div ref={popoverRef} className="filter-tags-popover" role="dialog" aria-label="Filtrer par labels">
      <div className="filter-tags-popover-header">
        <span className="filter-tags-popover-title">Filtrer par labels</span>
        <p className="filter-tags-popover-desc">
          Inclure = afficher uniquement les jeux avec au moins un des labels inclus. Exclure = masquer les jeux
          avec ce label. 1 clic = inclure, 2e = exclure, 3e = retirer.
        </p>
        {(includedCount > 0 || excludedCount > 0) && (
          <p className="filter-tags-popover-summary">
            <span className="filter-tags-chip filter-tags-chip--include">✓ {includedCount} inclus</span>{' '}
            <span className="filter-tags-chip filter-tags-chip--exclude">✕ {excludedCount} exclus</span>
          </p>
        )}
      </div>

      <div className="filter-tags-popover-body styled-scrollbar">
        {allLabels.length === 0 ? (
          <p className="filter-tags-popover-empty">Aucun label dans la collection.</p>
        ) : (
          <div className="filter-tags-popover-list">
            {allLabels.map(({ label, color }) => {
              const state = filterState[label];
              return (
                <button
                  key={label}
                  type="button"
                  className={`filter-tags-popover-tag filter-tags-popover-tag--${state ?? 'off'}`}
                  style={
                    state
                      ? { borderColor: color, background: `${color}22`, color }
                      : { borderColor: `${color}66`, color }
                  }
                  onClick={() => onCycleLabel(label)}
                  title={
                    state === 'include'
                      ? `${label} — inclus (clic pour exclure)`
                      : state === 'exclude'
                      ? `${label} — exclu (clic pour retirer)`
                      : `${label} — clic pour inclure`
                  }
                >
                  {state === 'include' && <span className="filter-tags-popover-tag-icon">✓</span>}
                  {state === 'exclude' && <span className="filter-tags-popover-tag-icon">✕</span>}
                  <span
                    className="library-labels-badge"
                    style={{ background: `${color}22`, borderColor: `${color}66`, color }}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}