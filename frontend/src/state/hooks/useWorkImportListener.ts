import { useEffect, useCallback } from 'react';
import { filterWebtoonSelectableTagIds } from '../../components/tags/constants';
import type { Tag } from '../types';
import { applyWorkImportAsync, mergeWorkTypeTagId, type WorkImportPayload } from '../workTracking/applyWorkImport';
import type { WorkTypeKey } from '../workTracking/types';

type WorkImportListenerDeps = {
  setInput: (key: string, value: string) => void;
  addImageFromUrl: (url: string, options?: { previewUrl?: string }) => void;
  setWebtoonViewActive: (active: boolean) => void;
  calendarViewAvailable: boolean;
  postTags: string;
  setPostTags: (s: string) => void;
  savedTags: Parameters<typeof mergeWorkTypeTagId>[2];
  onImported?: (result: { imageOk: boolean }) => void;
};

/** Applique les imports suivi d'œuvres (Tampermonkey → formulaire Webtoon). */
export function useWorkImportListener(deps: WorkImportListenerDeps) {
  const {
    setInput,
    addImageFromUrl,
    setWebtoonViewActive,
    calendarViewAvailable,
    postTags,
    setPostTags,
    savedTags,
    onImported,
  } = deps;

  const applyWorkTypeTag = useCallback(
    (workType: WorkTypeKey) => {
      const ids = postTags ? postTags.split(',').map(s => s.trim()).filter(Boolean) : [];
      const cleaned = filterWebtoonSelectableTagIds(ids, savedTags as Tag[]);
      const merged = mergeWorkTypeTagId(workType, cleaned, savedTags);
      if (merged.join(',') !== cleaned.join(',')) {
        setPostTags(merged.join(','));
      }
    },
    [postTags, savedTags, setPostTags],
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<WorkImportPayload>).detail;
      if (!detail) return;

      if (calendarViewAvailable) {
        setWebtoonViewActive(true);
      }

      void applyWorkImportAsync(detail, {
        setInput,
        addImageFromUrl,
        applyWorkTypeTag,
      }).then(onImported);
    };

    window.addEventListener('work-tracking:import', handler);
    return () => window.removeEventListener('work-tracking:import', handler);
  }, [
    setInput,
    addImageFromUrl,
    applyWorkTypeTag,
    setWebtoonViewActive,
    calendarViewAvailable,
    onImported,
  ]);
}
