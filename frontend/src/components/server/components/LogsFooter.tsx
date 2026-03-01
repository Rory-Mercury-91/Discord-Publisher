import Toggle from '../../shared/Toggle';

interface LogsFooterProps {
  refreshMs: number;
  refreshSecondsInput: string;
  onRefreshSecondsChange: (value: string) => void;
  onRefreshSecondsBlur: (value: string) => void;
  autoRefreshEnabled: boolean;
  onAutoRefreshChange: (enabled: boolean) => void;
  onRefresh: () => void;
  onClose: () => void;
}

export default function LogsFooter({
  refreshMs,
  refreshSecondsInput,
  onRefreshSecondsChange,
  onRefreshSecondsBlur,
  autoRefreshEnabled,
  onAutoRefreshChange,
  onRefresh,
  onClose,
}: LogsFooterProps) {
  return (
    <div className="logs-footer">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>Auto-refresh : {Math.round(refreshMs / 1000)}s • fichier courant complet</span>
        <span
          style={{ textDecoration: 'underline dotted', cursor: 'help' }}
          title="Seul le fichier de logs courant (max 5 Mo) est affiche. Pour l'historique complet, contactez le developpeur."
        >
          ℹ️
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
        <Toggle
          checked={autoRefreshEnabled}
          onChange={onAutoRefreshChange}
          label="Auto-refresh"
          title="Active/desactive l'actualisation automatique"
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Delai (s)
          <input
            type="number"
            min={5}
            max={600}
            step={5}
            value={refreshSecondsInput}
            onChange={(e) => onRefreshSecondsChange(e.target.value)}
            onBlur={(e) => onRefreshSecondsBlur(e.target.value)}
            disabled={!autoRefreshEnabled}
            className="server-input"
            style={{ width: 64, padding: '4px 6px' }}
          />
        </label>
        <button type="button" onClick={onRefresh} className="server-btn server-btn--default">
          🔄 Rafraichir
        </button>
      </div>

      <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center' }}>
        <button type="button" onClick={onClose} className="form-btn form-btn--ghost">
          ↩️ Fermer
        </button>
      </div>
    </div>
  );
}
