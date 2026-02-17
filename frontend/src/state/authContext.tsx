import type { User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabase';

export type Profile = {
  id: string;
  pseudo: string;
  discord_id: string;
  is_master_admin?: boolean;
  created_at?: string;
  updated_at?: string;
};

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  // 🆕 signUp accepte maintenant des métadonnées optionnelles
  signUp: (email: string, password: string, metadata?: { pseudo?: string; discord_id?: string }) => Promise<{ error?: { message: string } }>;
  signIn: (email: string, password: string) => Promise<{ error?: { message: string } }>;
  signOut: () => Promise<void>;
  updateProfile: (data: { pseudo?: string; discord_id?: string }) => Promise<{ error?: { message: string } }>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const sb = getSupabase();

  const fetchProfile = async (userId: string) => {
    if (!sb) {
      console.warn('⚠️ [Auth] Impossible de récupérer le profil: client Supabase null');
      return null;
    }
    try {
      const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (error) {
        console.warn('⚠️ [Auth] Profil non récupéré:', error.message);
        return null;
      }
      if (!data) {
        console.info('ℹ️ [Auth] Aucun profil trouvé pour l\'utilisateur:', userId);
        return null;
      }
      console.info('✅ [Auth] Profil récupéré:', data.pseudo || userId);
      return data as Profile;
    } catch (err) {
      console.error('❌ [Auth] Erreur lors de la récupération du profil:', err);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (!user?.id) return;
    const p = await fetchProfile(user.id);
    setProfile(p ?? null);
  };

  useEffect(() => {
    if (!sb) {
      console.warn('⚠️ [Auth] Client Supabase non disponible au montage du contexte');
      setLoading(false);
      return;
    }

    sb.auth.getSession()
      .then(async ({ data: { session } }) => {
        const currentUser = session?.user ?? null;

        // 🆕 Vérification "Maintenir la connexion"
        // Si rememberMe=false et que sessionStorage ne contient pas le flag (onglet fermé/rouvert),
        // on force la déconnexion pour respecter le choix de l'utilisateur.
        if (currentUser) {
          const rememberMe = localStorage.getItem('rememberMe');
          const sessionActive = sessionStorage.getItem('sessionActive');

          if (rememberMe === 'false' && !sessionActive) {
            console.info('ℹ️ [Auth] Session non persistante détectée (onglet fermé) → déconnexion automatique');
            await sb.auth.signOut();
            setUser(null);
            setProfile(null);
            setLoading(false);
            return;
          }
        }

        setUser(currentUser);
        if (currentUser?.id) {
          console.info('ℹ️ [Auth] Session active détectée au démarrage:', currentUser.email);
          fetchProfile(currentUser.id).then(p => {
            setProfile(p ?? null);
          });
        } else {
          console.info('ℹ️ [Auth] Aucune session active au démarrage');
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('❌ [Auth] Erreur lors de la récupération de la session:', err);
        setLoading(false);
      });

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      console.info('ℹ️ [Auth] Changement d\'état:', _event, session?.user?.email || 'déconnecté');
      setUser(session?.user ?? null);
      if (session?.user?.id) {
        fetchProfile(session.user.id).then(p => setProfile(p ?? null));
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [sb]);

  // ─── INSCRIPTION ──────────────────────────────────────────────────────────────
  // 🆕 Accepte des métadonnées (pseudo + discord_id) pour créer le profil en une seule étape.
  const signUp = async (
    email: string,
    password: string,
    metadata?: { pseudo?: string; discord_id?: string }
  ) => {
    if (!sb) return { error: { message: 'Supabase non configuré' } };

    try {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        // Les métadonnées sont stockées dans auth.users.raw_user_meta_data
        // et peuvent être utilisées par des triggers Supabase si configurés.
        options: metadata ? { data: metadata } : undefined
      });

      if (error) return { error: { message: error.message } };

      // 🆕 Si l'utilisateur est directement disponible (pas de confirmation email requise),
      // on upsert son profil immédiatement avec le pseudo et l'ID Discord fournis.
      if (data.user && metadata && (metadata.pseudo || metadata.discord_id)) {
        try {
          const row: Record<string, unknown> = {
            id: data.user.id,
            updated_at: new Date().toISOString()
          };
          if (metadata.pseudo) row.pseudo = metadata.pseudo;
          if (metadata.discord_id) row.discord_id = metadata.discord_id;

          const { error: profileError } = await sb
            .from('profiles')
            .upsert(row, { onConflict: 'id' });

          if (profileError) {
            console.warn('⚠️ [Auth] Profil créé partiellement:', profileError.message);
          } else {
            console.info('✅ [Auth] Profil créé en même temps que le compte');
            // Mettre à jour l'état local directement
            setProfile({
              id: data.user.id,
              pseudo: metadata.pseudo ?? '',
              discord_id: metadata.discord_id ?? '',
            });
          }
        } catch (profileErr) {
          console.warn('⚠️ [Auth] Erreur création profil:', profileErr);
          // Non bloquant : le compte est créé, le profil peut être complété ensuite
        }
      }

      return { error: undefined };
    } catch (err: any) {
      return { error: { message: err?.message || 'Erreur inattendue' } };
    }
  };

  // ─── CONNEXION ───────────────────────────────────────────────────────────────
  const signIn = async (email: string, password: string) => {
    if (!sb) {
      console.error('❌ [Auth] Tentative de connexion impossible: client Supabase null');
      return { error: { message: 'Supabase non configuré. Vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env' } };
    }
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('❌ [Auth] Échec de connexion:', { message: error.message, status: error.status });
        if (error.message.includes('Invalid login credentials')) {
          return { error: { message: 'Email ou mot de passe incorrect' } };
        }
        if (error.message.includes('Email not confirmed')) {
          return { error: { message: 'Email non confirmé. Vérifiez votre boîte mail.' } };
        }
        if (error.status === 0 || error.message.includes('network') || error.message.includes('fetch')) {
          return { error: { message: 'Erreur réseau. Vérifiez votre connexion Internet.' } };
        }
        return { error: { message: error.message } };
      }
      console.info('✅ [Auth] Connexion réussie pour:', data.user?.email);
      return { error: undefined };
    } catch (err) {
      console.error('❌ [Auth] Exception lors de la connexion:', err);
      return { error: { message: 'Erreur inattendue lors de la connexion' } };
    }
  };

  // ─── DÉCONNEXION ─────────────────────────────────────────────────────────────
  const signOut = async () => {
    if (sb) await sb.auth.signOut();
    // 🆕 Nettoyer les flags de session
    sessionStorage.removeItem('sessionActive');
    localStorage.removeItem('rememberMe');
    setUser(null);
    setProfile(null);
  };

  // ─── MISE À JOUR PROFIL ───────────────────────────────────────────────────────
  const updateProfile = async (data: { pseudo?: string; discord_id?: string }) => {
    if (!sb || !user?.id) return { error: { message: 'Non connecté' } };
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.pseudo !== undefined) row.pseudo = data.pseudo;
    if (data.discord_id !== undefined) row.discord_id = data.discord_id;
    const { error } = await sb.from('profiles').upsert({ id: user.id, ...row }, { onConflict: 'id' });
    if (!error) await refreshProfile();
    return { error: error ? { message: error.message } : undefined };
  };

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    updateProfile,
    refreshProfile
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
