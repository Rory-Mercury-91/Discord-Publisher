// frontend/src/components/LibraryView.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { tauriAPI } from '../lib/tauri-api';
import { trackTranslationClick } from '../lib/api-helpers';
import { useApp } from '../state/appContext';
import GameDetailModal from './GameDetailModal';
import StatsView from './StatsView';
import Toggle from './Toggle';
import { useToast } from './ToastProvider';

/* ── Types exportés (réutilisés dans StatsView + GameDetailModal) ─────────────── */
export type GameF95 = {
  id: number;
  site_id: number;
  site: string;
  nom_du_jeu: string;
  nom_url: string;
  version: string;
  trad_ver: string;
  lien_trad: string;
  statut: string;
  tags: string;
  type: string;
  traducteur: string;
  traducteur_url: string;
  relecture: string;
  type_de_traduction: string;
  ac: string;
  image: string;
  type_maj: string;
  date_maj: string;
  published_post_id?: number | null;
  synced_at?: string;
  created_at?: string;
  updated_at?: string;
  _sync?: SyncStatus;
};

export type SyncStatus = 'ok' | 'outdated' | 'unknown';
type AppMode = 'translator' | 'user';

/* ── Sync helpers ─────────────────────────────────────────────── */
function normalizeVersion(v: string) {
  return (v || '').trim().toLowerCase().replace(/\s+/g, '');
}

