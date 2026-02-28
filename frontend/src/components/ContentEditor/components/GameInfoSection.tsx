// frontend/src/components/ContentEditorComponents/GameInfoSection.tsx

interface GameInfoSectionProps {
  gameName: string;
  onGameNameChange: (value: string) => void;
  gameVersion: string;
  onGameVersionChange: (value: string) => void;
  translateVersion: string;
  onTranslateVersionChange: (value: string) => void;

  canEditGameName: boolean;
  canEditGameVersion: boolean;
  canEditTranslateVersion: boolean;

  onSyncVersion: () => void;
}

export default function GameInfoSection({
  gameName,
  onGameNameChange,
  gameVersion,
  onGameVersionChange,
  translateVersion,
  onTranslateVersionChange,
  canEditGameName,
  canEditGameVersion,
  canEditTranslateVersion,
  onSyncVersion,
}: GameInfoSectionProps) {
  return (
    <div className="form-grid form-grid--3col-versions">
      <div className="form-field">
        <label className="form-label">Nom du jeu</label>
        <input
          value={gameName}
          onChange={(e) => onGameNameChange(e.target.value)}
          disabled={!canEditGameName}
          className={`form-input ${!canEditGameName ? 'form-input--disabled' : ''}`}
          placeholder="Nom du jeu"
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
          placeholder="v1.0"
        />
      </div>

      <div className="form-field grid-cell--span2">
        <label className="form-label">Version du jeu</label>
        <input
          value={gameVersion}
          onChange={(e) => onGameVersionChange(e.target.value)}
          disabled={!canEditGameVersion}
          className={`form-input ${!canEditGameVersion ? 'form-input--disabled' : ''}`}
          placeholder="v1.0.4"
        />
      </div>
    </div>
  );
}
