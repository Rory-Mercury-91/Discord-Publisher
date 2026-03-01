interface HistoryModalHeaderProps {
  totalCount: number;
}

export default function HistoryModalHeader({ totalCount }: HistoryModalHeaderProps) {
  return (
    <div className="history-panel__header">
      <h3 className="history-panel__title">📋 Historique des publications</h3>
      <span className="history-panel__count">
        {totalCount} publication{totalCount !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
