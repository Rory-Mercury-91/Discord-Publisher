interface TemplatesModalHeaderProps {
  onExport: () => void;
  importInputRef: React.RefObject<HTMLInputElement | null>;
}

export default function TemplatesModalHeader({
  onExport,
  importInputRef,
}: TemplatesModalHeaderProps) {
  return (
    <div className="templates-header">
      <h3 className="templates-header__title">📄 Gestion des templates & variables</h3>
      <div className="templates-header__actions">
        <button
          type="button"
          onClick={onExport}
          className="templates-btn-secondary"
          title="Exporter le template et les variables en JSON"
        >
          📤 Exporter
        </button>
        <button
          type="button"
          onClick={() => importInputRef.current?.click()}
          className="templates-btn-secondary"
          title="Importer un fichier JSON (template + variables)"
        >
          📥 Importer
        </button>
      </div>
    </div>
  );
}
