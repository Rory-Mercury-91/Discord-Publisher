import type { SupabaseClient } from '@supabase/supabase-js';
import { isTauri } from '../components/list-form-view/constants';

/** URL complète utilisée comme redirectTo Supabase (mot de passe oublié) pour l’app Tauri. */
export const DEFAULT_AUTH_DEEP_LINK_RESET_URL = 'discordpublisher://reset-password';

/**
 * Flag sessionStorage : l’utilisateur doit encore choisir un mot de passe (lien e-mail).
 * Supabase émet souvent SIGNED_IN au lieu de PASSWORD_RECOVERY — on s’en sert pour afficher la modal.
 */
export const PENDING_PASSWORD_RECOVERY_KEY = 'discord-publisher:pending-password-recovery';

export function hasPendingPasswordRecovery(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(PENDING_PASSWORD_RECOVERY_KEY) === '1';
}

export function clearPendingPasswordRecovery(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(PENDING_PASSWORD_RECOVERY_KEY);
}

/**
 * Extrait access_token / refresh_token depuis une URL de recovery (fragment # ou query ?).
 */
function extractOAuthParams(url: string): URLSearchParams | null {
  const hashIdx = url.indexOf('#');
  if (hashIdx !== -1) {
    return new URLSearchParams(url.slice(hashIdx + 1));
  }
  const q = url.indexOf('?');
  if (q !== -1) {
    return new URLSearchParams(url.slice(q + 1).split('#')[0]);
  }
  return null;
}

/**
 * Applique une URL de deep link Supabase (recovery) à la session courante.
 */
function markRecoveryPending(trimmed: string, params: URLSearchParams | null) {
  const type = params?.get('type');
  const isRecovery =
    type === 'recovery' ||
    trimmed.toLowerCase().includes('reset-password') ||
    trimmed.includes('type%3Drecovery');
  if (isRecovery && typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(PENDING_PASSWORD_RECOVERY_KEY, '1');
    sessionStorage.setItem('sessionActive', '1');
  }
}

/**
 * Flux PKCE : ?code=... (projet Supabase en flowType pkce ou liens récents).
 */
async function applyRecoveryPkceCode(sb: SupabaseClient, trimmed: string): Promise<boolean> {
  const params = extractOAuthParams(trimmed);
  const code = params?.get('code');
  if (!code) return false;

  markRecoveryPending(trimmed, params);

  const { data, error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('[authDeepLink] exchangeCodeForSession:', error.message);
    return false;
  }
  if (!data.session) return false;
  return true;
}

export async function applyRecoveryFromUrl(sb: SupabaseClient, url: string): Promise<boolean> {
  const trimmed = url.trim();

  const params = extractOAuthParams(trimmed);
  if (trimmed.includes('code=') || params?.get('code')) {
    const ok = await applyRecoveryPkceCode(sb, trimmed);
    if (ok) return true;
  }

  if (!trimmed.includes('access_token')) {
    return false;
  }
  if (!params) return false;

  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) {
    return false;
  }

  markRecoveryPending(trimmed, params);

  const { error } = await sb.auth.setSession({ access_token, refresh_token });
  if (error) {
    console.error('[authDeepLink] setSession:', error.message);
    return false;
  }
  return true;
}

/**
 * Au démarrage et à chaque nouveau lien : enregistre la session recovery depuis le deep link.
 * Retourne une fonction de désabonnement.
 */
export async function initTauriDeepLinkRecovery(sb: SupabaseClient): Promise<() => void> {
  if (!isTauri) {
    return () => {};
  }

  const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');

  const processUrls = async (urls: unknown[]) => {
    for (const u of urls) {
      const url =
        typeof u === 'string' ? u : u != null && typeof (u as { href?: string }).href === 'string'
          ? (u as { href: string }).href
          : String(u);
      await applyRecoveryFromUrl(sb, url);
    }
  };

  const initial = await getCurrent();
  if (initial?.length) {
    await processUrls(initial);
  }

  const unlisten = await onOpenUrl((urls) => {
    void processUrls(urls);
  });

  return () => {
    unlisten();
  };
}
