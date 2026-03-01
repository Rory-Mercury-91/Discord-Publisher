import { useMemo, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { useApp } from '../state/appContext';

interface StatsModalProps {
  onClose?: () => void;
}

export default function StatsModal({ onClose }: StatsModalProps) {
  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  const { publishedPosts, savedTags } = useApp();
  const [periodFilter, setPeriodFilter] = useState('all'); // all, 7d, 30d, 6m
  const [chartYear, setChartYear] = useState<number | 'all'>(() => new Date().getFullYear());

  // Filtrer les posts selon la période uniquement
  const filteredPosts = useMemo(() => {
    let filtered = [...publishedPosts];

    if (periodFilter !== 'all') {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;

      filtered = filtered.filter(post => {
        switch (periodFilter) {
          case '7d':
            return now - post.timestamp < 7 * day;
          case '30d':
            return now - post.timestamp < 30 * day;
          case '6m':
            return now - post.timestamp < 180 * day;
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [publishedPosts, periodFilter]);

  // Calculer les statistiques
  const stats = useMemo(() => {
    const total = filteredPosts.length;

    const translatorCount: Record<string, number> = {};
    const translatorTags = savedTags.filter(tag => tag.tagType === 'translator');

    filteredPosts.forEach(post => {
      if (post.tags) {
        const postTagIds = post.tags.split(',').map(t => t.trim()).filter(Boolean);
        postTagIds.forEach(tagId => {
          const translatorTag = translatorTags.find(t =>
            (t.id || t.name) === tagId || String(t.discordTagId ?? '') === tagId
          );
          if (translatorTag) {
            const translatorName = translatorTag.name;
            translatorCount[translatorName] = (translatorCount[translatorName] || 0) + 1;
          }
        });
      }
    });

    const topTranslators = Object.entries(translatorCount)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({ name, count }));

    const postsByMonth: Record<string, number> = {};
    filteredPosts.forEach(post => {
      const date = new Date(post.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      postsByMonth[monthKey] = (postsByMonth[monthKey] || 0) + 1;
    });

    const monthlyDataRaw = Object.entries(postsByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthKey, count]) => {
        const [y, monthNum] = monthKey.split('-');
        const year = parseInt(y, 10);
        const monthName = new Date(year, parseInt(monthNum, 10) - 1).toLocaleDateString('fr-FR', { month: 'short' });
        return { monthKey, monthName, count, year };
      });

    const availableYears = Array.from(new Set(monthlyDataRaw.map(d => d.year))).sort((a, b) => b - a);

    return {
      total,
      topTranslators,
      monthlyDataRaw,
      availableYears
    };
  }, [filteredPosts, savedTags]);

  const monthlyData = useMemo(() => {
    if (chartYear === 'all') return stats.monthlyDataRaw;
    return stats.monthlyDataRaw.filter(d => d.year === chartYear);
  }, [stats.monthlyDataRaw, chartYear]);

  return (
    <div className="modal">
      <div className="panel modal-panel--stats" onClick={e => e.stopPropagation()}>
        <div className="stats-modal__header">
          <h3>📈 Statistiques</h3>
        </div>

        <div className="stats-modal__body styled-scrollbar">
          {filteredPosts.length === 0 ? (
            <div className="stats-modal__empty">
              <div className="stats-modal__empty-icon">📭</div>
              <p>Aucune publication ne correspond aux filtres sélectionnés</p>
            </div>
          ) : (
            <>
              <div className="stats-modal__grid-row">
                <div className="stats-modal__card">
                  <div className="stats-modal__card-label">📅 Période</div>
                  <select
                    value={periodFilter}
                    onChange={(e) => setPeriodFilter(e.target.value)}
                    className="stats-modal__chart-select"
                  >
                    <option value="all">Toutes les périodes</option>
                    <option value="7d">7 derniers jours</option>
                    <option value="30d">30 derniers jours</option>
                    <option value="6m">6 derniers mois</option>
                  </select>
                </div>
                <div className="stats-modal__card stats-modal__card--total">
                  <div className="stats-modal__card-label">📚 Total</div>
                  <div className="stats-modal__total-value">{stats.total}</div>
                  <div className="stats-modal__total-sub">publications</div>
                </div>
              </div>

              <div className="stats-modal__section">
                <h4 className="stats-modal__section-title">👤 Répartition par traducteur</h4>
                {stats.topTranslators.length > 0 ? (
                  <div className="stats-modal__translators-grid">
                    {stats.topTranslators.map((translator, index) => (
                      <div key={translator.name} className="stats-modal__translator-card">
                        <div className="stats-modal__translator-info">
                          <div className={`stats-modal__translator-avatar stats-modal__translator-avatar--${(index % 5) + 1}`}>
                            #{index + 1}
                          </div>
                          <span className="stats-modal__translator-name">{translator.name}</span>
                        </div>
                        <div className={`stats-modal__translator-count stats-modal__translator-count--${(index % 5) + 1}`}>
                          {translator.count}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="stats-modal__empty-card">Aucune donnée</div>
                )}
              </div>

              <div>
                <div className="stats-modal__chart-header">
                  <h4>📆 Publications par mois</h4>
                  <select
                    value={chartYear}
                    onChange={(e) => setChartYear(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
                    className="stats-modal__chart-select"
                  >
                    <option value="all">Toutes les années</option>
                    {stats.availableYears.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                {monthlyData.length > 0 ? (
                  <div className="stats-modal__chart-box">
                    <div className="stats-modal__chart-bars">
                      {monthlyData.map((item) => {
                        const maxCount = Math.max(...monthlyData.map(d => d.count), 1);
                        const barHeightPercent = (item.count / maxCount) * 100;
                        return (
                          <div key={item.monthKey} className="stats-modal__chart-bar-wrap">
                            <div
                              className="stats-modal__chart-bar"
                              style={{ height: `${barHeightPercent}%`, minHeight: item.count > 0 ? 4 : 0 }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="stats-modal__chart-labels">
                      {monthlyData.map((item) => (
                        <div key={item.monthKey} className="stats-modal__chart-label-item">
                          <span className="stats-modal__chart-label-num">{item.count}</span>
                          <span className="stats-modal__chart-label-month">{item.monthName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="stats-modal__empty-card">
                    {chartYear === 'all' ? 'Aucune donnée' : `Aucune publication en ${chartYear} pour la période sélectionnée`}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="form-btn form-btn--ghost">↩️ Fermer</button>
        </div>
      </div>
    </div>
  );
}
