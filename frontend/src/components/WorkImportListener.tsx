import { useApp } from '../state/appContext';
import { useWorkImportListener } from '../state/hooks/useWorkImportListener';
import { useWebtoonView } from '../state/webtoonViewContext';
import { useToast } from './shared/ToastProvider';

/** Pont entre Tampermonkey (événement global) et le formulaire suivi d'œuvres. */
export default function WorkImportListener() {
  const { setInput, addImageFromUrl } = useApp();
  const { setWebtoonViewActive, calendarViewAvailable } = useWebtoonView();
  const { showToast } = useToast();

  useWorkImportListener({
    setInput,
    addImageFromUrl,
    setWebtoonViewActive,
    calendarViewAvailable,
    onImported: ({ imageOk }) => {
      if (imageOk) {
        showToast('Données importées dans le formulaire suivi d\'œuvres !', 'success');
      } else {
        showToast('Données importées (couverture non chargée — réessayez ou ajoutez l\'image manuellement)', 'warning');
      }
    },
  });

  return null;
}
