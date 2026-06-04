/**
 * Vue Webtoon active (toggle header) vs disponibilité (préférences admin / globales).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, startTransition } from 'react';
import {
  CALENDAR_TEMPLATE_ID,
  getCalendarTemplateIndex,
  getDefaultTranslationTemplateIndex,
  isCalendarPublishedPost,
} from './calendarTemplate';
import { useUserPreferences } from './hooks/useUserPreferences';
import { useApp } from './appContext';
import type { Template } from './types';

const LS_WEBTOON_VIEW_ACTIVE = 'webtoon_view_active';

type SetWebtoonViewOptions = {
  /** Ne pas vider les tags (chargement depuis l'historique). */
  preserveTags?: boolean;
};

type WebtoonViewContextValue = {
  calendarViewAvailable: boolean;
  isWebtoonViewActive: boolean;
  setWebtoonViewActive: (active: boolean, options?: SetWebtoonViewOptions) => void;
};

const WebtoonViewContext = createContext<WebtoonViewContextValue | null>(null);

function resolveTemplateIndexForView(templates: Template[], webtoonActive: boolean): number {
  return webtoonActive
    ? getCalendarTemplateIndex(templates)
    : getDefaultTranslationTemplateIndex(templates);
}

export function WebtoonViewProvider({ children }: { children: React.ReactNode }) {
  const { showCalendarTemplate: calendarViewAvailable } = useUserPreferences();
  const { templates, setCurrentTemplateIdx, setPostTags, editingPostId, editingPostData } =
    useApp();

  const [isWebtoonViewActive, setIsWebtoonViewActive] = useState(() => {
    try {
      return localStorage.getItem(LS_WEBTOON_VIEW_ACTIVE) === 'true';
    } catch {
      return false;
    }
  });

  const templateInitDone = useRef(false);

  useEffect(() => {
    if (!calendarViewAvailable) {
      setIsWebtoonViewActive(false);
      try {
        localStorage.setItem(LS_WEBTOON_VIEW_ACTIVE, 'false');
      } catch {
        /* ignore */
      }
    }
  }, [calendarViewAvailable]);

  useEffect(() => {
    if (!calendarViewAvailable) return;
    try {
      localStorage.setItem(LS_WEBTOON_VIEW_ACTIVE, isWebtoonViewActive ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, [isWebtoonViewActive, calendarViewAvailable]);

  useEffect(() => {
    if (!calendarViewAvailable || templates.length === 0 || templateInitDone.current) return;
    templateInitDone.current = true;
    setCurrentTemplateIdx(resolveTemplateIndexForView(templates, isWebtoonViewActive));
  }, [calendarViewAvailable, templates.length, isWebtoonViewActive, templates, setCurrentTemplateIdx]);

  const setWebtoonViewActive = useCallback(
    (active: boolean, options?: SetWebtoonViewOptions) => {
      if (!calendarViewAvailable && active) return;
      if (active && !options?.preserveTags) {
        setPostTags('');
      }
      if (templates.length > 0) {
        setCurrentTemplateIdx(resolveTemplateIndexForView(templates, active));
      }
      startTransition(() => {
        setIsWebtoonViewActive(active);
      });
    },
    [calendarViewAvailable, templates, setCurrentTemplateIdx, setPostTags]
  );

  const prevWebtoonActiveRef = useRef(isWebtoonViewActive);
  const preserveTagsOnActivateRef = useRef(false);
  useEffect(() => {
    const wasActive = prevWebtoonActiveRef.current;
    prevWebtoonActiveRef.current = isWebtoonViewActive;
    if (!wasActive && isWebtoonViewActive && calendarViewAvailable && !preserveTagsOnActivateRef.current) {
      setPostTags('');
    }
    preserveTagsOnActivateRef.current = false;
  }, [isWebtoonViewActive, calendarViewAvailable, setPostTags]);

  // Ouverture depuis l'historique : basculer vue + template selon le type de publication
  useEffect(() => {
    if (!editingPostId || !editingPostData || !calendarViewAvailable) return;
    const wantWebtoon = isCalendarPublishedPost(editingPostData);
    preserveTagsOnActivateRef.current = true;
    if (wantWebtoon !== isWebtoonViewActive) {
      setWebtoonViewActive(wantWebtoon, { preserveTags: true });
    } else if (templates.length > 0) {
      setCurrentTemplateIdx(resolveTemplateIndexForView(templates, wantWebtoon));
    }
  }, [
    editingPostId,
    editingPostData,
    calendarViewAvailable,
    isWebtoonViewActive,
    setWebtoonViewActive,
    templates,
    setCurrentTemplateIdx,
  ]);

  const value = useMemo(
    () => ({
      calendarViewAvailable,
      isWebtoonViewActive: calendarViewAvailable && isWebtoonViewActive,
      setWebtoonViewActive,
    }),
    [calendarViewAvailable, isWebtoonViewActive, setWebtoonViewActive]
  );

  return <WebtoonViewContext.Provider value={value}>{children}</WebtoonViewContext.Provider>;
}

export function useWebtoonView(): WebtoonViewContextValue {
  const ctx = useContext(WebtoonViewContext);
  if (!ctx) {
    throw new Error('useWebtoonView doit être utilisé dans WebtoonViewProvider');
  }
  return ctx;
}

export { CALENDAR_TEMPLATE_ID };
