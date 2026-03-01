interface DiscordPreviewHeaderProps {
  characterCount: number;
  isOverLimit: boolean;
  onCopy: () => void;
  onClose: () => void;
}

export default function DiscordPreviewHeader({
  characterCount,
  isOverLimit,
  onCopy,
  onClose,
}: DiscordPreviewHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        borderBottom: '1px solid #202225',
        background: '#2f3136',
      }}
    >
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#f2f3f5' }}>
        🎨 Aperçu Discord
      </h3>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: isOverLimit ? '#f23f42' : '#b9bbbe',
            padding: '4px 10px',
            background: isOverLimit ? 'rgba(242, 63, 66, 0.1)' : 'rgba(114, 137, 218, 0.1)',
            borderRadius: 4,
            border: `1px solid ${isOverLimit ? '#f23f42' : 'rgba(114, 137, 218, 0.3)'}`,
          }}
        >
          {characterCount} / 2000
          {isOverLimit && (
            <span style={{ marginLeft: 6, fontSize: 11 }}>⚠️ +{characterCount - 2000}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onCopy}
          style={{
            padding: '6px 12px',
            fontSize: 13,
            height: 32,
            border: '1px solid #4f545c',
            borderRadius: 4,
            cursor: 'pointer',
            background: '#5865f2',
            color: 'white',
            fontWeight: 500,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#4752c4';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#5865f2';
          }}
        >
          📋 Copier
        </button>
        <button
          type="button"
          onClick={onClose}
          className="form-btn form-btn--ghost"
          style={{
            padding: '6px 12px',
            fontSize: 13,
            height: 32,
          }}
        >
          ↩️ Fermer
        </button>
      </div>
    </div>
  );
}
