/**
 * Helper functions pour les appels API avec traçabilité utilisateur
 */

import { getSupabase } from './supabase';

/**
 * Récupère l'UUID de l'utilisateur connecté
 */
export async function getCurrentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  
  try {
    const { data: { user } } = await sb.auth.getUser();
    return user?.id || null;
  } catch (error) {
    console.warn('[API] Impossible de récupérer l\'UUID utilisateur:', error);
    return null;
  }
}

/**
 * Crée les headers standards pour les appels API
 * Ajoute automatiquement X-API-KEY et X-User-ID
 */
export async function createApiHeaders(apiKey: string, additionalHeaders?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'X-API-KEY': apiKey,
    ...additionalHeaders,
  };
  
  // Ajouter l'UUID utilisateur si disponible
  const userId = await getCurrentUserId();
  if (userId) {
    headers['X-User-ID'] = userId;
  }
  
  return headers;
}

/**
 * Wrapper fetch avec headers enrichis automatiquement
 */
export async function apiFetch(
  url: string,
  apiKey: string,
  options?: RequestInit
): Promise<Response> {
  const headers = await createApiHeaders(apiKey, options?.headers as Record<string, string>);
  
  return fetch(url, {
    ...options,
    headers,
  });
}
