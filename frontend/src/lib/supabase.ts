import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = typeof import.meta?.env?.VITE_SUPABASE_URL === 'string' ? import.meta.env.VITE_SUPABASE_URL.trim() : '';
const supabaseAnonKey = typeof import.meta?.env?.VITE_SUPABASE_ANON_KEY === 'string' ? import.meta.env.VITE_SUPABASE_ANON_KEY.trim() : '';

// 🔍 Logs de debug pour vérifier la configuration au démarrage
if (!supabaseUrl) {
  console.error('❌ [Supabase] VITE_SUPABASE_URL est vide ou non définie');
  console.info('💡 [Supabase] Vérifiez que .env à la racine du projet contient VITE_SUPABASE_URL');
} else {
  console.info('✅ [Supabase] URL configurée:', supabaseUrl);
}

if (!supabaseAnonKey) {
  console.error('❌ [Supabase] VITE_SUPABASE_ANON_KEY est vide ou non définie');
  console.info('💡 [Supabase] Vérifiez que .env à la racine du projet contient VITE_SUPABASE_ANON_KEY');
} else {
  console.info('✅ [Supabase] Anon Key configurée (longueur:', supabaseAnonKey.length, 'caractères)');
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('⚠️ [Supabase] Client non initialisé: configuration manquante');
    return null;
  }
  if (!client) {
    try {
      client = createClient(supabaseUrl, supabaseAnonKey);
      console.info('✅ [Supabase] Client initialisé avec succès');
    } catch (err) {
      console.error('❌ [Supabase] Erreur lors de la création du client:', err);
      return null;
    }
  }
  return client;
}

export function isSupabaseConfigured(): boolean {
  const configured = Boolean(supabaseUrl && supabaseAnonKey);
  if (!configured) {
    console.warn('⚠️ [Supabase] Configuration incomplète');
  }
  return configured;
}
