import { DEFAULT_AUTH_DEEP_LINK_RESET_URL } from './authDeepLink';
import { isTauri } from '../components/list-form-view/constants';

/**
 * Origine publique de l’application (frontend), pour les redirections Supabase (e-mail reset, etc.).
 * L’URL du serveur API seul (ex. :8080 aiohttp) ne doit pas être utilisée : il ne sert pas le SPA sur /reset-password.
 */

/** redirectTo complet pour resetPasswordForEmail (deep link Tauri ou URL web). */
export function getPasswordResetRedirectTo(): string {
  const fromEnv =
    typeof import.meta.env.VITE_AUTH_DEEP_LINK_RESET_URL === 'string'
      ? import.meta.env.VITE_AUTH_DEEP_LINK_RESET_URL.trim()
      : '';
  if (fromEnv) {
    return fromEnv;
  }
  if (isTauri) {
    return DEFAULT_AUTH_DEEP_LINK_RESET_URL;
  }
  const origin = getPasswordResetRedirectOrigin();
  return `${origin}/reset-password`;
}

export function getPasswordResetRedirectOrigin(): string {
  const fromEnv =
    typeof import.meta.env.VITE_PUBLIC_APP_URL === 'string'
      ? import.meta.env.VITE_PUBLIC_APP_URL.trim()
      : '';
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    const o = window.location.origin;
    if (o && !o.startsWith('file:') && o !== 'null') {
      return o.replace(/\/+$/, '');
    }
  }

  const apiFallback = (
    localStorage.getItem('apiBase') ||
    localStorage.getItem('apiUrl') ||
    (typeof import.meta.env.VITE_PUBLISHER_API_URL === 'string' ? import.meta.env.VITE_PUBLISHER_API_URL : '') ||
    ''
  ).replace(/\/+$/, '');

  if (apiFallback) {
    console.warn(
      '[Auth] VITE_PUBLIC_APP_URL absent : impossible de deviner l’URL du frontend. ' +
        'Définissez VITE_PUBLIC_APP_URL (ex. http://localhost:5173 en dev, ou l’URL HTTPS du site qui sert le build). ' +
        'Fallback actuel (API) :',
      apiFallback
    );
    return apiFallback;
  }

  return 'http://localhost:5173';
}
