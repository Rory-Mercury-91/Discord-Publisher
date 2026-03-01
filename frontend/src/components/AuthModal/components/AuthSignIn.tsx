import Toggle from '../../shared/Toggle';

interface AuthSignInProps {
  email: string;
  password: string;
  rememberMe: boolean;
  busy: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onRememberMeChange: (v: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  onSwitchToSignUp: () => void;
  onSwitchToForgot: () => void;
}

export default function AuthSignIn({
  email,
  password,
  rememberMe,
  busy,
  onEmailChange,
  onPasswordChange,
  onRememberMeChange,
  onSubmit,
  onSwitchToSignUp,
  onSwitchToForgot
}: AuthSignInProps) {
  return (
    <>
      <form onSubmit={onSubmit}>
        <div className="auth-form__field">
          <label className="form-label">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => onEmailChange(e.target.value)}
            placeholder="vous@exemple.com"
            required
            className="form-input"
          />
        </div>
        <div className="auth-form__field">
          <label className="form-label">Mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={e => onPasswordChange(e.target.value)}
            placeholder="••••••••"
            required
            className="form-input"
          />
        </div>
        <div className="auth-form__row auth-form__row--remember">
          <Toggle
            checked={rememberMe}
            onChange={onRememberMeChange}
            label="Rester connecté"
          />
          <button type="submit" disabled={busy} className="form-btn form-btn--primary">
            {busy ? 'Chargement…' : 'Connexion'}
          </button>
        </div>
        {!rememberMe && (
          <p className="auth-form__hint">
            La session sera effacée à la fermeture du navigateur.
          </p>
        )}
      </form>
      <p className="auth-form__link-row">
        Pas encore de compte ?{' '}
        <button type="button" onClick={onSwitchToSignUp} className="auth-link">
          Créer un compte
        </button>
      </p>
      <div className="auth-form__divider" />
      <div className="auth-form__center">
        <button type="button" onClick={onSwitchToForgot} className="auth-link auth-link--muted">
          Mot de passe oublié ?
        </button>
      </div>
    </>
  );
}
