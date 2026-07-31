// Constantes partagées entre ServerModal et LogsModal

export const DEFAULT_BASE = 'http://138.2.182.125:8080';

export function getBase(apiUrl?: string): string {
  const raw = (apiUrl || '').trim() || DEFAULT_BASE;
  try {
    return new URL(raw).origin;
  } catch {
    return raw.split('/api')[0]?.replace(/\/+$/, '') || DEFAULT_BASE;
  }
}

export const ALLOWED_METHODS = ['GET', 'POST', 'OPTIONS'];
export const ALLOWED_ROUTES = [
  '/',
  '/api/status',
  '/api/configure',
  '/api/publisher/health',
  '/api/forum-post',
  '/api/forum-post/update',
  '/api/forum-post/delete',
  '/api/history',
  '/reset-password',
  '/api/jeux',
  '/api/logs',
];

// Sources de logs (utilisateur)
export const USER_SOURCES = [
  { id: 'publisher'   as const, label: 'Publisher',     default: true  },
  { id: 'api'         as const, label: 'API REST',       default: true  },
  { id: 'scheduler'   as const, label: 'Planificateur',  default: true  },
  { id: 'f95'         as const, label: 'Versions F95',   default: true  },
  { id: 'scraper'     as const, label: 'Scraper',        default: false },
  { id: 'translator'  as const, label: 'Traducteur',     default: false },
] as const;

// Sources admin (masquées pour non-admins)
export const ADMIN_SOURCES = [
  { id: 'frelon'       as const, label: 'Bot Frelon',     default: false },
  { id: 'orchestrator' as const, label: 'Orchestrateur',  default: false },
] as const;

// Filtres admin
export const ADMIN_FILTERS = [
  { id: 'security'           as const, label: 'Securite',            default: false },
  { id: 'publisher-requests' as const, label: 'Requetes internes',   default: false },
  { id: 'discord-api'        as const, label: 'API Discord',          default: false },
  { id: 'supabase-api'       as const, label: 'API Supabase',         default: false },
  { id: 'auth'               as const, label: 'Auth details',         default: false },
  { id: 'debug'              as const, label: 'HTTPS / Debug',        default: false },
] as const;

export type LogCategory =
  | 'publisher'
  | 'api'
  | 'scheduler'
  | 'f95'
  | 'frelon'
  | 'orchestrator'
  | 'scraper'
  | 'translator'
  | 'security'
  | 'publisher-requests'
  | 'discord-api'
  | 'supabase-api'
  | 'auth'
  | 'debug'
  | null;