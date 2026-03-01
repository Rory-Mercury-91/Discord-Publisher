export const LISTFORM_GOOGLE_KEY = 'listform_google_connected_once';

export const isTauri =
  typeof window !== 'undefined' &&
  !!(window as unknown as { __TAURI__?: unknown }).__TAURI__;

export function isGoogleUrl(u: string): boolean {
  try {
    const host = new URL(u).hostname.toLowerCase();
    return (
      host.includes('google.com') ||
      host.includes('script.google') ||
      host.includes('docs.google') ||
      host.includes('forms.google')
    );
  } catch {
    return false;
  }
}

export function getInitialTryIframeGoogle(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(LISTFORM_GOOGLE_KEY) === 'true';
  } catch {
    return false;
  }
}
