import { colorizeLogLine } from '../utils/logsUtils';

interface LogsViewerProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  displayedLogs: string;
  loading: boolean;
  error: string | null;
  onScroll: () => void;
  showScrollButton: boolean;
  onScrollToBottom: () => void;
}

export default function LogsViewer({
  containerRef,
  displayedLogs,
  loading,
  error,
  onScroll,
  showScrollButton,
  onScrollToBottom,
}: LogsViewerProps) {
  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className="logs-viewer styled-scrollbar"
    >
      {error ? (
        <div style={{ color: 'var(--error)' }}>❌ {error}</div>
      ) : loading ? (
        <div style={{ color: 'var(--muted)' }}>⏳ Chargement des logs...</div>
      ) : displayedLogs ? (
        <div style={{ minWidth: 0 }}>
          {displayedLogs.split('\n').map((line, idx) => (
            <div key={idx} className="logs-viewer__line">
              <div className="logs-viewer__num">{idx + 1}</div>
              <div className="logs-viewer__content">
                {line ? colorizeLogLine(line) : '\u00A0'}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: 'var(--muted)', padding: 16 }}>
          Aucun log visible. Activez au moins une source ci-dessus.
        </div>
      )}

      {showScrollButton && !loading && displayedLogs && (
        <button
          type="button"
          onClick={onScrollToBottom}
          title="Retour en bas"
          className="logs-scroll-btn"
        >
          ▼
        </button>
      )}
    </div>
  );
}
