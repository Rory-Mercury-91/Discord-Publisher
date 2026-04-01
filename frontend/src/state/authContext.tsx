import type { User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  clearPendingPasswordRecovery,
  hasPendingPasswordRecovery,
  initTauriDeepLinkRecovery,
  PENDING_PASSWORD_RECOVERY_KEY
} from '../lib/authDeepLink';
import { getSupabase } from '../lib/supabase';
import { translateSupabaseAuthError } from '../lib/supabaseAuthMessages';

export type Profile = {
  id: string;
  pseudo: string;
  discord_id: string;
  is_master_admin?: boolean;
  list_manager?: boolean;
  created_at?: string;
  updated_at?: string;
};

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** Session ouverte via lien e-mail « mot de passe oublié » — afficher le formulaire de nouveau mot de passe */
  recoveryMode: boolean;
  // 🆕 signUp accepte maintenant des métadonnées optionnelles
  signUp: (email: string, password: string, metadata?: { pseudo?: string; discord_id?: string }) => Promise<{ error?: { message: string } }>;
  signIn: (email: string, password: string) => Promise<{ error?: { message: string } }>;
  signOut: () => Promise<void>;
  updateProfile: (data: { pseudo?: string; discord_id?: string }) => Promise<{ error?: { message: string } }>;
  refreshProfile: () => Promise<void>;
  completePasswordRecovery: (
    newPassword: string
  ) => Promise<{ error?: { message: string }; recoveredSamePassword?: boolean }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** True si l’utilisateur arrive d’un lien e-mail Supabase (réinitialisation / recovery). */
function isPasswordRecoveryContext(): boolean {
  if (typeof window === 'undefined') return false;
  const { pathname, hash } = window.location;
  return pathname.includes('reset-password') || hash.includes('type=recovery');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);

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

    let deepUnsub: (() => void) | undefined;
    let cancelled = false;

    // Lien « mot de passe oublié » : pas de sessionActive au premier chargement → ne pas confondre avec « onglet fermé »
    if (typeof window !== 'undefined') {
      if (isPasswordRecoveryContext()) {
        sessionStorage.setItem('sessionActive', '1');
      }
      const h = window.location.hash;
      if (h.includes('type=recovery') || h.includes('type%3Drecovery')) {
        sessionStorage.setItem(PENDING_PASSWORD_RECOVERY_KEY, '1');
      }
    }

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      console.info('ℹ️ [Auth] Changement d\'état:', _event, session?.user?.email || 'déconnecté');
      if (_event === 'PASSWORD_RECOVERY' && session) {
        sessionStorage.setItem('sessionActive', '1');
        setRecoveryMode(true);
      }
      // Souvent Supabase n’émet que SIGNED_IN sur le lien de reset — le flag sessionStorage est posé dans authDeepLink
      if (_event === 'SIGNED_IN' && session && hasPendingPasswordRecovery()) {
        sessionStorage.setItem('sessionActive', '1');
        setRecoveryMode(true);
      }
      if (_event === 'SIGNED_OUT') {
        setRecoveryMode(false);
        clearPendingPasswordRecovery();
      }
      setUser(session?.user ?? null);
      if (session?.user?.id) {
        fetchProfile(session.user.id).then(p => setProfile(p ?? null));
      } else {
        setProfile(null);
      }
    });

    (async () => {
      try {
        deepUnsub = await initTauriDeepLinkRecovery(sb);
      } catch (e) {
        console.warn('⚠️ [Auth] Deep link recovery:', e);
      }
      if (cancelled) return;

      try {
        const { data: { session } } = await sb.auth.getSession();
        if (cancelled) return;

        const currentUser = session?.user ?? null;

        if (currentUser) {
          const rememberMe = localStorage.getItem('rememberMe');
          const sessionActive = sessionStorage.getItem('sessionActive');

          if (rememberMe === 'false' && !sessionActive && !isPasswordRecoveryContext()) {
            console.info('ℹ️ [Auth] Session non persistante détectée (onglet fermé) → déconnexion automatique');
            await sb.auth.signOut();
            setUser(null);
            setProfile(null);
            setRecoveryMode(false);
            setLoading(false);
            return;
          }
        }

        setUser(currentUser);
        if (currentUser?.id) {
          console.info('ℹ️ [Auth] Session active détectée au démarrage:', currentUser.email);
          if (hasPendingPasswordRecovery()) {
            setRecoveryMode(true);
            sessionStorage.setItem('sessionActive', '1');
          }
          fetchProfile(currentUser.id).then(p => {
            if (!cancelled) setProfile(p ?? null);
          });
        } else {
          console.info('ℹ️ [Auth] Aucune session active au démarrage');
        }
      } catch (err) {
        console.error('❌ [Auth] Erreur lors de la récupération de la session:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      deepUnsub?.();
      subscription.unsubscribe();
    };
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

      if (error) return { error: { message: translateSupabaseAuthError(error.message) } };

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
      const m = err?.message || 'Erreur inattendue';
      return { error: { message: translateSupabaseAuthError(typeof m === 'string' ? m : String(m)) } };
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
        return { error: { message: translateSupabaseAuthError(error.message) } };
      }
      console.info('✅ [Auth] Connexion réussie pour:', data.user?.email);
      return { error: undefined };
    } catch (err) {
      console.error('❌ [Auth] Exception lors de la connexion:', err);
      return { error: { message: 'Erreur inattendue lors de la connexion' } };
    }
  };

  // ─── DÉCONNEXION ─────────────────────────────────────────────────────────────
  const completePasswordRecovery = async (newPassword: string) => {
    if (!sb || !user) return { error: { message: 'Non connecté' } };
    if (newPassword.length < 6) return { error: { message: 'Minimum 6 caractères' } };
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (!error) {
      setRecoveryMode(false);
      clearPendingPasswordRecovery();
      return { error: undefined };
    }
    const lower = error.message.toLowerCase();
    const samePassword =
      lower.includes('new password should be different') ||
      lower.includes('different from the old password') ||
      lower.includes('same as the old');
    if (samePassword) {
      setRecoveryMode(false);
      clearPendingPasswordRecovery();
      return { recoveredSamePassword: true };
    }
    return { error: { message: translateSupabaseAuthError(error.message) } };
  };

  const signOut = async () => {
    if (sb) await sb.auth.signOut();
    setRecoveryMode(false);
    clearPendingPasswordRecovery();
    // Nettoyer les flags de session
    sessionStorage.removeItem('sessionActive');
    localStorage.removeItem('rememberMe');
    // Révoquer l'accès Master Admin : à la déconnexion il faut réappliquer le code
    localStorage.removeItem('discord-publisher:master-admin-code');
    window.dispatchEvent(new CustomEvent('masterAdminLocked'));
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
    return { error: error ? { message: translateSupabaseAuthError(error.message) } : undefined };
  };

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    recoveryMode,
    signUp,
    signIn,
    signOut,
    updateProfile,
    refreshProfile,
    completePasswordRecovery
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
