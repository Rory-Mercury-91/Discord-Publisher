import type { TabId } from '../constants';

interface HistoryTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  activeCount: number;
  archivedCount: number;
}

export default function HistoryTabs({
  activeTab,
  onTabChange,
  activeCount,
  archivedCount,
}: HistoryTabsProps) {
  return (
    <div className="history-tabs">
      <button
        type="button"
        className={`history-tabs__btn ${activeTab === 'actifs' ? 'history-tabs__btn--active' : ''}`}
        onClick={() => onTabChange('actifs')}
      >
        Actifs ({activeCount})
      </button>
      <button
        type="button"
        className={`history-tabs__btn ${activeTab === 'archive' ? 'history-tabs__btn--active' : ''}`}
        onClick={() => onTabChange('archive')}
      >
        Archive ({archivedCount})
      </button>
    </div>
  );
}
