// Version alignée sur la release : package.json racine (et tauri.conf.json), pas frontend/package.json
import rootPkg from '../../../../package.json';

export const APP_VERSION = (rootPkg as { version?: string }).version ?? '0.0.0';
export const STORAGE_KEY_MASTER_ADMIN = 'discord-publisher:master-admin-code';
export const DEFAULT_API_BASE = 'http://138.2.182.125:8080';

export type AppMode = 'translator' | 'user' | 'listform';

export function getBaseUrl(apiUrl?: string): string {
  const toParse = (apiUrl || '').trim() || `${DEFAULT_API_BASE}/api/forum-post`;
  try {
    return new URL(toParse).origin;
  } catch {
    return toParse.split('/api')[0]?.replace(/\/+$/, '') || DEFAULT_API_BASE;
  }
}
