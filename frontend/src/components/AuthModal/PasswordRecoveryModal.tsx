import { useState } from 'react';
import { useAuth } from '../../state/authContext';
import { useToast } from '../shared/ToastProvider';

/**
 * Affiché après ouverture du lien e-mail « mot de passe oublié » (deep link Tauri).
 */
export default function PasswordRecoveryModal() {
  const { completePasswordRecovery } = useAuth();
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      showToast('Le mot de passe doit faire au moins 6 caractères', 'error');
      return;
    }
    if (password !== confirm) {
      showToast('Les mots de passe ne correspondent pas', 'error');
      return;
    }
    setBusy(true);
    const { error, recoveredSamePassword } = await completePasswordRecovery(password);
    setBusy(false);
    if (recoveredSamePassword) {
      showToast(
        'C’est le même mot de passe que l’actuel : rien à changer. Vous pouvez utiliser l’application normalement.',
        'success'
      );
      return;
    }
    if (error) {
      showToast(error.message || 'Erreur', 'error');
      return;
    }
    showToast('Mot de passe mis à jour', 'success');
    setPassword('');
    setConfirm('');
  };

  return (
    <div className="modal modal--auth" style={{ zIndex: 100001 }}>
      <div className="panel modal-panel--auth">
        <h2 className="auth-modal__title">🔐 Nouveau mot de passe</h2>
        <p className="auth-form__intro">
          Vous avez ouvert le lien de réinitialisation. Choisissez un nouveau mot de passe pour votre compte.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="auth-form__field">
            <label className="form-label">Nouveau mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="form-input"
              autoComplete="new-password"
            />
          </div>
          <div className="auth-form__field">
            <label className="form-label">Confirmation</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="form-input"
              autoComplete="new-password"
            />
          </div>
          <div className="auth-form__actions">
            <button type="submit" disabled={busy} className="form-btn form-btn--primary">
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
