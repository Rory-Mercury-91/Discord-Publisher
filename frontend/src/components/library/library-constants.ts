import type { GameF95, SyncStatus } from './library-types';

function normalizeVersion(v: string) {
  return (v || '').trim().toLowerCase().replace(/\s+/g, '');
}

/** Formate une chaîne date (ISO ou autre) en français pour l'affichage. */
export function formatDateFr(value: string | undefined | null): string {
  if (!value || !value.trim()) return '';
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function getSyncStatus(g: GameF95): SyncStatus {
  const t = normalizeVersion(g.trad_ver);
  if (t.includes('intégr') || t.includes('integr')) return 'ok';
  const v = normalizeVersion(g.version);
  if (!v || !t) return 'unknown';
  return v === t ? 'ok' : 'outdated';
}

export const SYNC_META: Record<SyncStatus, { border: string; text: string; label: string }> = {
  ok: { border: '#22c55e', text: '#4ade80', label: '✓ À jour' },
  outdated: { border: '#ef4444', text: '#f87171', label: '⚠ Non à jour' },
  unknown: { border: '#78716c', text: '#a8a29e', label: '? Inconnu' },
};

/** En-têtes de la table liste (Bibliothèque et Ma collection). */
export const TABLE_HEADERS: [string | null, string][] = [
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
];

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

const TYPE_MAJ_META: Record<string, { color: string; bg: string; icon: string }> = {
  'AJOUT DE JEU': { color: '#4ade80', bg: 'rgba(34,197,94,0.12)', icon: '🆕' },
  'MISE À JOUR': { color: '#60a5fa', bg: 'rgba(59,130,246,0.12)', icon: '🔄' },
};

export function typeMajStyle(t: string) {
  const k = (t || '').toUpperCase().trim();
  return TYPE_MAJ_META[k] || { color: '#a8a29e', bg: 'rgba(128,128,128,0.12)', icon: '📌' };
}

/** Valeur data-statut pour les classes CSS (badge statut). */
export function getStatutData(s: string): string {
  const k = (s || '').toUpperCase();
  if (k.includes('TERMINÉ') || k.includes('COMPLET')) return 'termine';
  if (k.includes('EN COURS') || k.includes('ACTIF')) return 'encours';
  if (k.includes('ABANDONNÉ')) return 'abandonne';
  if (k.includes('PAUSE') || k.includes('SUSPENDU')) return 'pause';
  return 'default';
}

/** Valeur data-type-maj pour les classes CSS (badge date / type MAJ). */
export function getTypeMajData(t: string): string {
  const k = (t || '').toUpperCase().trim();
  if (k === 'AJOUT DE JEU') return 'ajout';
  if (k === 'MISE À JOUR') return 'maj';
  return 'default';
}

/** Valeur data-trad-type pour les classes CSS (couleur type de traduction). */
export function getTradTypeData(t: string): string {
  const v = (t || '').toLowerCase();
  if (v.includes('manuelle') || v.includes('humaine')) return 'manuelle';
  if (v.includes('semi')) return 'semi';
  if (v.includes('auto')) return 'auto';
  return 'other';
}
