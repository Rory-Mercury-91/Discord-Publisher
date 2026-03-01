interface AuthForgotPasswordProps {
  email: string;
  busy: boolean;
  onEmailChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}

export default function AuthForgotPassword({
  email,
  busy,
  onEmailChange,
  onSubmit,
  onBack
}: AuthForgotPasswordProps) {
  return (
    <form onSubmit={onSubmit}>
      <p className="auth-form__intro">
        Saisissez votre adresse email. Vous recevrez un lien pour réinitialiser votre mot de passe.
      </p>
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
      <div className="auth-form__actions">
        <button type="button" onClick={onBack} className="form-btn form-btn--ghost">
          Retour
        </button>
        <button type="submit" disabled={busy} className="form-btn form-btn--primary">
          {busy ? 'Envoi…' : 'Envoyer le lien'}
        </button>
      </div>
    </form>
  );
}
