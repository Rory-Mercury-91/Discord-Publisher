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
    <div className="preview-section">
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

      <div className="preview-body styled-scrollbar">
        <textarea
          readOnly
          value={preview}
          placeholder="L'aperçu (template + variables) s'affiche ici en lecture seule."
        />
      </div>
    </div>
  );
}
