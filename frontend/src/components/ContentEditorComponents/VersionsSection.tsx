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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'end' }}>
      {/* Version du jeu */}
      <div>
        <label style={{
          display: 'block',
          fontSize: 13,
          color: 'var(--muted)',
          marginBottom: 6,
          fontWeight: 600
        }}>
          Version du jeu
        </label>
        <input
          value={gameVersion}
          onChange={(e) => onGameVersionChange(e.target.value)}
          disabled={!canEditGameVersion}
          style={{
            width: '100%',
            height: '40px',
            borderRadius: 6,
            padding: '0 12px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            opacity: canEditGameVersion ? 1 : 0.6,
            cursor: canEditGameVersion ? 'text' : 'not-allowed'
          }}
          placeholder="v1.0.4"
        />
      </div>

      {/* Bouton Sync */}
      <div style={{ paddingBottom: '4px' }}>
        <button
          type="button"
          onClick={onSyncVersion}
          title="Copier la version du jeu vers la version traduite"
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            width: '32px',
            height: '32px',
            borderRadius: '4px',
            fontSize: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          ⇆
        </button>
      </div>

      {/* Version de la traduction */}
      <div>
        <label style={{
          display: 'block',
          fontSize: 13,
          color: 'var(--muted)',
          marginBottom: 6,
          fontWeight: 600
        }}>
          Version de la trad
        </label>
        <input
          value={translateVersion}
          onChange={(e) => onTranslateVersionChange(e.target.value)}
          disabled={!canEditTranslateVersion}
          style={{
            width: '100%',
            height: '40px',
            borderRadius: 6,
            padding: '0 12px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            opacity: canEditTranslateVersion ? 1 : 0.6,
            cursor: canEditTranslateVersion ? 'text' : 'not-allowed'
          }}
          placeholder="v1.0"
        />
      </div>
    </div>
  );
}
