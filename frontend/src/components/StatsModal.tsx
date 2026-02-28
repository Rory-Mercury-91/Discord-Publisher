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

    // Filtre par période
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

    // Traducteurs les plus fréquents - Basé sur les tags avec tagType === 'translator'
    const translatorCount: Record<string, number> = {};

    // Récupérer tous les tags de traducteurs
    const translatorTags = savedTags.filter(tag => tag.tagType === 'translator');

    // Compter les occurrences de chaque tag traducteur dans les posts
    // post.tags peut contenir des IDs internes (id/name) ou des IDs Discord (discordTagId)
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

    // Publications par mois
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
      <div className="panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 1000, width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3>📈 Statistiques</h3>
        </div>

        {/* Contenu scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', marginRight: -16, paddingRight: 16 }}>
          {filteredPosts.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: 40,
              color: 'var(--muted)',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 8
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
              <p>Aucune publication ne correspond aux filtres sélectionnés</p>
            </div>
          ) : (
            <>
              {/* Ligne 1 : 📅 Période | 📚 Total */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div style={{
                  padding: 20,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  borderRadius: 12
                }}>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>📅 Période</div>
                  <select
                    value={periodFilter}
                    onChange={(e) => setPeriodFilter(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      fontSize: 14,
                      color: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="all">Toutes les périodes</option>
                    <option value="7d">7 derniers jours</option>
                    <option value="30d">30 derniers jours</option>
                    <option value="6m">6 derniers mois</option>
                  </select>
                </div>
                <div style={{
                  padding: 20,
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(37, 99, 235, 0.05))',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  borderRadius: 12
                }}>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>📚 Total</div>
                  <div style={{ fontSize: 36, fontWeight: 700, color: 'rgb(59, 130, 246)' }}>{stats.total}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>publications</div>
                </div>
              </div>

              {/* Ligne 2 : 👤 Répartition par traducteur (4 par ligne, pleine largeur) */}
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  👤 Répartition par traducteur
                </h4>
                {stats.topTranslators.length > 0 ? (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 12
                  }}>
                    {stats.topTranslators.map((translator, index) => (
                      <div
                        key={translator.name}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '12px 16px',
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid var(--border)',
                          borderRadius: 8
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <div style={{
                            width: 28,
                            height: 28,
                            flexShrink: 0,
                            borderRadius: '50%',
                            background: `linear-gradient(135deg, ${['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ef4444'][index % 5]}, ${['#2563eb', '#16a34a', '#9333ea', '#d97706', '#dc2626'][index % 5]})`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 700
                          }}>
                            #{index + 1}
                          </div>
                          <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{translator.name}</span>
                        </div>
                        <div style={{
                          fontSize: 15,
                          fontWeight: 600,
                          flexShrink: 0,
                          color: ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ef4444'][index % 5]
                        }}>
                          {translator.count}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 16,
                    color: 'var(--muted)',
                    fontSize: 13
                  }}>
                    Aucune donnée
                  </div>
                )}
              </div>

              {/* Ligne 3 : 📆 Publications par mois (pleine largeur, barres horizontales + select année) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <h4 style={{ fontSize: 16, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    📆 Publications par mois
                  </h4>
                  <select
                    value={chartYear}
                    onChange={(e) => setChartYear(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      fontSize: 13,
                      color: 'var(--text)',
                      cursor: 'pointer',
                      minWidth: 120
                    }}
                  >
                    <option value="all">Toutes les années</option>
                    {stats.availableYears.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                {monthlyData.length > 0 ? (
                  <div style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '16px 20px'
                  }}>
                    {/* Graphique en barres verticales : zone fixe 200px, barre max = plafond, overflow caché */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: 8,
                        height: 200,
                        boxSizing: 'border-box',
                        overflow: 'hidden'
                      }}>
                        {monthlyData.map((item) => {
                          const maxCount = Math.max(...monthlyData.map(d => d.count), 1);
                          const barHeightPercent = (item.count / maxCount) * 100;
                          return (
                            <div
                              key={item.monthKey}
                              style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'flex-end',
                                alignItems: 'center',
                                height: 200,
                                minHeight: 0
                              }}
                            >
                              <div style={{
                                width: '100%',
                                maxWidth: 40,
                                height: `${barHeightPercent}%`,
                                minHeight: item.count > 0 ? 4 : 0,
                                background: 'linear-gradient(180deg, #3b82f6, #2563eb)',
                                borderRadius: '4px 4px 0 0',
                                transition: 'height 0.3s ease',
                                flexShrink: 0
                              }} />
                            </div>
                          );
                        })}
                      </div>
                      <div style={{
                        display: 'flex',
                        gap: 8,
                        marginTop: 8
                      }}>
                        {monthlyData.map((item) => (
                          <div
                            key={item.monthKey}
                            style={{
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 2
                            }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{item.count}</span>
                            <span style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>{item.monthName}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 16,
                    color: 'var(--muted)',
                    fontSize: 13
                  }}>
                    {chartYear === 'all' ? 'Aucune donnée' : `Aucune publication en ${chartYear} pour la période sélectionnée`}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer avec bouton fermer */}
        <div style={{
          marginTop: 16,
          paddingTop: 16,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button onClick={onClose} className="btn">
            ↩️ Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
