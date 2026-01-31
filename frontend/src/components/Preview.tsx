interface PreviewProps {
  /** Contenu affiché (template + variables) en lecture seule. */
  preview: string;
  setPreviewContent: (value: string) => void; // Non utilisé (lecture seule), conservé pour compatibilité
  onCopy: () => void;
  onOpenDiscordPreview?: () => void;
}

export default function Preview({
  preview,
  setPreviewContent,
  onCopy,
  onOpenDiscordPreview
}: PreviewProps) {
  const characterCount = preview.length;
  const isOverLimit = characterCount > 2000;

  return (
    <div className="preview-section" style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      height: '100%',
      minHeight: 0,
      background: 'var(--bg)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {onOpenDiscordPreview && (
            <button
              onClick={onOpenDiscordPreview}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 13,
                height: 32,
                fontWeight: 500
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(88, 101, 242, 0.1)';
                e.currentTarget.style.borderColor = '#5865f2';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              🎨 Aperçu Discord
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: isOverLimit ? 'var(--error)' : 'var(--text)',
            padding: '6px 12px',
            background: isOverLimit ? 'rgba(239, 68, 68, 0.1)' : 'rgba(74, 158, 255, 0.1)',
            border: `1px solid ${isOverLimit ? 'var(--error)' : 'rgba(74, 158, 255, 0.3)'}`,
            borderRadius: 4,
            height: 32,
            display: 'flex',
            alignItems: 'center'
          }}>
            {characterCount} / 2000
            {isOverLimit && (
              <span style={{ marginLeft: 8, fontSize: 11 }}>
                ⚠️ +{characterCount - 2000}
              </span>
            )}
          </div>
          <button
            onClick={onCopy}
            title="Copier le preview"
            style={{
              padding: '6px 12px',
              fontSize: 13,
              height: 32,
              border: '1px solid var(--border)',
              borderRadius: 4,
              cursor: 'pointer',
              background: 'transparent',
              color: 'inherit'
            }}
          >
            📋 Copier
          </button>
        </div>
      </div>

      <div className="preview-body styled-scrollbar" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <textarea
          readOnly={true}
          value={preview}
          placeholder="L'aperçu (template + variables) s'affiche ici en lecture seule."
          style={{
            width: '100%',
            height: '100%',
            minHeight: 200,
            fontFamily: 'monospace',
            padding: 12,
            borderRadius: 6,
            background: '#2b2d31',
            color: '#dbdee1',
            border: '1px solid var(--border)',
            resize: 'none',
            cursor: 'default'
          }}
        />
      </div>
    </div>
  );
}
