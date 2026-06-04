import { useCallback, useEffect, useState } from 'react';
import {
  getRecentWebtoonSiteLabels,
  isWebtoonSiteLabelPickerEnabled,
  pushRecentWebtoonSiteLabels,
  setWebtoonSiteLabelPickerEnabled,
  WEBTOON_RECENT_SITES_CHANGED,
  WEBTOON_SITE_PICKER_CHANGED,
} from '../logic/recentWebtoonSiteLabels';

/** Préférence « suggérer les derniers sites » + liste locale des libellés récents. */
export function useWebtoonSiteLabelPicker() {
  const [pickerEnabled, setPickerEnabledState] = useState(isWebtoonSiteLabelPickerEnabled);
  const [recentLabels, setRecentLabels] = useState(getRecentWebtoonSiteLabels);

  const refreshRecentLabels = useCallback(() => {
    setRecentLabels(getRecentWebtoonSiteLabels());
  }, []);

  const setPickerEnabled = useCallback((enabled: boolean) => {
    setWebtoonSiteLabelPickerEnabled(enabled);
    setPickerEnabledState(enabled);
  }, []);

  useEffect(() => {
    const onPicker = () => setPickerEnabledState(isWebtoonSiteLabelPickerEnabled());
    const onRecent = () => refreshRecentLabels();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'webtoon_site_label_picker_enabled') onPicker();
      if (e.key === 'webtoon_recent_site_labels') onRecent();
    };
    window.addEventListener(WEBTOON_SITE_PICKER_CHANGED, onPicker);
    window.addEventListener(WEBTOON_RECENT_SITES_CHANGED, onRecent);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(WEBTOON_SITE_PICKER_CHANGED, onPicker);
      window.removeEventListener(WEBTOON_RECENT_SITES_CHANGED, onRecent);
      window.removeEventListener('storage', onStorage);
    };
  }, [refreshRecentLabels]);

  const recordSiteLabels = useCallback(
    (labels: string[]) => {
      const next = pushRecentWebtoonSiteLabels(labels);
      setRecentLabels(next);
    },
    []
  );

  return {
    pickerEnabled,
    setPickerEnabled,
    recentLabels,
    refreshRecentLabels,
    recordSiteLabels,
  };
}
