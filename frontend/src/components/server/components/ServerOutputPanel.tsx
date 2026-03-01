interface ActionResult {
  ts: number;
  action: string;
  output: string;
  ok: boolean;
}

interface ServerOutputPanelProps {
  result: ActionResult | null;
  isLoading: boolean;
  onExportTxt: () => void;
  onExportJson: () => void;
}

export default function ServerOutputPanel({
  result,
  isLoading,
  onExportTxt,
  onExportJson,
}: ServerOutputPanelProps) {
  const outputClass = result
    ? result.ok
      ? 'server-output server-output--ok'
      : 'server-output server-output--error'
    : 'server-output';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {result && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onExportTxt} className="server-btn server-btn--default">
            📄 .txt
          </button>
          <button type="button" onClick={onExportJson} className="server-btn server-btn--default">
            🔷 .json
          </button>
        </div>
      )}
      <div className={outputClass}>
        {isLoading
          ? '⏳ Exécution en cours…'
          : result
            ? `[${new Date(result.ts).toLocaleTimeString('fr-FR')}] ${result.action}\n${'─'.repeat(40)}\n${result.output}`
            : "Les résultats s'afficheront ici."}
      </div>
    </div>
  );
}
