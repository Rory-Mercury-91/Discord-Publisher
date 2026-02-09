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
  signUp: (email: string, password: string) => Promise<{ error?: { message: string } }>;
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
        console.info('💡 [Auth] L\'utilisateur peut continuer sans profil synchronisé');
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
      console.info('💡 [Auth] L\'application continue de fonctionner sans profil');
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
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        if (session?.user?.id) {
          console.info('ℹ️ [Auth] Session active détectée au démarrage:', session.user.email);
          fetchProfile(session.user.id).then((p) => {
            setProfile(p ?? null);
            if (!p) {
              console.info('💡 [Auth] Utilisateur connecté mais profil non disponible');
            }
          });
        } else {
          console.info('ℹ️ [Auth] Aucune session active au démarrage');
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('❌ [Auth] Erreur lors de la récupération de la session:', err);
        setLoading(false);
      });
    
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      console.info('ℹ️ [Auth] Changement d\'état:', _event, session?.user?.email || 'déconnecté');
      setUser(session?.user ?? null);
      if (session?.user?.id) {
        fetchProfile(session.user.id).then((p) => setProfile(p ?? null));
      } else {
        setProfile(null);
      }
    });
    
    return () => subscription.unsubscribe();
  }, [sb]);

  const signUp = async (email: string, password: string) => {
    if (!sb) return { error: { message: 'Supabase non configuré' } };
    const { error } = await sb.auth.signUp({ email, password });
    return { error: error ? { message: error.message } : undefined };
  };

  const signIn = async (email: string, password: string) => {
    if (!sb) {
      console.error('❌ [Auth] Tentative de connexion impossible: client Supabase null');
      return { error: { message: 'Supabase non configuré. Vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env' } };
    }
    
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      
      if (error) {
        // Logs détaillés pour distinguer les types d'erreur
        console.error('❌ [Auth] Échec de connexion:', {
          message: error.message,
          status: error.status,
          name: error.name,
        });
        
        // Messages d'erreur adaptés selon le type
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

  const signOut = async () => {
    if (sb) await sb.auth.signOut();
    setUser(null);
    setProfile(null);
  };

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
