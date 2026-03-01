import { DISCORD_ID_HELP } from '../constants';

interface AuthSignUpProps {
  email: string;
  password: string;
  pseudo: string;
  discordId: string;
  busy: boolean;
  showDiscordHelp: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onPseudoChange: (v: string) => void;
  onDiscordIdChange: (v: string) => void;
  onToggleDiscordHelp: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onSwitchToSignIn: () => void;
}

export default function AuthSignUp({
  email,
  password,
  pseudo,
  discordId,
  busy,
  showDiscordHelp,
  onEmailChange,
  onPasswordChange,
  onPseudoChange,
  onDiscordIdChange,
  onToggleDiscordHelp,
  onSubmit,
  onSwitchToSignIn
}: AuthSignUpProps) {
  return (
    <>
      <form onSubmit={onSubmit}>
        <div className="auth-form__field">
          <label className="form-label">Email *</label>
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
          <label className="form-label">
            Mot de passe * <span className="form-label__hint">(min. 6 caractères)</span>
          </label>
          <input
            type="password"
            value={password}
            onChange={e => onPasswordChange(e.target.value)}
            placeholder="••••••••"
            required
            className="form-input"
          />
        </div>
        <div className="auth-form__divider auth-form__divider--labeled">
          <span className="auth-form__divider-label">Informations du profil</span>
        </div>
        <div className="auth-form__field">
          <label className="form-label">Pseudo *</label>
          <input
            type="text"
            value={pseudo}
            onChange={e => onPseudoChange(e.target.value)}
            placeholder="Votre pseudo"
            required
            className="form-input"
          />
        </div>
        <div className="auth-form__field">
          <label className="form-label">
            ID Discord *{' '}
            <button type="button" onClick={onToggleDiscordHelp} className="auth-link auth-link--normal">
              Comment le trouver ?
            </button>
          </label>
          {showDiscordHelp && (
            <div className="auth-help-box">{DISCORD_ID_HELP}</div>
          )}
          <input
            type="text"
            value={discordId}
            onChange={e => onDiscordIdChange(e.target.value)}
            placeholder="Ex. 394893413843206155"
            required
            className="form-input"
          />
        </div>
        <div className="auth-form__actions">
          <button type="submit" disabled={busy} className="form-btn form-btn--primary">
            {busy ? 'Création…' : 'Créer mon compte'}
          </button>
        </div>
      </form>
      <p className="auth-form__link-row auth-form__link-row--top">
        Déjà un compte ?{' '}
        <button type="button" onClick={onSwitchToSignIn} className="auth-link">
          Se connecter
        </button>
      </p>
    </>
  );
}
