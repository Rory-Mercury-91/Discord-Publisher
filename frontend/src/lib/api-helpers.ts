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

/**
 * Enregistre un clic sur un lien de traduction dans Supabase.
 * Permet ensuite de connaître le nombre total de clics (téléchargements) par jeu.
 */
export async function trackTranslationClick(params: {
  f95Url: string;
  translationUrl?: string | null;
  source?: string;
}): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    console.warn('[Stats] Supabase non configuré (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — clic non enregistré.');
    return;
  }
  if (!params.f95Url) return;

  try {
    const { error } = await sb.from('translation_clicks').insert({
      f95_url: params.f95Url,
      translation_url: params.translationUrl ?? null,
      source: params.source ?? 'unknown',
    });
    if (error) {
      console.error('[Stats] Erreur Supabase lors de l\'enregistrement du clic :', error.message, error);
      return;
    }
    console.info('[Stats] Clic traduction enregistré pour', params.f95Url);
  } catch (err) {
    console.warn('[Stats] Impossible d\'enregistrer le clic de traduction :', err);
  }
}

