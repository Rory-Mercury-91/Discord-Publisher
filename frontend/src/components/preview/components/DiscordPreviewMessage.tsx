import DiscordMarkdownContent from './DiscordMarkdownContent';
import PreviewImage from './PreviewImage';

interface DiscordPreviewMessageProps {
  processedPreview: string;
  imagePathToDisplay?: string;
}

export default function DiscordPreviewMessage({
  processedPreview,
  imagePathToDisplay,
}: DiscordPreviewMessageProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        padding: '0 20px',
        fontFamily: "'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif",
        position: 'relative',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #5865f2 0%, #3b3c42 100%)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          fontWeight: 600,
          color: 'white',
          position: 'relative',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontFamily: 'Noto Color Emoji, Segoe UI Emoji' }}>🤖</span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 600, color: '#ffffff' }}>
            Système de Publication
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 6px',
              background: '#5865f2',
              color: 'white',
              borderRadius: 3,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              lineHeight: '14px',
            }}
          >
            APP
          </span>
          <span style={{ fontSize: 12, color: '#72767d', marginLeft: 4 }}>
            Aujourd'hui à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <DiscordMarkdownContent processedPreview={processedPreview} />

        {imagePathToDisplay && (
          <div style={{ marginTop: 16 }}>
            <PreviewImage imagePath={imagePathToDisplay} />
          </div>
        )}
      </div>
    </div>
  );
}
