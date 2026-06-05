import { useEffect } from 'react';
import { applyWorkImportAsync, type WorkImportPayload } from '../workTracking/applyWorkImport';

type WorkImportListenerDeps = {
  setInput: (key: string, value: string) => void;
  addImageFromUrl: (url: string, options?: { previewUrl?: string }) => void;
  setWebtoonViewActive: (active: boolean) => void;
  calendarViewAvailable: boolean;
  onImported?: (result: { imageOk: boolean }) => void;
};

/** Applique les imports suivi d'œuvres (Tampermonkey → formulaire Webtoon). */
export function useWorkImportListener(deps: WorkImportListenerDeps) {
  const {
    setInput,
    addImageFromUrl,
    setWebtoonViewActive,
    calendarViewAvailable,
    onImported,
  } = deps;

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<WorkImportPayload>).detail;
      if (!detail) return;

      if (calendarViewAvailable) {
        setWebtoonViewActive(true);
      }

      void applyWorkImportAsync(detail, { setInput, addImageFromUrl }).then(onImported);
    };

    window.addEventListener('work-tracking:import', handler);
    return () => window.removeEventListener('work-tracking:import', handler);
  }, [
    setInput,
    addImageFromUrl,
    setWebtoonViewActive,
    calendarViewAvailable,
    onImported,
  ]);
}