/** Formate une chaîne date (ISO ou autre) en français pour l'affichage. */
function formatDateFr(value: string | undefined | null): string {
  if (!value || !value.trim()) return '';
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getSyncStatus(g: GameF95): SyncStatus {
  const t = normalizeVersion(g.trad_ver);
  if (t.includes('intégr') || t.includes('integr')) return 'ok';
  const v = normalizeVersion(g.version);
  if (!v || !t) return 'unknown';
  return v === t ? 'ok' : 'outdated';
}

/* ── Palettes ─────────────────────────────────────────────────── */
export const SYNC_META: Record<SyncStatus, { border: string; text: string; label: string }> = {
  ok: { border: '#22c55e', text: '#4ade80', label: '✓ À jour' },
  outdated: { border: '#ef4444', text: '#f87171', label: '⚠ Non à jour' },
  unknown: { border: '#78716c', text: '#a8a29e', label: '? Inconnu' },
};

const STATUS_MAP: Record<string, { bg: string; border: string; text: string }> = {
  'TERMINÉ': { bg: '#14532d', border: '#22c55e', text: '#4ade80' },
  'COMPLET': { bg: '#14532d', border: '#22c55e', text: '#4ade80' },
  'EN COURS': { bg: '#1e3a5f', border: '#3b82f6', text: '#60a5fa' },
  'ACTIF': { bg: '#1e3a5f', border: '#3b82f6', text: '#60a5fa' },
  'ABANDONNÉ': { bg: '#450a0a', border: '#ef4444', text: '#f87171' },
  'PAUSE': { bg: '#422006', border: '#f59e0b', text: '#fbbf24' },
  'SUSPENDU': { bg: '#422006', border: '#f59e0b', text: '#fbbf24' },
};

export function statusColor(s: string) {
  const k = (s || '').toUpperCase();
  for (const [key, v] of Object.entries(STATUS_MAP)) if (k.includes(key)) return v;
  return { bg: 'rgba(128,128,128,0.1)', border: '#6b7280', text: '#9ca3af' };
}

export function tradTypeColor(t: string) {
  const v = (t || '').toLowerCase();
  if (v.includes('manuelle') || v.includes('humaine')) return '#a78bfa';
  if (v.includes('semi')) return '#38bdf8';
  if (v.includes('auto')) return '#fb923c';
  return '#34d399';
}

/* ── Badge type_maj ───────────────────────────────────────────── */
const TYPE_MAJ_META: Record<string, { color: string; bg: string; icon: string }> = {
  'AJOUT DE JEU': { color: '#4ade80', bg: 'rgba(34,197,94,0.12)', icon: '🆕' },
  'MISE À JOUR': { color: '#60a5fa', bg: 'rgba(59,130,246,0.12)', icon: '🔄' },
};

function typeMajStyle(t: string) {
  const k = (t || '').toUpperCase().trim();
  return TYPE_MAJ_META[k] || { color: '#a8a29e', bg: 'rgba(128,128,128,0.12)', icon: '📌' };
}

/* ════════════════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
════════════════════════════════════════════════════════════════ */
export default function LibraryView({ onModeChange }: { onModeChange: (m: AppMode) => void }) {
  const { publishedPosts, loadPostForEditing } = useApp();
  const { showToast } = useToast();

  const [games, setGames] = useState<GameF95[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'library' | 'stats'>('library');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterTrad, setFilterTrad] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterTradType, setFilterTradType] = useState('');
  const [filterSync, setFilterSync] = useState<'' | SyncStatus>('');
  const [sortKey, setSortKey] = useState('nom_du_jeu');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [isModeChanging, setIsModeChanging] = useState(false);
  const [dateSort, setDateSort] = useState(false);
  // Pagination : taille de page (nombre ou -1 = illimité), page courante (0-based)
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      const v = localStorage.getItem('library_page_size');
      const n = v ? parseInt(v, 10) : 100;
      return [50, 100, 250, 500, 1000, -1].includes(n) ? n : 100;
    } catch { return 100; }
  });
  const [currentPage, setCurrentPage] = useState(0);

  const [displayMode, setDisplayMode] = useState<'compact' | 'enriched'>(() => {
    try {
      const saved = localStorage.getItem('library_display_mode');
      return (saved === 'enriched' ? 'enriched' : 'compact') as 'compact' | 'enriched';
    } catch {
      return 'compact';
    }
  });

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setIsModeChanging(true);           // ← overlay
      setDisplayMode(e.detail);

      // Petit délai pour laisser React rendre les nouvelles cartes
      setTimeout(() => setIsModeChanging(false), 180);
    };
    window.addEventListener('libraryDisplayModeChanged', handler as EventListener);
    return () => window.removeEventListener('libraryDisplayModeChanged', handler as EventListener);
  }, []);

  const handleDateSortChange = (checked: boolean) => {
    setDateSort(checked);
    if (!checked) setSortKey('nom_du_jeu');
  };

  useEffect(() => {
    try { localStorage.setItem('library_page_size', String(pageSize)); } catch { /* ignore */ }
  }, [pageSize]);

  // Remettre à la page 0 quand les filtres changent
  useEffect(() => {
    setCurrentPage(0);
  }, [search, filterStatut, filterTrad, filterType, filterTradType, filterSync]);

  /* ── Edit ── */
  const handleEdit = useCallback((post: any) => {
    loadPostForEditing(post);
    onModeChange('translator');
    showToast('Post chargé — passage en mode Traducteur', 'info');
  }, [loadPostForEditing, onModeChange, showToast]);

  /* ── Fetch ── */
  const fetchGames = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
      const key = localStorage.getItem('apiKey') || '';
      const res = await fetch(`${base}/api/jeux`, { headers: { 'X-API-KEY': key } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: GameF95[] = Array.isArray(data) ? data : (data.jeux ?? []);
      setGames(list);
      setLastSync(new Date());
    } catch (e: any) {
      setError(e.message || 'Erreur réseau');
      showToast('❌ Impossible de charger la bibliothèque', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchGames(); }, [fetchGames]);

  /* ── Matching game ↔ post ── */
  const postByGameLink = useMemo(() => {
    const map = new Map<string, typeof publishedPosts[0]>();
    for (const p of publishedPosts) {
      const gl = p.savedInputs?.['Game_link'] || '';
      if (gl) {
        const m = gl.match(/threads\/(?:[^/]*\.)?(\d+)/);
        if (m) map.set(m[1], p);
        map.set(gl.toLowerCase(), p);
      }
    }
    return map;
  }, [publishedPosts]);

  const findPost = useCallback((g: GameF95) => {
    const byId = postByGameLink.get(String(g.site_id));
    if (byId) return byId;
    for (const [k, v] of postByGameLink) if (k.includes(String(g.site_id))) return v;
    return null;
  }, [postByGameLink]);

  /* ── Enrichissement ── */
  const gamesEnriched = useMemo<GameF95[]>(
    () => games.map(g => ({ ...g, _sync: getSyncStatus(g) })), [games]
  );

  const syncCounts = useMemo(() => {
    const c = { ok: 0, outdated: 0, unknown: 0 };
    gamesEnriched.forEach(g => c[g._sync!]++);
    return c;
  }, [gamesEnriched]);

  const statuts = useMemo(() => [...new Set(games.map(g => g.statut).filter(Boolean))].sort(), [games]);
  const traducteurs = useMemo(() => [...new Set(games.map(g => g.traducteur).filter(Boolean))].sort(), [games]);
  const types = useMemo(() => [...new Set(games.map(g => g.type).filter(Boolean))].sort(), [games]);
  const tradTypes = useMemo(() => [...new Set(games.map(g => g.type_de_traduction).filter(Boolean))].sort(), [games]);

  /* ── Filtrage + tri ── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = gamesEnriched.filter(g => {
      if (q && !g.nom_du_jeu.toLowerCase().includes(q) && !(g.traducteur || '').toLowerCase().includes(q)) return false;
      if (filterStatut && g.statut !== filterStatut) return false;
      if (filterTrad && g.traducteur !== filterTrad) return false;
      if (filterType && g.type !== filterType) return false;
      if (filterTradType && g.type_de_traduction !== filterTradType) return false;
      if (filterSync && g._sync !== filterSync) return false;
      return true;
    });

    if (dateSort) {
      return list.sort((a, b) => {
        const da = a.date_maj || '';
        const db = b.date_maj || '';
        if (db !== da) return db.localeCompare(da);
        const ta = (a.type_maj || '').includes('AJOUT') ? 0 : 1;
        const tb = (b.type_maj || '').includes('AJOUT') ? 0 : 1;
        return ta - tb;
      });
    }

    return list.sort((a, b) => {
      const va = ((a as any)[sortKey] || '').toString().toLowerCase();
      const vb = ((b as any)[sortKey] || '').toString().toLowerCase();
      return va < vb ? -sortDir : va > vb ? sortDir : 0;
    });
  }, [gamesEnriched, search, filterStatut, filterTrad, filterType, filterTradType, filterSync, sortKey, sortDir, dateSort]);

  const totalPages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const effectivePage = Math.min(currentPage, totalPages - 1);
  const paginatedItems = useMemo(() => {
    if (pageSize === -1) return filtered;
    const start = effectivePage * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSize, effectivePage]);

  // Ramener la page courante dans les bornes si le nombre de pages diminue (ex. changement de taille de page)
  useEffect(() => {
    const total = pageSize === -1 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
    setCurrentPage(p => Math.min(p, total - 1));
  }, [filtered.length, pageSize]);

  const resetFilters = () => {
    setSearch('');
    setFilterStatut('');
    setFilterTrad('');
    setFilterType('');
    setFilterTradType('');
    setFilterSync('');
  };

  const toggleSort = (key: string) => {
    setDateSort(false);
    if (sortKey === key) setSortDir(d => d === 1 ? -1 : 1);
    else { setSortKey(key); setSortDir(1); }
  };


  /* ══════════ RENDER ══════════ */
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── Onglets ── */}
      <div style={{ display: 'flex', padding: '0 16px 12px 16px', flexShrink: 0 }}>
        {([['library', '📚 Bibliothèque'], ['stats', '📊 Statistiques']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: '10px 18px',
              border: 'none',
              borderBottom: tab === k ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'transparent',
              color: tab === k ? 'var(--accent)' : 'var(--muted)',
              fontWeight: tab === k ? 700 : 400,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ══════════ BIBLIOTHÈQUE ══════════ */}
      {tab === 'library' && (
        <>
          {/* Toolbar : hauteur 34px pour aligner badges, toggle, input et selects */}
          <div style={{
            height: 34,
            padding: '0 16px',
            marginTop: 4,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            flexShrink: 0,
          }}>
            {/* Filtres sync + tri par date */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 34 }}>
              {([
                ['', '📚 Tous', 'var(--accent)', 'var(--accent)'],
                ['ok', '✓ À jour', SYNC_META.ok.text, SYNC_META.ok.border],
                ['outdated', '⚠ Non à jour', SYNC_META.outdated.text, SYNC_META.outdated.border],
              ] as [string, string, string, string][]).map(([val, label, col, border]) => (
                <button
                  key={val}
                  type="button"
                  title={val === '' && lastSync
                    ? `Cache local : ${lastSync.toLocaleTimeString('fr-FR')} — mis à jour automatiquement toutes les 2h par le bot`
                    : val === '' ? 'Afficher tous les jeux' : undefined}
                  onClick={() => setFilterSync(val as any)}
                  style={{
                    height: 28,
                    padding: '0 10px',
                    borderRadius: 14,
                    border: `1px solid ${filterSync === val ? border : 'var(--border)'}`,
                    background: filterSync === val ? `${border}22` : 'transparent',
                    color: filterSync === val ? col : 'var(--muted)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    boxSizing: 'border-box',
                  }}
                >
                  {label}
                  <span style={{ marginLeft: 5 }}>
                    {val ? (syncCounts[val as SyncStatus] ?? 0) : games.length}
                  </span>
                </button>
              ))}
              <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Toggle
                  label="📅 Date"
                  checked={dateSort}
                  onChange={handleDateSortChange}
                  title={dateSort ? 'Tri par date actif — désactiver pour revenir A→Z' : 'Trier par date de MAJ (récent en premier)'}
                  size="sm"
                />
              </div>
            </div>

            <input
              type="text"
              className="app-input library-toolbar-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher dans le catalogue (jeu, traducteur)…"
              style={{ flex: 1, minWidth: 160 }}
            />

            <select className="app-select" value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ minWidth: 120 }}>
              <option value="">Tous les statuts</option>
              {statuts.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="app-select" value={filterTrad} onChange={e => setFilterTrad(e.target.value)} style={{ minWidth: 140 }}>
              <option value="">Tous les traducteurs</option>
              {traducteurs.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="app-select" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ minWidth: 100 }}>
              <option value="">Tous les moteurs</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="app-select" value={filterTradType} onChange={e => setFilterTradType(e.target.value)} style={{ minWidth: 100 }}>
              <option value="">Tous les types de trad.</option>
              {tradTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              className="app-select library-toolbar-select"
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              title="Nombre d'entrées par page"
              style={{ width: 'auto', minWidth: 92 }}
            >
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
              <option value={250}>250 / page</option>
              <option value={500}>500 / page</option>
              <option value={1000}>1000 / page</option>
              <option value={-1}>Illimité</option>
            </select>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center', height: 34 }}>
              {(['grid', 'list'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className="library-toolbar-btn"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: view === v ? 'var(--accent)' : 'transparent',
                    color: view === v ? '#fff' : 'var(--muted)',
                    cursor: 'pointer',
                    fontSize: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                  }}
                >
                  {v === 'grid' ? '⊞' : '≡'}
                </button>
              ))}
              <div className="library-toolbar-badge" style={{
                padding: '0 12px',
                borderRadius: 20,
                background: 'rgba(99,102,241,0.1)',
                border: '1px solid rgba(99,102,241,0.3)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--accent)',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 34,
                boxSizing: 'border-box',
              }}>
                {displayMode === 'compact' ? '📋 Info directe' : '✨ Info enrichie'}
              </div>
              <button
                type="button"
                onClick={resetFilters}
                disabled={loading}
                title="Réinitialiser tous les filtres"
                className="library-toolbar-btn"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  cursor: loading ? 'wait' : 'pointer',
                  fontSize: 20,
                  color: 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
              >
                ↻
              </button>
            </div>
          </div>

          {/* Overlay de transition */}
          {isModeChanging && (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 100, backdropFilter: 'blur(4px)'
            }}>
              <div style={{ color: 'var(--accent)', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>🔄</span> Changement de vue…
              </div>
            </div>
          )}
          {/* Contenu */}
          <div className="styled-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 16 }}>
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: 'var(--muted)', gap: 12 }}>
                <span style={{ fontSize: 24 }}>⏳</span> Chargement de la bibliothèque…
              </div>
            )}
            {error && !loading && (
              <div style={{ textAlign: 'center', color: '#f87171', padding: 32 }}>
                ❌ {error}
                <br />
                <button onClick={fetchGames} style={{ marginTop: 12, padding: '8px 20px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#f87171', cursor: 'pointer' }}>
                  Réessayer
                </button>
              </div>
            )}
            {!loading && !error && filtered.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 48 }}>
                {games.length === 0 ? '📭 Aucun jeu chargé' : '🔍 Aucun résultat pour ces filtres'}
              </div>
            )}

            {!loading && !error && view === 'grid' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                {paginatedItems.map(g => (
                  <GameCard
                    key={g.id}
                    game={g}
                    post={findPost(g)}
                    onEdit={handleEdit}
                    showDateBadge={dateSort}
                    displayMode={displayMode}
                  />
                ))}
              </div>
            )}

            {!loading && !error && view === 'list' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {([
                      ['nom_du_jeu', 'Jeu'],
                      ['version', 'Ver. jeu'],
                      ['trad_ver', 'Ver. trad.'],
                      ['_sync', 'Sync'],
                      ['statut', 'Statut'],
                      ['type_de_traduction', 'Type trad.'],
                      ['traducteur', 'Traducteur'],
                      ['date_maj', 'Date MAJ'],
                      ['type_maj', 'Type MAJ'],
                      [null, 'Actions'],
                    ] as [string | null, string][]).map(([k, h]) => (
                      <th
                        key={h}
                        onClick={k ? () => toggleSort(k) : undefined}
                        style={{
                          padding: '10px 12px',
                          textAlign: k === '_sync' || k === 'statut' || k === 'type_maj' || k === null ? 'center' : 'left',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          cursor: k ? 'pointer' : 'default',
                          userSelect: 'none',
                          fontSize: 14,
                          color: k === sortKey && !dateSort ? 'var(--accent)' : 'var(--text)',
                        }}
                      >
                        {h}
                        {k && sortKey === k && !dateSort ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}
                        {k === 'date_maj' && dateSort ? ' ↓' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map(g => (
                    <GameRow key={g.id} game={g} post={findPost(g)} onEdit={handleEdit} />
                  ))}
                </tbody>
              </table>
            )}

            {/* Pagination (si plus d'une page) */}
            {!loading && !error && filtered.length > 0 && totalPages > 1 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: '12px 16px',
                borderTop: '1px solid var(--border)',
                flexShrink: 0,
                fontSize: 13,
                color: 'var(--muted)',
              }}>
                <span>
                  Page {effectivePage + 1} sur {totalPages}
                  {pageSize !== -1 && (
                    <span style={{ marginLeft: 8 }}>
                      ({effectivePage * pageSize + 1}–{Math.min((effectivePage + 1) * pageSize, filtered.length)} sur {filtered.length})
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="app-input"
                  disabled={effectivePage === 0}
                  onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                  style={{ padding: '6px 12px' }}
                >
                  ← Précédent
                </button>
                <button
                  type="button"
                  className="app-input"
                  disabled={effectivePage >= totalPages - 1}
                  onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                  style={{ padding: '6px 12px' }}
                >
                  Suivant →
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'stats' && <StatsView jeux={gamesEnriched} />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   GAME CARD (utilisée en mode grid)
════════════════════════════════════════════════════════════════ */
function GameCard({ game, post, onEdit, showDateBadge, displayMode }: {
  game: GameF95;
  post: any;
  onEdit: (p: any) => void;
  showDateBadge: boolean;
  displayMode?: 'compact' | 'enriched';
}) {
  const sc = statusColor(game.statut);
  const sync = SYNC_META[game._sync!];
  const [imgErr, setImgErr] = useState(false);
  const tmStyle = typeMajStyle(game.type_maj);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const mode = displayMode || 'compact';

  if (mode === 'compact') {
    return (
      <div style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--panel)', display: 'flex', flexDirection: 'column', transition: 'transform 0.15s, box-shadow 0.15s' }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
      >
        <div style={{ height: 3, background: sync.border, flexShrink: 0 }} />
        <div style={{ width: '100%', aspectRatio: '16/9', background: 'rgba(128,128,128,0.08)', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
          {game.image && !imgErr ? (
            <img src={game.image} alt="" onError={() => setImgErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'var(--muted)' }}>🎮</div>
          )}
          <div style={{ position: 'absolute', bottom: 5, right: 5, padding: '2px 7px', borderRadius: 10, background: `${sync.border}cc`, fontSize: 10, fontWeight: 700, color: '#fff' }}>
            {sync.label}
          </div>
          <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            {post && (
              <span style={{ padding: '2px 7px', borderRadius: 10, background: 'rgba(16,185,129,0.9)', fontSize: 10, fontWeight: 700, color: '#fff' }}>
                ✓ Publié
              </span>
            )}
            {(game.statut || '—') !== '—' && (
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, fontWeight: 600 }}>
                {game.statut}
              </span>
            )}
          </div>
          {showDateBadge && game.type_maj && (
            <div style={{ position: 'absolute', top: 6, left: 6, padding: '2px 7px', borderRadius: 10, background: tmStyle.bg, border: `1px solid ${tmStyle.color}55`, fontSize: 10, fontWeight: 700, color: tmStyle.color }}>
              {tmStyle.icon} {game.type_maj}
            </div>
          )}
        </div>

        <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, color: 'var(--text)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {game.nom_du_jeu}
          </div>
          <VersionBadge game={game.version} trad={game.trad_ver} sync={game._sync!} />
          {game.traducteur && <div style={{ fontSize: 11, color: 'var(--muted)' }}>👤 <span style={{ color: 'var(--text)' }}>{game.traducteur}</span></div>}
          {game.type_de_traduction && <div style={{ fontSize: 10, color: tradTypeColor(game.type_de_traduction) }}>⚙ {game.type_de_traduction}</div>}
          {(game.date_maj || game.type) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              {game.date_maj && (
                <span style={{ fontSize: 10, color: showDateBadge ? '#fbbf24' : 'var(--muted)' }}>
                  📅 {formatDateFr(game.date_maj)}
                </span>
              )}
              {game.type && (
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(128,128,128,0.1)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                  {game.type}
                </span>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6 }}>
          {game.nom_url && (
            <button onClick={() => tauriAPI.openUrl(game.nom_url)} title="Ouvrir le jeu"
              style={{ flex: 1, height: 28, borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>
              🔗 Jeu
            </button>
          )}
          {game.lien_trad && (
            <button onClick={() => tauriAPI.openUrl(game.lien_trad)} title="Ouvrir la traduction"
              style={{ flex: 1, height: 28, borderRadius: 5, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.08)', color: '#818cf8', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ fontFamily: '"Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", sans-serif' }}>🇫🇷</span> Trad.
            </button>
          )}
          {post && (
            <button onClick={() => onEdit(post)} title="Modifier le post"
              style={{ height: 28, width: 28, borderRadius: 5, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)', color: '#4ade80', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ✏️
            </button>
          )}
        </div>
      </div>
    );
  }

  // Mode enriched
  return (
    <>
      <div style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--panel)', display: 'flex', flexDirection: 'column', transition: 'transform 0.15s, box-shadow 0.15s', cursor: 'pointer' }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
      >
        <div style={{ height: 3, background: sync.border, flexShrink: 0 }} />
        <div style={{ width: '100%', aspectRatio: '16/9', background: 'rgba(128,128,128,0.08)', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
          {game.image && !imgErr ? (
            <img src={game.image} alt="" onError={() => setImgErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'var(--muted)' }}>🎮</div>
          )}
          <div style={{ position: 'absolute', bottom: 5, right: 5, padding: '2px 7px', borderRadius: 10, background: `${sync.border}cc`, fontSize: 10, fontWeight: 700, color: '#fff' }}>
            {sync.label}
          </div>
          <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            {post && (
              <span style={{ padding: '2px 7px', borderRadius: 10, background: 'rgba(16,185,129,0.9)', fontSize: 10, fontWeight: 700, color: '#fff' }}>
                ✓ Publié
              </span>
            )}
            {(game.statut || '—') !== '—' && (
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, fontWeight: 600 }}>
                {game.statut}
              </span>
            )}
          </div>
          {showDateBadge && game.type_maj && (
            <div style={{ position: 'absolute', top: 6, left: 6, padding: '2px 7px', borderRadius: 10, background: tmStyle.bg, border: `1px solid ${tmStyle.color}55`, fontSize: 10, fontWeight: 700, color: tmStyle.color }}>
              {tmStyle.icon} {game.type_maj}
            </div>
          )}
        </div>

        <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, color: 'var(--text)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {game.nom_du_jeu}
          </div>
          <VersionBadge game={game.version} trad={game.trad_ver} sync={game._sync!} />
        </div>

        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setShowDetailModal(true)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 8,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(102,126,234,0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <span>ℹ️</span>
            <span>Plus d'informations</span>
          </button>
        </div>
      </div>

      {showDetailModal && <GameDetailModal game={game} onClose={() => setShowDetailModal(false)} />}
    </>
  );
}

function VersionBadge({ game, trad, sync }: { game: string; trad: string; sync: SyncStatus }) {
  if (!game && !trad) return <div style={{ fontSize: 11, color: 'var(--muted)' }}>Versions inconnues</div>;
  const arrowColor = sync === 'ok' ? '#22c55e' : sync === 'outdated' ? '#ef4444' : '#6b7280';
  const tradColor = sync === 'ok' ? '#4ade80' : sync === 'outdated' ? '#f87171' : '#9ca3af';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--muted)' }}>🎮</span>
      <code style={{ background: 'rgba(128,128,128,0.1)', padding: '1px 5px', borderRadius: 3, color: 'var(--text)' }}>{game || '?'}</code>
      <span style={{ color: arrowColor }}>→</span>
      <span style={{ color: 'var(--muted)' }}>🇫🇷</span>
      <code style={{ background: 'rgba(128,128,128,0.1)', padding: '1px 5px', borderRadius: 3, color: tradColor }}>{trad || '?'}</code>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   GAME ROW (utilisée en mode list)
════════════════════════════════════════════════════════════════ */
function GameRow({ game, post, onEdit }: { game: GameF95; post: any; onEdit: (p: any) => void }) {
  const sc = statusColor(game.statut);
  const sync = SYNC_META[game._sync!];
  const tradCol = game._sync === 'ok' ? '#4ade80' : game._sync === 'outdated' ? '#f87171' : 'var(--muted)';
  const tmStyle = typeMajStyle(game.type_maj);

  const td = (extra?: React.CSSProperties): React.CSSProperties => ({
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle',
    fontSize: 14,
    color: 'var(--text)',
    ...extra,
  });

  return (
    <tr onMouseEnter={e => (e.currentTarget.style.background = 'rgba(128,128,128,0.05)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <td style={td({ maxWidth: 220 })}>
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>{game.nom_du_jeu}</div>
        {game.type && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{game.type}</div>}
      </td>
      <td style={td()}><code style={{ fontSize: 13, color: 'var(--text)' }}>{game.version || '—'}</code></td>
      <td style={td()}><code style={{ fontSize: 13, color: tradCol }}>{game.trad_ver || '—'}</code></td>
      <td style={td({ textAlign: 'center' })}>
        <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 10, background: `${sync.border}22`, border: `1px solid ${sync.border}`, color: sync.text, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {sync.label}
        </span>
      </td>
      <td style={td({ textAlign: 'center' })}>
        <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, fontWeight: 600 }}>
          {game.statut || '—'}
        </span>
      </td>
      <td style={td({ fontSize: 13, color: tradTypeColor(game.type_de_traduction) })}>{game.type_de_traduction || '—'}</td>
      <td style={td({ fontSize: 13 })}>{game.traducteur || '—'}</td>
      <td style={td({ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' })}>{formatDateFr(game.date_maj) || '—'}</td>
      <td style={td({ textAlign: 'center' })}>
        {game.type_maj ? (
          <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 10, background: tmStyle.bg, border: `1px solid ${tmStyle.color}55`, color: tmStyle.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {tmStyle.icon} {game.type_maj}
          </span>
        ) : '—'}
      </td>
      <td style={td({ textAlign: 'center' })}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', minHeight: 34 }}>
          {game.nom_url && (
            <button type="button" onClick={() => tauriAPI.openUrl(game.nom_url)} title="Ouvrir la page du jeu" style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🔗</button>
          )}
          {game.lien_trad && (
            <button
              type="button"
              onClick={async () => {
                if (game.nom_url) {
                  await trackTranslationClick({
                    f95Url: game.nom_url,
                    translationUrl: game.lien_trad,
                    source: 'library_list',
                  });
                }
                tauriAPI.openUrl(game.lien_trad);
              }}
              title="Ouvrir la page de traduction"
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                border: '1px solid rgba(99,102,241,0.3)',
                background: 'rgba(99,102,241,0.08)',
                cursor: 'pointer',
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: '"Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", sans-serif',
              }}
            >
              🇫🇷
            </button>
          )}
          {post ? (
            <button type="button" onClick={() => onEdit(post)} title="Modifier le post Discord" style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)', color: '#4ade80', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✏️</button>
          ) : (
            <span title="Aucun post Discord publié pour ce jeu" style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--muted)', background: 'rgba(128,128,128,0.08)' }}>—</span>
          )}
        </div>
      </td>
    </tr>
  );
}
