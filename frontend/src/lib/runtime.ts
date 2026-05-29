/** Détecte l'exécution dans le runtime Tauri. */
export const isTauri = typeof window !== 'undefined' && !!(window as unknown as { __TAURI__?: unknown }).__TAURI__;
