import PreviewToolbar from './components/PreviewToolbar';

interface PreviewProps {
  preview: string;
  setPreviewContent: (value: string) => void;
  onCopy: () => void;
  onOpenDiscordPreview?: () => void;
  templateName?: string;
  availableTemplates?: Array<{ id: string; name: string; isDefault?: boolean }>;
  currentTemplateIdx?: number;
  onTemplateChange?: (index: number) => void;
}

export default function Preview({
  preview,
  setPreviewContent: _setPreviewContent,
  onCopy,
  onOpenDiscordPreview,
  templateName,
  availableTemplates = [],
  currentTemplateIdx = 0,
  onTemplateChange,
}: PreviewProps) {
  const characterCount = preview.length;
  const isOverLimit = characterCount > 2000;

  return (
    <div
      className="preview-section"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        height: '100%',
        minHeight: 0,
        background: 'var(--bg)',
      }}
    >
      <PreviewToolbar
        templateName={templateName}
        availableTemplates={availableTemplates}
        currentTemplateIdx={currentTemplateIdx}
        onTemplateChange={onTemplateChange}
        onOpenDiscordPreview={onOpenDiscordPreview}
        characterCount={characterCount}
        isOverLimit={isOverLimit}
        onCopy={onCopy}
      />

      <div
        className="preview-body styled-scrollbar"
        style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}
      >
        <textarea
          readOnly
          value={preview}
          placeholder="L'aperçu (template + variables) s'affiche ici en lecture seule."
          style={{
            width: '100%',
            height: '100%',
            minHeight: 0,
            fontFamily: 'monospace',
            padding: 12,
            borderRadius: 6,
            background: '#2b2d31',
            color: '#dbdee1',
            border: '1px solid var(--border)',
            resize: 'none',
            cursor: 'default',
          }}
        />
      </div>
    </div>
  );
}
