import type { ConfirmOptions } from '../../../hooks/useConfirm';
import Toggle from '../../shared/Toggle';
import { WEBTOON_PUBLISH_LABEL } from '../../../state/calendarTemplate';

interface PublicationEditorToolbarProps {
  editingPostId: string | null;
  onResetForm: () => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  onExitEditMode?: () => void;
  /** Bouton importer (vue traduction uniquement). */
  showImport?: boolean;
  onImportData?: () => void;
  /** Toggle vue Webtoon (si la fonction est disponible). */
  showWebtoonViewToggle?: boolean;
  webtoonViewActive?: boolean;
  onWebtoonViewChange?: (active: boolean) => void;
  /** Sélecteur traducteur ou libellé Webtoon figé. */
  publishForMode?: 'translator' | 'webtoon' | 'none';
  translatorOptions?: Array<{ id: string; name: string }>;
  selectedTranslatorId?: string;
  onTranslatorChange?: (id: string) => void;
}

export default function PublicationEditorToolbar({
  editingPostId,
  onResetForm,
  confirm,
  onExitEditMode,
  showImport = false,
  onImportData,
  showWebtoonViewToggle = false,
  webtoonViewActive = false,
  onWebtoonViewChange,
  publishForMode = 'none',
  translatorOptions = [],
  selectedTranslatorId = '',
  onTranslatorChange,
}: PublicationEditorToolbarProps) {
  const handleExitEditMode = async () => {
    if (!onExitEditMode) return;
    const ok = await confirm({
      title: 'Quitter le mode édition',
      message: 'Abandonner les modifications non enregistrées ? Le formulaire repassera en mode création.',
      confirmText: 'Quitter',
      cancelText: 'Rester',
      type: 'warning',
    });
    if (ok) onExitEditMode();
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: 'Vider le formulaire',
      message: 'Voulez-vous vraiment vider tous les champs ? Cette action est irréversible.',
      confirmText: 'Vider',
      cancelText: 'Annuler',
      type: 'danger',
    });
    if (ok) onResetForm();
  };

  const showTranslatorSelect =
    publishForMode === 'translator' &&
    (translatorOptions.length > 1 || editingPostId) &&
    translatorOptions.length > 0;

  return (
    <div className="editor-toolbar">
      <h4 className="editor-toolbar__title">
        📝 Contenu du post Discord
        {editingPostId && (
          <>
            <span className="editor-toolbar__badge">✏️ Mode édition</span>
            {onExitEditMode && (
              <button
                type="button"
                onClick={() => void handleExitEditMode()}
                className="form-btn form-btn--ghost"
                title="Abandonner les modifications et repasser en mode création"
              >
                ✕ Quitter l&apos;édition
              </button>
            )}
          </>
        )}
      </h4>

      <div className="editor-toolbar__actions">
        {showImport && onImportData && (
          <button type="button" onClick={onImportData} className="form-btn form-btn--toolbar form-btn--import">
            📥 Importer Données
          </button>
        )}
        <button type="button" onClick={() => void handleReset()} className="form-btn form-btn--toolbar form-btn--reset">
          🗑️ Vider le formulaire
        </button>

        {showWebtoonViewToggle && onWebtoonViewChange && (
          <>
            <div className="editor-toolbar__divider" />
            <Toggle
              checked={webtoonViewActive}
              onChange={onWebtoonViewChange}
              label="Webtoon"
              title={
                webtoonViewActive
                  ? 'Passer à la publication traduction'
                  : 'Passer à la publication calendrier / Webtoon'
              }
              size="sm"
              className="editor-toolbar__view-toggle"
            />
          </>
        )}

        {(showTranslatorSelect || publishForMode === 'webtoon') && (
          <>
            <div className="editor-toolbar__divider" />
            <div className="editor-toolbar__select-wrap">
              <span className="editor-toolbar__label-sm">👤 Publier sur :</span>
              {publishForMode === 'webtoon' ? (
                <select
                  value="webtoon"
                  disabled
                  className="editor-toolbar__select editor-toolbar__select--disabled"
                >
                  <option value="webtoon">{WEBTOON_PUBLISH_LABEL}</option>
                </select>
              ) : (
                <select
                  value={selectedTranslatorId}
                  onChange={e => onTranslatorChange?.(e.target.value)}
                  className="editor-toolbar__select"
                >
                  {translatorOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
