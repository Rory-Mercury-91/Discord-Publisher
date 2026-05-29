import type { ConfirmOptions } from '../../../hooks/useConfirm';

interface EditorHeaderProps {
  editingPostId: string | null;
  translatorOptions: Array<{ id: string; name: string; kind: 'profile' | 'external' }>;
  selectedTranslatorId: string;
  onTranslatorChange: (id: string) => void;
  onImportData: () => void;
  onResetForm: () => void;
  onExitEditMode: () => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

export default function EditorHeader({
  editingPostId,
  translatorOptions,
  selectedTranslatorId,
  onTranslatorChange,
  onImportData,
  onResetForm,
  onExitEditMode,
  confirm,
}: EditorHeaderProps) {
  const handleExitEditMode = async () => {
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
      type: 'danger'
    });

    if (ok) {
      onResetForm();
    }
  };
  return (
    <div className="editor-toolbar">
      <h4 className="editor-toolbar__title">
        📝 Contenu du post Discord
        {editingPostId && (
          <>
            <span className="editor-toolbar__badge">✏️ Mode modification</span>
            <button
              type="button"
              onClick={handleExitEditMode}
              className="form-btn form-btn--ghost"
              title="Abandonner les modifications et repasser en mode création"
            >
              ✕ Quitter l'édition
            </button>
          </>
        )}
      </h4>

      <div className="editor-toolbar__actions">
        <button type="button" onClick={onImportData} className="form-btn form-btn--toolbar form-btn--import">
          📥 Importer Données
        </button>
        <button type="button" onClick={handleReset} className="form-btn form-btn--toolbar form-btn--reset">
          🗑️ Vider le formulaire
        </button>

        {translatorOptions.length > 1 && (
          <>
            <div className="editor-toolbar__divider" />
            <div className="editor-toolbar__select-wrap">
              <span className="editor-toolbar__label-sm">
                👤 Publier pour :
              </span>
              <select
                value={selectedTranslatorId}
                onChange={(e) => onTranslatorChange(e.target.value)}
                className="editor-toolbar__select"
              >
                {translatorOptions.map(opt => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
