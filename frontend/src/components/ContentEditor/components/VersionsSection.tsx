// frontend/src/components/ContentEditorComponents/VersionsSection.tsx

interface VersionsSectionProps {
  gameVersion: string;
  onGameVersionChange: (value: string) => void;
  translateVersion: string;
  onTranslateVersionChange: (value: string) => void;
  canEditGameVersion: boolean;
  canEditTranslateVersion: boolean;
  onSyncVersion: () => void;
}

export default function VersionsSection({
  gameVersion,
  onGameVersionChange,
  translateVersion,
  onTranslateVersionChange,
  canEditGameVersion,
  canEditTranslateVersion,
  onSyncVersion,
}: VersionsSectionProps) {
  return (
    <div className="form-grid form-grid--3col-versions">
      <div className="form-field">
        <label className="form-label">Version du jeu</label>
        <input
          value={gameVersion}
          onChange={(e) => onGameVersionChange(e.target.value)}
          disabled={!canEditGameVersion}
          className={`form-input ${!canEditGameVersion ? 'form-input--disabled' : ''}`}
          placeholder="v1.0.4"
        />
      </div>

      <div className="pb-4">
        <button
          type="button"
          onClick={onSyncVersion}
          title="Copier la version du jeu vers la version traduite"
          className="form-btn form-btn--icon-sm"
        >
          ⇆
        </button>
      </div>

      <div className="form-field">
        <label className="form-label">Version de la trad</label>
        <input
          value={translateVersion}
          onChange={(e) => onTranslateVersionChange(e.target.value)}
          disabled={!canEditTranslateVersion}
          className={`form-input ${!canEditTranslateVersion ? 'form-input--disabled' : ''}`}
          placeholder="v1.0.4"
        />
      </div>
    </div>
  );
}
