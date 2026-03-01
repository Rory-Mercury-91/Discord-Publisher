import { useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from '../../state/authContext';
import { useToast } from '../shared/ToastProvider';
import AuthSignIn from './components/AuthSignIn';
import AuthSignUp from './components/AuthSignUp';
import AuthForgotPassword from './components/AuthForgotPassword';

export type AuthMode = 'signin' | 'signup' | 'forgot';

export default function AuthModal() {
  const { user, loading, signUp, signIn } = useAuth();
  const { showToast } = useToast();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [discordId, setDiscordId] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDiscordHelp, setShowDiscordHelp] = useState(false);
  const [rememberMe, setRememberMe] = useState<boolean>(() => localStorage.getItem('rememberMe') !== 'false');

  useEscapeKey(() => {}, true);
  useModalScrollLock(true);

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
    localStorage.setItem('rememberMe', String(rememberMe));
    if (!rememberMe) {
      sessionStorage.setItem('sessionActive', '1');
    } else {
      sessionStorage.removeItem('sessionActive');
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
    const p = pseudo.trim();
    const d = discordId.trim();
    if (!p) {
      showToast('Le pseudo est obligatoire', 'error');
      return;
    }
    if (!d) {
      showToast("L'ID Discord est obligatoire", 'error');
      return;
    }
    setBusy(true);
    try {
      const { error } = await signUp(email.trim(), password, { pseudo: p, discord_id: d });
      if (error) {
        showToast(error.message || "Erreur d'inscription", 'error');
        return;
      }
      showToast('Compte créé avec succès !', 'success');
    } finally {
      setBusy(false);
    }
  };

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
      const apiBase = localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || 'http://138.2.182.125:8080';
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${apiBase}/reset-password`
      });
      if (error) {
        showToast(error.message || "Erreur lors de l'envoi", 'error');
        return;
      }
      showToast('Email de réinitialisation envoyé ! Consultez votre boîte mail.', 'success');
      setMode('signin');
      setEmail('');
    } catch (err: unknown) {
      showToast((err as Error)?.message || 'Erreur inconnue', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="auth-modal__loading">
        <div>Chargement…</div>
      </div>
    );
  }

  if (user) return null;

  const title =
    mode === 'forgot'
      ? '🔑 Mot de passe oublié'
      : mode === 'signup'
        ? '📝 Créer un compte'
        : '🔐 Connexion';

  return (
    <div className="modal modal--auth">
      <div className="panel modal-panel--auth">
        <h2 className="auth-modal__title">{title}</h2>

        {mode === 'forgot' ? (
          <AuthForgotPassword
            email={email}
            busy={busy}
            onEmailChange={setEmail}
            onSubmit={handleForgotPassword}
            onBack={() => setMode('signin')}
          />
        ) : mode === 'signin' ? (
          <AuthSignIn
            email={email}
            password={password}
            rememberMe={rememberMe}
            busy={busy}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onRememberMeChange={setRememberMe}
            onSubmit={handleSignIn}
            onSwitchToSignUp={() => setMode('signup')}
            onSwitchToForgot={() => setMode('forgot')}
          />
        ) : (
          <AuthSignUp
            email={email}
            password={password}
            pseudo={pseudo}
            discordId={discordId}
            busy={busy}
            showDiscordHelp={showDiscordHelp}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onPseudoChange={setPseudo}
            onDiscordIdChange={setDiscordId}
            onToggleDiscordHelp={() => setShowDiscordHelp(v => !v)}
            onSubmit={handleSignUp}
            onSwitchToSignIn={() => setMode('signin')}
          />
        )}
      </div>
    </div>
  );
}
