import { useEffect, useMemo, useRef, useState } from 'react';
import type { AuthorFilterOption } from '../historyDefaultAuthorFilter';
import { buildAuthorFilterOptions } from '../historyDefaultAuthorFilter';
import type { ExternalTranslatorPublic, ProfilePublic } from '../constants';

interface HistoryAuthorSelectProps {
  filterAuthorId: string;
  defaultAuthorFilterId: string | null;
  onFilterAuthorChange: (id: string) => void;
  onDefaultAuthorChange: (id: string | null) => void;
  allProfiles: ProfilePublic[];
  externalTranslators: ExternalTranslatorPublic[];
  currentUserDiscordId: string | undefined;
  currentUserPseudo: string | undefined;
  showDefaultStar: boolean;
}

function groupPrefix(group: AuthorFilterOption['group']): string {
  if (group === 'profile') return '👤 ';
  if (group === 'external') return '🔧 ';
  return '';
}

export default function HistoryAuthorSelect({
  filterAuthorId,
  defaultAuthorFilterId,
  onFilterAuthorChange,
  onDefaultAuthorChange,
  allProfiles,
  externalTranslators,
  currentUserDiscordId,
  currentUserPseudo,
  showDefaultStar,
}: HistoryAuthorSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const options = useMemo(
    () =>
      buildAuthorFilterOptions({
        currentUserPseudo,
        allProfiles,
        externalTranslators,
        currentUserDiscordId,
      }),
    [currentUserPseudo, allProfiles, externalTranslators, currentUserDiscordId]
  );

  const selectedLabel =
    options.find((o) => o.id === filterAuthorId)?.label ?? 'Moi';

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function handlePickOption(id: string) {
    onFilterAuthorChange(id);
    setOpen(false);
  }

  function handleToggleDefault(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!showDefaultStar || !id) return;
    if (defaultAuthorFilterId === id) {
      onDefaultAuthorChange(null);
      return;
    }
    onDefaultAuthorChange(id);
  }

  if (!showDefaultStar) {
    return (
      <select
        className="history-filters__select history-filters__select--author"
        value={filterAuthorId}
        onChange={(e) => onFilterAuthorChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.id || '__all__'} value={o.id}>
            {groupPrefix(o.group)}
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="history-author-select" ref={rootRef}>
      <button
        type="button"
        className="history-author-select__trigger history-filters__select history-filters__select--author"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="history-author-select__trigger-label">{selectedLabel}</span>
        <span className="history-author-select__chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul className="history-author-select__menu" role="listbox">
          {options.map((o) => {
            const isSelected = o.id === filterAuthorId;
            const isDefault = !!o.id && defaultAuthorFilterId === o.id;
            return (
              <li
                key={o.id || '__all__'}
                className={`history-author-select__row${isSelected ? ' history-author-select__row--selected' : ''}`}
                role="option"
                aria-selected={isSelected}
              >
                <button
                  type="button"
                  className="history-author-select__option"
                  onClick={() => handlePickOption(o.id)}
                >
                  <span className="history-author-select__option-label">
                    {groupPrefix(o.group)}
                    {o.label}
                  </span>
                </button>
                {o.id ? (
                  <button
                    type="button"
                    className={`history-author-select__star${isDefault ? ' history-author-select__star--active' : ''}`}
                    onClick={(e) => handleToggleDefault(e, o.id)}
                    title={
                      isDefault
                        ? "Retirer l'ouverture par défaut sur cet auteur"
                        : "Ouvrir l'historique sur cet auteur par défaut"
                    }
                    aria-label={
                      isDefault
                        ? "Retirer l'ouverture par défaut sur cet auteur"
                        : `Définir ${o.label} comme auteur par défaut à l'ouverture`
                    }
                    aria-pressed={isDefault}
                  >
                    {isDefault ? '★' : '☆'}
                  </button>
                ) : (
                  <span className="history-author-select__star-spacer" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
