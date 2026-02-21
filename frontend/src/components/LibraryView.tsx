// frontend/src/components/LibraryView.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { tauriAPI } from '../lib/tauri-api';
import { useApp } from '../state/appContext';
import StatsView from './StatsView';
import { useToast } from './ToastProvider';

/* ── Types exportés (réutilisés dans StatsView) ─────────────── */
export type JeuF95 = {
  id: number; site_id: number; site: string;
  nom_du_jeu: string; nom_url: string; version: string;
  trad_ver: string; lien_trad: string; statut: string;
  tags: string; type: string; traducteur: string;
  traducteur_url: string; relecture: string;
  type_de_traduction: string; ac: string; image: string;
  type_maj: string; date_maj: string;
  published_post_id?: number | null;
  synced_at?: string; created_at?: string; updated_at?: string;
  _sync?: SyncStatus;
};
export type SyncStatus = 'ok' | 'outdated' | 'unknown';
type AppMode = 'translator' | 'user';

/* ── Sync helpers ─────────────────────────────────────────────── */
function normalizeVersion(v: string) {
  return (v || '').trim().toLowerCase().replace(/\s+/g, '');
}
function getSyncStatus(j: JeuF95): SyncStatus {
  const t = normalizeVersion(j.trad_ver);
  if (t.includes('intégr') || t.includes('integr')) return 'ok';
  const v = normalizeVersion(j.version);
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

  // ── Toggle tri par date ──────────────────────────────────────
  const [dateSort, setDateSort] = useState(false);

  const toggleDateSort = () => {
    setDateSort(prev => {
      if (!prev) { setSortKey('nom_du_jeu'); } // reset sort manuel
      return !prev;
    });
  };

  /* ── Edit ── */
  const handleEdit = useCallback((post: any) => {
    loadPostForEditing(post);
    onModeChange('translator');
    showToast('Post chargé — passage en mode Traducteur', 'info');
  }, [loadPostForEditing, onModeChange, showToast]);

  /* ── Fetch ── */
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
    } finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { fetchJeux(); }, [fetchJeux]);

  /* ── Matching jeu ↔ post ── */
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

  const findPost = useCallback((j: JeuF95) => {
    const byId = postByGameLink.get(String(j.site_id));
    if (byId) return byId;
    for (const [k, v] of postByGameLink) if (k.includes(String(j.site_id))) return v;
    return null;
  }, [postByGameLink]);

  /* ── Enrichissement ── */
  const jeuxEnriched = useMemo<JeuF95[]>(
    () => jeux.map(j => ({ ...j, _sync: getSyncStatus(j) })), [jeux]
  );

  const syncCounts = useMemo(() => {
    const c = { ok: 0, outdated: 0, unknown: 0 };
    jeuxEnriched.forEach(j => c[j._sync!]++);
    return c;
  }, [jeuxEnriched]);

  const statuts = useMemo(() => [...new Set(jeux.map(j => j.statut).filter(Boolean))].sort(), [jeux]);
  const traducteurs = useMemo(() => [...new Set(jeux.map(j => j.traducteur).filter(Boolean))].sort(), [jeux]);
  const types = useMemo(() => [...new Set(jeux.map(j => j.type).filter(Boolean))].sort(), [jeux]);
  const tradTypes = useMemo(() => [...new Set(jeux.map(j => j.type_de_traduction).filter(Boolean))].sort(), [jeux]);

  /* ── Filtrage + tri ── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = jeuxEnriched.filter(j => {
      if (q && !j.nom_du_jeu.toLowerCase().includes(q) && !(j.traducteur || '').toLowerCase().includes(q)) return false;
      if (filterStatut && j.statut !== filterStatut) return false;
      if (filterTrad && j.traducteur !== filterTrad) return false;
      if (filterType && j.type !== filterType) return false;
      if (filterTradType && j.type_de_traduction !== filterTradType) return false;
      if (filterSync && j._sync !== filterSync) return false;
      return true;
    });

    if (dateSort) {
      // Tri par date_maj DESC, puis par type_maj (AJOUT avant MAJ à égalité)
      return list.sort((a, b) => {
        const da = a.date_maj || '';
        const db = b.date_maj || '';
        if (db !== da) return db.localeCompare(da); // plus récent en premier
        // À égalité de date : AJOUT DE JEU avant MISE À JOUR
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
  }, [jeuxEnriched, search, filterStatut, filterTrad, filterType, filterTradType, filterSync, sortKey, sortDir, dateSort]);

  const resetFilters = () => {
    setSearch(''); setFilterStatut(''); setFilterTrad('');
    setFilterType(''); setFilterTradType(''); setFilterSync('');
  };

  const toggleSort = (key: string) => {
    setDateSort(false); // désactive le mode date si on clique sur une colonne
    if (sortKey === key) setSortDir(d => d === 1 ? -1 : 1);
    else { setSortKey(key); setSortDir(1); }
  };

  const sel: React.CSSProperties = {
    height: 30, padding: '0 8px', borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text)',
    fontSize: 12, cursor: 'pointer',
  };

  /* ══════════ RENDER ══════════ */
  return (
    <div style={{
      flex: 1,
      minHeight: 0,          // ← AJOUT CRITIQUE
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--bg)',
    }}>

      {/* ── Onglets ── */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--border)',
        padding: '0 16px', flexShrink: 0
      }}> {/* flexShrink:0 = ne se réduit jamais */}
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
          {/* Toolbar */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', flexShrink: 0 }}>

            {/* Filtres sync */}
            <div style={{ display: 'flex', gap: 4 }}>
              {([
                ['', 'Tous', 'var(--muted)', 'var(--border)'],
                ['ok', '✓ À jour', SYNC_META.ok.text, SYNC_META.ok.border],
                ['outdated', '⚠ Non à jour', SYNC_META.outdated.text, SYNC_META.outdated.border],
                ['unknown', '? Inconnu', SYNC_META.unknown.text, SYNC_META.unknown.border],
              ] as [string, string, string, string][]).map(([val, label, col, border]) => (
                <button key={val} onClick={() => setFilterSync(val as any)} style={{
                  padding: '3px 10px', borderRadius: 20,
                  border: `1px solid ${filterSync === val ? border : 'var(--border)'}`,
                  background: filterSync === val ? `${border}22` : 'transparent',
                  color: filterSync === val ? col : 'var(--muted)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                  {label}
                  {val && (
                    <span style={{ marginLeft: 5, background: 'rgba(128,128,128,0.15)', borderRadius: 10, padding: '0 5px' }}>
                      {syncCounts[val as SyncStatus] ?? 0}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

            {/* ── Toggle tri par date ── */}
            <button
              onClick={toggleDateSort}
              title={dateSort ? 'Tri par date actif — cliquer pour revenir A→Z' : 'Trier par date de MAJ (récent en premier)'}
              style={{
                padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${dateSort ? '#f59e0b' : 'var(--border)'}`,
                background: dateSort ? 'rgba(245,158,11,0.12)' : 'transparent',
                color: dateSort ? '#fbbf24' : 'var(--muted)',
                display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
              }}
            >
              📅 {dateSort ? 'Date ↓' : 'Date'}
            </button>

            <span style={{ fontWeight: 700, fontSize: 14 }}>📚</span>
            {jeux.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--muted)', background: 'rgba(128,128,128,0.1)', padding: '2px 8px', borderRadius: 10 }}>
                {filtered.length}/{jeux.length}
              </span>
            )}

            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher dans le catalogue (jeu, traducteur)…"
              style={{ ...sel, flex: 1, minWidth: 160, padding: '0 10px' }} />

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
              <button onClick={fetchJeux} disabled={loading} title="Forcer la synchronisation" style={{
                width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)',
                background: 'transparent', cursor: loading ? 'wait' : 'pointer',
                fontSize: 14, color: 'var(--muted)',
              }}>{loading ? '⏳' : '↻'}</button>
            </div>
          </div>

          {lastSync && (
            <div style={{ padding: '3px 16px', fontSize: 10, color: 'var(--muted)', borderBottom: '1px solid rgba(128,128,128,0.08)' }}>
              Cache local : {lastSync.toLocaleTimeString('fr-FR')} — mis à jour automatiquement toutes les 2h par le bot
              {dateSort && (
                <span style={{ marginLeft: 12, color: '#fbbf24' }}>
                  📅 Tri actif : date de MAJ décroissante
                </span>
              )}
            </div>
          )}

          {/* Contenu */}
          <div className="styled-scrollbar"
            style={{
              flex: 1,
              minHeight: 0,      // ← AUSSI ICI pour la vue bibliothèque
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: 16,
            }}>
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

            {!loading && !error && view === 'grid' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
                {filtered.map(j => <GameCard key={j.id} jeu={j} post={findPost(j)} onEdit={handleEdit} showDateBadge={dateSort} />)}
              </div>
            )}

            {!loading && !error && view === 'list' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {([
                      ['nom_du_jeu', 'Jeu'], ['version', 'Ver. jeu'], ['trad_ver', 'Ver. trad.'],
                      ['_sync', 'Sync'], ['statut', 'Statut'], ['type_de_traduction', 'Type trad.'],
                      ['traducteur', 'Traducteur'], ['date_maj', 'Date MAJ'], ['type_maj', 'Type MAJ'], [null, 'Actions'],
                    ] as [string | null, string][]).map(([k, h]) => (
                      <th key={h} onClick={k ? () => toggleSort(k) : undefined} style={{
                        padding: '8px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap',
                        cursor: k ? 'pointer' : 'default', userSelect: 'none', fontSize: 13,
                        color: (k === sortKey && !dateSort) ? 'var(--accent)' : 'var(--text)',
                      }}>
                        {h}{k && sortKey === k && !dateSort ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}
                        {k === 'date_maj' && dateSort ? ' ↓' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(j => <GameRow key={j.id} jeu={j} post={findPost(j)} onEdit={handleEdit} />)}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'stats' && <StatsView jeux={jeuxEnriched} />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   GAME CARD
════════════════════════════════════════════════════════════════ */
function GameCard({ jeu, post, onEdit, showDateBadge }:
  { jeu: JeuF95; post: any; onEdit: (p: any) => void; showDateBadge: boolean }) {
  const sc = statusColor(jeu.statut);
  const sync = SYNC_META[jeu._sync!];
  const [imgErr, setImgErr] = useState(false);
  const tmStyle = typeMajStyle(jeu.type_maj);

  return (
    <div
      style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--panel)', display: 'flex', flexDirection: 'column', transition: 'transform 0.15s, box-shadow 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      <div style={{ height: 3, background: sync.border, flexShrink: 0 }} />
      <div style={{ width: '100%', aspectRatio: '16/9', background: 'rgba(128,128,128,0.08)', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
        {jeu.image && !imgErr
          ? <img src={jeu.image} alt="" onError={() => setImgErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'var(--muted)' }}>🎮</div>
        }
        <div style={{ position: 'absolute', bottom: 5, right: 5, padding: '2px 7px', borderRadius: 10, background: `${sync.border}cc`, fontSize: 10, fontWeight: 700, color: '#fff' }}>
          {sync.label}
        </div>
        {post && (
          <div style={{ position: 'absolute', top: 6, right: 6, padding: '2px 7px', borderRadius: 10, background: 'rgba(16,185,129,0.9)', fontSize: 10, fontWeight: 700, color: '#fff' }}>
            ✓ Publié
          </div>
        )}
        {/* Badge type_maj (visible en mode date uniquement) */}
        {showDateBadge && jeu.type_maj && (
          <div style={{ position: 'absolute', top: 6, left: 6, padding: '2px 7px', borderRadius: 10, background: tmStyle.bg, border: `1px solid ${tmStyle.color}55`, fontSize: 10, fontWeight: 700, color: tmStyle.color }}>
            {tmStyle.icon} {jeu.type_maj}
          </div>
        )}
      </div>

      <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, color: 'var(--text)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {jeu.nom_du_jeu}
        </div>
        <VersionBadge game={jeu.version} trad={jeu.trad_ver} sync={jeu._sync!} />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, fontWeight: 600 }}>
            {jeu.statut || '—'}
          </span>
          {jeu.type && (
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(128,128,128,0.1)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
              {jeu.type}
            </span>
          )}
        </div>
        {jeu.traducteur && <div style={{ fontSize: 11, color: 'var(--muted)' }}>👤 <span style={{ color: 'var(--text)' }}>{jeu.traducteur}</span></div>}
        {jeu.type_de_traduction && <div style={{ fontSize: 10, color: tradTypeColor(jeu.type_de_traduction) }}>⚙ {jeu.type_de_traduction}</div>}
        {/* Date MAJ toujours visible, mise en avant quand dateSort actif */}
        {jeu.date_maj && (
          <div style={{ fontSize: 10, color: showDateBadge ? '#fbbf24' : 'var(--muted)' }}>
            📅 {jeu.date_maj}
          </div>
        )}
      </div>

      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6 }}>
        {jeu.nom_url && (
          <button onClick={() => tauriAPI.openUrl(jeu.nom_url)} title="Ouvrir le jeu"
            style={{ flex: 1, height: 28, borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>
            🔗 Jeu
          </button>
        )}
        {jeu.lien_trad && (
          <button onClick={() => tauriAPI.openUrl(jeu.lien_trad)} title="Ouvrir la traduction"
            style={{ flex: 1, height: 28, borderRadius: 5, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.08)', color: '#818cf8', fontSize: 11, cursor: 'pointer' }}>
            🇫🇷 Trad.
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
   GAME ROW
════════════════════════════════════════════════════════════════ */
function GameRow({ jeu, post, onEdit }: { jeu: JeuF95; post: any; onEdit: (p: any) => void }) {
  const sc = statusColor(jeu.statut);
  const sync = SYNC_META[jeu._sync!];
  const tradCol = jeu._sync === 'ok' ? '#4ade80' : jeu._sync === 'outdated' ? '#f87171' : 'var(--muted)';
  const tmStyle = typeMajStyle(jeu.type_maj);
  const td = (extra?: React.CSSProperties): React.CSSProperties => ({
    padding: '9px 10px', borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle', fontSize: 14, color: 'var(--text)', ...extra,
  });

  return (
    <tr onMouseEnter={e => (e.currentTarget.style.background = 'rgba(128,128,128,0.05)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <td style={td({ maxWidth: 220 })}>
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{jeu.nom_du_jeu}</div>
        {jeu.type && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{jeu.type}</div>}
      </td>
      <td style={td()}><code style={{ fontSize: 11, color: 'var(--text)' }}>{jeu.version || '—'}</code></td>
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
        {jeu.type_maj ? (
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: tmStyle.bg, border: `1px solid ${tmStyle.color}55`, color: tmStyle.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {tmStyle.icon} {jeu.type_maj}
          </span>
        ) : '—'}
      </td>
      <td style={td()}>
        <div style={{ display: 'flex', gap: 4 }}>
          {jeu.nom_url && (
            <button onClick={() => tauriAPI.openUrl(jeu.nom_url)} title="Jeu"
              style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12 }}>🔗</button>
          )}
          {jeu.lien_trad && (
            <button onClick={() => tauriAPI.openUrl(jeu.lien_trad)} title="Traduction"
              style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.08)', cursor: 'pointer', fontSize: 12 }}>🇫🇷</button>
          )}
          {post ? (
            <button onClick={() => onEdit(post)} title="Modifier le post Discord"
              style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)', color: '#4ade80', cursor: 'pointer', fontSize: 11 }}>✏️</button>
          ) : (
            <span style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--muted)' }}>—</span>
          )}
        </div>
      </td>
    </tr>
  );
}
