import { useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { getSupabase } from '../lib/supabase';
import { useAuth } from '../state/authContext';
import { useToast } from './ToastProvider';

const DISCORD_ID_HELP = `Pour récupérer votre ID Discord (mode développeur actif) :

1. Activez le Mode développeur dans Discord :
   • Paramètres utilisateur > Paramètres de l'application > Avancés
   • Activer "Mode développeur"

2. Une fois le mode dev actif : clic droit sur votre pseudo (dans un salon ou la liste des membres) > "Copier l'identifiant du membre".

L'ID ressemble à un long nombre (ex. 394893413843206155).`;

export default function AuthModal() {
  const { user, profile, loading, signUp, signIn, updateProfile } = useAuth();
  const { showToast } = useToast();
  const [mode, setMode] = useState<'signin' | 'signup' | 'profile' | 'forgot'>('signin'); // 🆕 Ajout 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pseudo, setPseudo] = useState(profile?.pseudo ?? '');
  const [discordId, setDiscordId] = useState(profile?.discord_id ?? '');
  const [busy, setBusy] = useState(false);
  const [showDiscordHelp, setShowDiscordHelp] = useState(false);

  useEscapeKey(() => { }, true);
  useModalScrollLock(true);

  const needProfile = user && (!profile?.discord_id?.trim() || !profile?.pseudo?.trim());

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      showToast('Email et mot de passe requis', 'error');
      return;
    }
    setBusy(true);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) {
      showToast(error.message || 'Erreur de connexion', 'error');
      return;
    }
    showToast('Connexion réussie', 'success');
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      showToast('Email et mot de passe requis', 'error');
      return;
    }
    if (password.length < 6) {
      showToast('Le mot de passe doit faire au moins 6 caractères', 'error');
      return;
    }
    setBusy(true);
    const { error } = await signUp(email.trim(), password);
    setBusy(false);
    if (error) {
      showToast(error.message || 'Erreur d\'inscription', 'error');
      return;
    }
    showToast('Compte créé. Complétez votre profil.', 'success');
    setMode('profile');
  };

  const handleProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = (pseudo || '').trim();
    const d = (discordId || '').trim();
    if (!p) {
      showToast('Le pseudo est obligatoire', 'error');
      return;
    }
    if (!d) {
      showToast('L\'ID Discord est obligatoire', 'error');
      return;
    }
    setBusy(true);
    const { error } = await updateProfile({ pseudo: p, discord_id: d });
    setBusy(false);
    if (error) {
      showToast(error.message || 'Erreur de mise à jour', 'error');
      return;
    }
    showToast('Profil enregistré', 'success');
  };

  // 🆕 NOUVELLE FONCTION : Réinitialisation mot de passe
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      showToast('Veuillez saisir votre adresse email', 'error');
      return;
    }

    setBusy(true);
    try {
      const sb = getSupabase();
      if (!sb) {
        showToast('Supabase non configuré', 'error');
        return;
      }

      // Récupérer l'URL de l'API depuis localStorage ou .env
      const apiBase = localStorage.getItem('apiBase') ||
        localStorage.getItem('apiUrl') ||
        'http://138.2.182.125:8080';

      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${apiBase}/reset-password`
      });

      if (error) {
        showToast(error.message || 'Erreur lors de l\'envoi', 'error');
        return;
      }

      showToast('Email de réinitialisation envoyé ! Consultez votre boîte mail.', 'success');
      setMode('signin');
      setEmail('');

    } catch (error: any) {
      showToast(error.message || 'Erreur inconnue', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999
      }}>
        <div style={{ color: 'var(--text)', fontSize: 18 }}>Chargement…</div>
      </div>
    );
  }

  if (!needProfile && user && profile?.discord_id?.trim()) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999,
        padding: 20, boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, maxWidth: 440, width: '100%',
          boxShadow: '0 12px 40px rgba(0,0,0,0.4)'
        }}
      >
        <h2 style={{ margin: '0 0 20px', fontSize: 20 }}>
          {needProfile || mode === 'profile' ? '👤 Compléter mon profil' :
            mode === 'forgot' ? '🔑 Mot de passe oublié' : '🔐 Connexion'}
        </h2>

        {/* 🆕 MODE MOT DE PASSE OUBLIÉ */}
        {mode === 'forgot' ? (
          <form onSubmit={handleForgotPassword}>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>
              Saisissez votre adresse email. Vous recevrez un lien pour réinitialiser votre mot de passe.
            </p>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                required
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button type="button" onClick={() => setMode('signin')} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>
                Retour
              </button>
              <button type="submit" disabled={busy} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                {busy ? 'Envoi…' : 'Envoyer le lien'}
              </button>
            </div>
          </form>
        ) : needProfile || mode === 'profile' ? (
          // MODE PROFIL (inchangé)
          <form onSubmit={handleProfile}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>Pseudo *</label>
              <input
                type="text"
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                placeholder="Votre pseudo"
                required
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
                ID Discord * <span style={{ fontWeight: 400, color: 'var(--accent)', cursor: 'pointer' }} onClick={() => setShowDiscordHelp(!showDiscordHelp)}>Comment le trouver ?</span>
              </label>
              {showDiscordHelp && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, padding: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 8, whiteSpace: 'pre-line' }}>
                  {DISCORD_ID_HELP}
                </div>
              )}
              <input
                type="text"
                value={discordId}
                onChange={(e) => setDiscordId(e.target.value)}
                placeholder="Ex. 394893413843206155"
                required
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              {user && !needProfile ? null : (
                <button type="button" onClick={() => setMode('signin')} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>
                  Retour
                </button>
              )}
              <button type="submit" disabled={busy} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        ) : (
          // MODE CONNEXION / INSCRIPTION (avec lien mot de passe oublié)
          <>
            <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>Mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}
                />
              </div>

              {/* 🆕 LIEN MOT DE PASSE OUBLIÉ */}
              {mode === 'signin' && (
                <div style={{ marginBottom: 14, textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent)',
                      cursor: 'pointer',
                      fontSize: 12,
                      textDecoration: 'underline'
                    }}
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="submit" disabled={busy} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                  {busy ? 'Chargement…' : mode === 'signin' ? 'Connexion' : 'Créer mon compte'}
                </button>
              </div>
            </form>
            <p style={{ marginTop: 16, fontSize: 13, color: 'var(--muted)' }}>
              {mode === 'signin' ? (
                <>Pas encore de compte ? <button type="button" onClick={() => setMode('signup')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>Créer un compte</button></>
              ) : (
                <>Déjà un compte ? <button type="button" onClick={() => setMode('signin')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>Se connecter</button></>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
