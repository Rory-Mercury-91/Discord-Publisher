// frontend/src/components/LibraryView.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis, YAxis,
} from 'recharts';
import { tauriAPI } from '../lib/tauri-api';
import { useApp } from '../state/appContext';
import { useToast } from './ToastProvider';

/* ── Types ─────────────────────────────────────────────────────────── */
export type JeuF95 = {
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
  _sync?: SyncStatus;
};

type SyncStatus = 'ok' | 'outdated' | 'unknown';

/* ── Normalisation version ──────────────────────────────────────────── */
function normalizeVersion(v: string): string {
  return (v || '').trim().toLowerCase().replace(/\s+/g, '');
}

function getSyncStatus(jeu: JeuF95): SyncStatus {
  const t = normalizeVersion(jeu.trad_ver);
  // Traduction intégrée = toujours considérée à jour
  if (t.includes('intégr') || t.includes('integr')) return 'ok';
  const v = normalizeVersion(jeu.version);
  if (!v || !t) return 'unknown';
  return v === t ? 'ok' : 'outdated';
}

/* ── Palettes ────────────────────────────────────────────────────────── */
const SYNC_META: Record<SyncStatus, { bg: string; border: string; text: string; label: string }> = {
  ok: { bg: '#052e16', border: '#22c55e', text: '#4ade80', label: '✓ À jour' },
  outdated: { bg: '#450a0a', border: '#ef4444', text: '#f87171', label: '⚠ Non à jour' },
  unknown: { bg: '#1c1917', border: '#78716c', text: '#a8a29e', label: '? Inconnu' },
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

function statusColor(s: string) {
  const key = (s || '').toUpperCase();
  for (const [k, v] of Object.entries(STATUS_MAP)) {
    if (key.includes(k)) return v;
  }
  return { bg: '#1f2937', border: '#6b7280', text: '#9ca3af' };
}

function tradTypeColor(t: string) {
  const v = (t || '').toLowerCase();
  if (v.includes('manuelle') || v.includes('humaine')) return '#a78bfa';
  if (v.includes('semi')) return '#38bdf8';
  if (v.includes('auto')) return '#fb923c';
  return '#34d399';
}

const CHART_PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#38bdf8', '#a78bfa', '#fb923c', '#34d399'];

/* ══════════════════════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
══════════════════════════════════════════════════════════════════════ */
export default function LibraryView() {
  const { publishedPosts, loadPostForEditing } = useApp();
  const { showToast } = useToast();

  const [jeux, setJeux] = useState<JeuF95[]>([]);
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

  /* ── Fetch ─────────────────────────────────────────────────────── */
  const fetchJeux = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || '').replace(/\/+$/, '');
      const key = localStorage.getItem('apiKey') || '';
      const res = await fetch(`${base}/api/jeux`, { headers: { 'X-API-KEY': key } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: JeuF95[] = Array.isArray(data) ? data : (data.jeux ?? []);
      setJeux(list);
      setLastSync(new Date());
    } catch (e: any) {
      setError(e.message || 'Erreur réseau');
      showToast('❌ Impossible de charger la bibliothèque', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchJeux(); }, [fetchJeux]);

  /* ── Matching jeu ↔ published_post ─────────────────────────────── */
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

  const findPost = useCallback((jeu: JeuF95) => {
    const byId = postByGameLink.get(String(jeu.site_id));
    if (byId) return byId;
    for (const [k, v] of postByGameLink) {
      if (k.includes(String(jeu.site_id))) return v;
    }
    return null;
  }, [postByGameLink]);

  /* ── Enrichissement sync ────────────────────────────────────────── */
  const jeuxEnriched = useMemo<JeuF95[]>(
    () => jeux.map(j => ({ ...j, _sync: getSyncStatus(j) })),
    [jeux]
  );

  /* ── Compteurs sync ─────────────────────────────────────────────── */
  const syncCounts = useMemo(() => {
    const c = { ok: 0, outdated: 0, unknown: 0 };
    jeuxEnriched.forEach(j => c[j._sync!]++);
    return c;
  }, [jeuxEnriched]);

  /* ── Options filtres ────────────────────────────────────────────── */
  const statuts = useMemo(() => [...new Set(jeux.map(j => j.statut).filter(Boolean))].sort(), [jeux]);
  const traducteurs = useMemo(() => [...new Set(jeux.map(j => j.traducteur).filter(Boolean))].sort(), [jeux]);
  const types = useMemo(() => [...new Set(jeux.map(j => j.type).filter(Boolean))].sort(), [jeux]);
  const tradTypes = useMemo(() => [...new Set(jeux.map(j => j.type_de_traduction).filter(Boolean))].sort(), [jeux]);

  /* ── Filtrage + tri ─────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return jeuxEnriched
      .filter(j => {
        if (q && !j.nom_du_jeu.toLowerCase().includes(q) && !(j.traducteur || '').toLowerCase().includes(q)) return false;
        if (filterStatut && j.statut !== filterStatut) return false;
        if (filterTrad && j.traducteur !== filterTrad) return false;
        if (filterType && j.type !== filterType) return false;
        if (filterTradType && j.type_de_traduction !== filterTradType) return false;
        if (filterSync && j._sync !== filterSync) return false;
        return true;
      })
      .sort((a, b) => {
        const va = ((a as any)[sortKey] || '').toString().toLowerCase();
        const vb = ((b as any)[sortKey] || '').toString().toLowerCase();
        return va < vb ? -sortDir : va > vb ? sortDir : 0;
      });
  }, [jeuxEnriched, search, filterStatut, filterTrad, filterType, filterTradType, filterSync, sortKey, sortDir]);

  const resetFilters = () => {
    setSearch(''); setFilterStatut(''); setFilterTrad('');
    setFilterType(''); setFilterTradType(''); setFilterSync('');
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(1); }
  };

  /* ── Styles communs ─────────────────────────────────────────────── */
  const sel: React.CSSProperties = {
    height: 30, padding: '0 8px', borderRadius: 6,
    border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)',
    color: 'var(--text)', fontSize: 12, cursor: 'pointer',
  };

  /* ══════════════════ RENDER ══════════════════ */
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── Onglets ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 16px', flexShrink: 0 }}>
        {([['library', '📚 Bibliothèque'], ['stats', '📊 Statistiques']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '10px 18px', border: 'none',
            borderBottom: tab === k ? '2px solid var(--accent)' : '2px solid transparent',
            background: 'transparent',
            color: tab === k ? 'var(--accent)' : 'var(--muted)',
            fontWeight: tab === k ? 700 : 400, fontSize: 13, cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      {/* ══════════ BIBLIOTHÈQUE ══════════ */}
      {tab === 'library' && (
        <>
          {/* ── Toolbar ── */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', flexShrink: 0 }}>

            {/* Sync quick-filters */}
            <div style={{ display: 'flex', gap: 4 }}>
              {([
                ['', 'Tous', 'var(--muted)', 'var(--border)'] as const,
                ['ok', '✓ À jour', SYNC_META.ok.text, SYNC_META.ok.border] as const,
                ['outdated', '⚠ Non à jour', SYNC_META.outdated.text, SYNC_META.outdated.border] as const,
                ['unknown', '? Inconnu', SYNC_META.unknown.text, SYNC_META.unknown.border] as const,
              ]).map(([val, label, col, border]) => (
                <button key={val} onClick={() => setFilterSync(val as any)} style={{
                  padding: '3px 10px', borderRadius: 20,
                  border: `1px solid ${filterSync === val ? border : 'var(--border)'}`,
                  background: filterSync === val ? `${border}22` : 'transparent',
                  color: filterSync === val ? col : 'var(--muted)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                  {label}
                  {val && (
                    <span style={{ marginLeft: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '0 5px' }}>
                      {syncCounts[val as SyncStatus] ?? 0}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

            {/* Titre + compteur */}
            <span style={{ fontWeight: 700, fontSize: 14 }}>📚</span>
            {jeux.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--muted)', background: 'rgba(255,255,255,0.07)', padding: '2px 8px', borderRadius: 10 }}>
                {filtered.length}/{jeux.length}
              </span>
            )}

            {/* Recherche */}
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un jeu ou traducteur…"
              style={{ ...sel, flex: 1, minWidth: 160, padding: '0 10px' }} />

            {/* Filtres dropdown */}
            <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={sel}>
              <option value="">Tous les statuts</option>
              {statuts.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterTrad} onChange={e => setFilterTrad(e.target.value)} style={sel}>
              <option value="">Tous les traducteurs</option>
              {traducteurs.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={sel}>
              <option value="">Tous les types</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterTradType} onChange={e => setFilterTradType(e.target.value)} style={sel}>
              <option value="">Type de trad.</option>
              {tradTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            {(search || filterStatut || filterTrad || filterType || filterTradType || filterSync) && (
              <button onClick={resetFilters} style={{ ...sel, color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' }}>✕ Reset</button>
            )}

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {(['grid', 'list'] as const).map(v => (
                <button key={v} onClick={() => setView(v)} style={{
                  width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)',
                  background: view === v ? 'var(--accent)' : 'transparent',
                  color: view === v ? '#fff' : 'var(--muted)',
                  cursor: 'pointer', fontSize: 14,
                }}>{v === 'grid' ? '⊞' : '≡'}</button>
              ))}
              <button onClick={fetchJeux} disabled={loading} title="Actualiser" style={{
                width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)',
                background: 'transparent', cursor: loading ? 'wait' : 'pointer',
                fontSize: 14, color: 'var(--muted)',
              }}>{loading ? '⏳' : '↻'}</button>
            </div>
          </div>

          {lastSync && (
            <div style={{ padding: '3px 16px', fontSize: 10, color: 'var(--muted)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              Dernière synchro : {lastSync.toLocaleTimeString('fr-FR')}
            </div>
          )}

          {/* ── Contenu ── */}
          <div className="styled-scrollbar" style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: 'var(--muted)', gap: 12 }}>
                <span style={{ fontSize: 24 }}>⏳</span> Chargement de la bibliothèque…
              </div>
            )}
            {error && !loading && (
              <div style={{ textAlign: 'center', color: '#f87171', padding: 32 }}>
                ❌ {error}<br />
                <button onClick={fetchJeux} style={{ marginTop: 12, padding: '8px 20px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#f87171', cursor: 'pointer' }}>
                  Réessayer
                </button>
              </div>
            )}
            {!loading && !error && filtered.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 48 }}>
                {jeux.length === 0 ? '📭 Aucun jeu chargé' : '🔍 Aucun résultat pour ces filtres'}
              </div>
            )}

            {/* Vue grille */}
            {!loading && !error && view === 'grid' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                {filtered.map(jeu => (
                  <GameCard key={jeu.id} jeu={jeu} post={findPost(jeu)} onEdit={loadPostForEditing} />
                ))}
              </div>
            )}

            {/* Vue liste */}
            {!loading && !error && view === 'list' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                    {([
                      ['nom_du_jeu', 'Jeu'],
                      ['version', 'Version jeu'],
                      ['trad_ver', 'Version trad.'],
                      ['_sync', 'Sync'],
                      ['statut', 'Statut'],
                      ['type_de_traduction', 'Type trad.'],
                      ['traducteur', 'Traducteur'],
                      ['date_maj', 'Date MAJ'],
                      [null, 'Actions'],
                    ] as [string | null, string][]).map(([k, h]) => (
                      <th key={h} onClick={k ? () => toggleSort(k) : undefined} style={{
                        padding: '8px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap',
                        cursor: k ? 'pointer' : 'default', userSelect: 'none', fontSize: 13,
                      }}>
                        {h}{k && sortKey === k ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(jeu => (
                    <GameRow key={jeu.id} jeu={jeu} post={findPost(jeu)} onEdit={loadPostForEditing} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ══════════ STATISTIQUES ══════════ */}
      {tab === 'stats' && <StatsView jeux={jeuxEnriched} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   GAME CARD (vue grille)
══════════════════════════════════════════════════════════════════════ */
function GameCard({ jeu, post, onEdit }: { jeu: JeuF95; post: any; onEdit: (p: any) => void }) {
  const sc = statusColor(jeu.statut);
  const sync = SYNC_META[jeu._sync!];
  const [imgErr, setImgErr] = useState(false);

  return (
    <div style={{
      borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden',
      background: 'var(--panel)', display: 'flex', flexDirection: 'column',
      transition: 'transform 0.15s, box-shadow 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      {/* Bandeau sync (3px) */}
      <div style={{ height: 3, background: sync.border, width: '100%', flexShrink: 0 }} />

      {/* Image */}
      <div style={{ width: '100%', aspectRatio: '16/9', background: 'rgba(255,255,255,0.05)', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
        {jeu.image && !imgErr ? (
          <img src={jeu.image} alt="" onError={() => setImgErr(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'var(--muted)' }}>🎮</div>
        )}
        {/* Badge sync */}
        <div style={{
          position: 'absolute', bottom: 5, right: 5,
          padding: '2px 7px', borderRadius: 10,
          background: `${sync.border}cc`, fontSize: 10, fontWeight: 700, color: '#fff',
        }}>{sync.label}</div>
        {/* Badge publié */}
        {post && (
          <div style={{
            position: 'absolute', top: 6, right: 6,
            padding: '2px 7px', borderRadius: 10,
            background: 'rgba(16,185,129,0.9)', fontSize: 10, fontWeight: 700, color: '#fff',
          }}>✓ Publié</div>
        )}
      </div>

      {/* Infos */}
      <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {jeu.nom_du_jeu}
        </div>

        {/* Versions diff */}
        <VersionBadge game={jeu.version} trad={jeu.trad_ver} sync={jeu._sync!} />

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, fontWeight: 600 }}>
            {jeu.statut || '—'}
          </span>
          {jeu.type && (
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
              {jeu.type}
            </span>
          )}
        </div>

        {jeu.traducteur && (
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            👤 <span style={{ color: 'var(--text)' }}>{jeu.traducteur}</span>
          </div>
        )}
        {jeu.type_de_traduction && (
          <div style={{ fontSize: 10, color: tradTypeColor(jeu.type_de_traduction) }}>
            ⚙ {jeu.type_de_traduction}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 6 }}>
        {jeu.nom_url && (
          <button onClick={() => tauriAPI.openUrl(jeu.nom_url)}
            title="Ouvrir le jeu"
            style={{ flex: 1, height: 28, borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>
            🔗 Jeu
          </button>
        )}
        {jeu.lien_trad && (
          <button onClick={() => tauriAPI.openUrl(jeu.lien_trad)}
            title="Ouvrir la traduction"
            style={{ flex: 1, height: 28, borderRadius: 5, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.08)', color: '#818cf8', fontSize: 11, cursor: 'pointer' }}>
            🇫🇷 Trad.
          </button>
        )}
        {post && (
          <button onClick={() => onEdit(post)}
            title="Modifier le post Discord"
            style={{ height: 28, width: 28, borderRadius: 5, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)', color: '#4ade80', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✏️
          </button>
        )}
      </div>
    </div>
  );
}

/* ── VersionBadge ────────────────────────────────────────────────────── */
function VersionBadge({ game, trad, sync }: { game: string; trad: string; sync: SyncStatus }) {
  if (!game && !trad) return <div style={{ fontSize: 11, color: 'var(--muted)' }}>Versions inconnues</div>;
  const arrowColor = sync === 'ok' ? '#22c55e' : sync === 'outdated' ? '#ef4444' : '#6b7280';
  const tradColor = sync === 'ok' ? '#4ade80' : sync === 'outdated' ? '#f87171' : '#9ca3af';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--muted)' }}>🎮</span>
      <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 3 }}>{game || '?'}</code>
      <span style={{ color: arrowColor }}>→</span>
      <span style={{ color: 'var(--muted)' }}>🇫🇷</span>
      <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 3, color: tradColor }}>{trad || '?'}</code>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   GAME ROW (vue liste)
══════════════════════════════════════════════════════════════════════ */
function GameRow({ jeu, post, onEdit }: { jeu: JeuF95; post: any; onEdit: (p: any) => void }) {
  const sc = statusColor(jeu.statut);
  const sync = SYNC_META[jeu._sync!];
  const tradCol = jeu._sync === 'ok' ? '#4ade80' : jeu._sync === 'outdated' ? '#f87171' : 'var(--muted)';
  const td = (extra?: React.CSSProperties): React.CSSProperties => ({
    padding: '9px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)',
    verticalAlign: 'middle', fontSize: 14, ...extra,
  });

  return (
    <tr onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <td style={td({ maxWidth: 220 })}>
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{jeu.nom_du_jeu}</div>
        {jeu.type && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{jeu.type}</div>}
      </td>
      <td style={td()}><code style={{ fontSize: 11 }}>{jeu.version || '—'}</code></td>
      <td style={td()}><code style={{ fontSize: 11, color: tradCol }}>{jeu.trad_ver || '—'}</code></td>
      <td style={td()}>
        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: `${sync.border}22`, border: `1px solid ${sync.border}`, color: sync.text, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {sync.label}
        </span>
      </td>
      <td style={td()}>
        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, fontWeight: 600 }}>
          {jeu.statut || '—'}
        </span>
      </td>
      <td style={td({ fontSize: 11, color: tradTypeColor(jeu.type_de_traduction) })}>{jeu.type_de_traduction || '—'}</td>
      <td style={td({ fontSize: 11 })}>{jeu.traducteur || '—'}</td>
      <td style={td({ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' })}>{jeu.date_maj || '—'}</td>
      <td style={td()}>
        <div style={{ display: 'flex', gap: 4 }}>
          {jeu.nom_url && (
            <button onClick={() => tauriAPI.openUrl(jeu.nom_url)}
              title="Ouvrir le jeu"
              style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12 }}>🔗</button>
          )}
          {jeu.lien_trad && (
            <button onClick={() => tauriAPI.openUrl(jeu.lien_trad)}
              title="Ouvrir la traduction"
              style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.08)', cursor: 'pointer', fontSize: 12 }}>🇫🇷</button>
          )}
          {post ? (
            <button onClick={() => onEdit(post)}
              title="Modifier le post Discord"
              style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)', color: '#4ade80', cursor: 'pointer', fontSize: 11 }}>✏️</button>
          ) : (
            <span style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--muted)' }}>—</span>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STATS VIEW
══════════════════════════════════════════════════════════════════════ */
function StatsView({ jeux }: { jeux: JeuF95[] }) {
  const total = jeux.length;

  const kpis = useMemo(() => {
    const c = { ok: 0, outdated: 0, unknown: 0 };
    jeux.forEach(j => c[j._sync!]++);
    return c;
  }, [jeux]);

  const byStatut = useMemo(() => {
    const m: Record<string, number> = {};
    jeux.forEach(j => { const k = j.statut || 'Inconnu'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [jeux]);

  const byTradType = useMemo(() => {
    const m: Record<string, number> = {};
    jeux.forEach(j => { const k = j.type_de_traduction || 'Non précisé'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [jeux]);

  const bySite = useMemo(() => {
    const m: Record<string, number> = {};
    jeux.forEach(j => { const k = j.site || 'Autre'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [jeux]);

  const byTraducteur = useMemo(() => {
    const m: Record<string, number> = {};
    jeux.forEach(j => { if (j.traducteur) m[j.traducteur] = (m[j.traducteur] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [jeux]);

  const syncByTrad = useMemo(() => {
    const m: Record<string, { name: string; ok: number; outdated: number; unknown: number }> = {};
    jeux.forEach(j => {
      if (!j.traducteur) return;
      if (!m[j.traducteur]) m[j.traducteur] = { name: j.traducteur, ok: 0, outdated: 0, unknown: 0 };
      m[j.traducteur][j._sync!]++;
    });
    return Object.values(m).sort((a, b) => (b.ok + b.outdated + b.unknown) - (a.ok + a.outdated + a.unknown));
  }, [jeux]);

  const pct = (n: number) => (total ? Math.round(n / total * 100) : 0);
  const tt = { contentStyle: { background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12 } };

  return (
    <div className="styled-scrollbar" style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12 }}>
        {[
          { label: 'Total', value: total, color: 'var(--accent)', icon: '📚', sub: null },
          { label: 'À jour', value: kpis.ok, color: '#22c55e', icon: '✅', sub: `${pct(kpis.ok)}%` },
          { label: 'Non à jour', value: kpis.outdated, color: '#ef4444', icon: '⚠️', sub: `${pct(kpis.outdated)}%` },
          { label: 'Inconnu', value: kpis.unknown, color: '#6b7280', icon: '❓', sub: `${pct(kpis.unknown)}%` },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--panel)', borderRadius: 12, padding: 16, border: `1px solid ${k.color}44`, textAlign: 'center' }}>
            <div style={{ fontSize: 22 }}>{k.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{k.label}</div>
            {k.sub && <div style={{ fontSize: 11, color: k.color, marginTop: 2 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Barre progression sync */}
      <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 18, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📊 Progression sync globale</div>
        <div style={{ display: 'flex', height: 18, borderRadius: 9, overflow: 'hidden', gap: 1 }}>
          {kpis.ok > 0 && <div style={{ flex: kpis.ok, background: '#22c55e' }} title={`À jour: ${kpis.ok}`} />}
          {kpis.outdated > 0 && <div style={{ flex: kpis.outdated, background: '#ef4444' }} title={`Non à jour: ${kpis.outdated}`} />}
          {kpis.unknown > 0 && <div style={{ flex: kpis.unknown, background: '#374151' }} title={`Inconnu: ${kpis.unknown}`} />}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11 }}>
          {([['#22c55e', 'À jour', kpis.ok], ['#ef4444', 'Non à jour', kpis.outdated], ['#6b7280', 'Inconnu', kpis.unknown]] as [string, string, number][]).map(([c, l, n]) => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: c, display: 'inline-block' }} />
              <span style={{ color: 'var(--muted)' }}>{l}: <strong style={{ color: c }}>{n}</strong></span>
            </span>
          ))}
        </div>
      </div>

      {/* Charts ligne 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 18, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📁 Par statut</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={byStatut} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}>
                {byStatut.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
              </Pie>
              <Tooltip {...tt} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 18, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>⚙ Par type de traduction</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={byTradType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}>
                {byTradType.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
              </Pie>
              <Tooltip {...tt} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts ligne 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 18, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>🌐 Par site</div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={bySite} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
              <Tooltip {...tt} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {bySite.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 18, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>👤 Par traducteur (top 10)</div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={byTraducteur} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={70} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
              <Tooltip {...tt} />
              <Bar dataKey="value" fill="var(--accent)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sync par traducteur */}
      <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 18, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>🔄 Sync par traducteur</div>
        <ResponsiveContainer width="100%" height={Math.max(160, syncByTrad.length * 32)}>
          <BarChart data={syncByTrad} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={80} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <Tooltip {...tt} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="ok" name="À jour" stackId="a" fill="#22c55e" />
            <Bar dataKey="outdated" name="Non à jour" stackId="a" fill="#ef4444" />
            <Bar dataKey="unknown" name="Inconnu" stackId="a" fill="#374151" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}
