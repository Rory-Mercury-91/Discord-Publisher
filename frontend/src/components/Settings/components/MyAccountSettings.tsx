// frontend\src\components\SettingsComponents\MyAccountSettings.tsx
import { useEffect, useState } from 'react';
import { useConfirm } from '../../../hooks/useConfirm';
import { getSupabase } from '../../../lib/supabase';
import { useAuth } from '../../../state/authContext';
import { useToast } from '../../ToastProvider';

interface MyAccountSettingsProps {
  onClose?: () => void;
}

export default function MyAccountSettings({ onClose }: MyAccountSettingsProps) {
  const { showToast } = useToast();
  const { profile, user } = useAuth();
  const { confirm } = useConfirm();

  // États du compte
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [allowedEditorIds, setAllowedEditorIds] = useState<Set<string>>(new Set());
  const [editorsLoading, setEditorsLoading] = useState(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [deletePassword, setDeletePassword] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Chargement des profils et éditeurs autorisés
  useEffect(() => {
    if (!profile?.id) return;
    const sb = getSupabase();
    if (!sb) return;

    setEditorsLoading(true);
    (async () => {
      try {
        const { data: profilesData } = await sb.from('profiles').select('id, pseudo, discord_id');
        setAllProfiles((profilesData ?? []) as any[]);

        const { data: allowedData } = await sb
          .from('allowed_editors')
          .select('editor_id')
          .eq('owner_id', profile.id);

        setAllowedEditorIds(new Set((allowedData ?? []).map((r: any) => r.editor_id)));
      } catch (e) {
        console.error(e);
        setAllProfiles([]);
        setAllowedEditorIds(new Set());
      } finally {
        setEditorsLoading(false);
      }
    })();
  }, [profile?.id]);

  const toggleEditor = async (editorId: string, currentlyAllowed: boolean) => {
    const sb = getSupabase();
    if (!sb || !profile?.id) return;

    if (currentlyAllowed) {
      const { error } = await sb
        .from('allowed_editors')
        .delete()
        .eq('owner_id', profile.id)
        .eq('editor_id', editorId);

      if (error) {
        showToast('Erreur lors de la révocation', 'error');
        return;
      }
      setAllowedEditorIds(prev => {
        const n = new Set(prev);
        n.delete(editorId);
        return n;
      });
      showToast('Autorisation révoquée', 'success');
    } else {
      const { error } = await sb
        .from('allowed_editors')
        .insert({ owner_id: profile.id, editor_id: editorId });

      if (error) {
        showToast("Erreur lors de l'autorisation", 'error');
        return;
      }
      setAllowedEditorIds(prev => new Set(prev).add(editorId));
      showToast('Utilisateur autorisé', 'success');
    }
  };

  // Changement de mot de passe
  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      showToast('Tous les champs sont obligatoires', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('Minimum 6 caractères', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Les mots de passe ne correspondent pas', 'error');
      return;
    }
    if (oldPassword === newPassword) {
      showToast('Le nouveau mot de passe doit être différent', 'error');
      return;
    }

    setIsChangingPassword(true);
    try {
      const sb = getSupabase();
      if (!sb) {
        showToast('Supabase non configuré', 'error');
        return;
      }

      const { data: { user: u } } = await sb.auth.getUser();
      if (!u?.email) {
        showToast('Utilisateur non connecté', 'error');
        return;
      }

      const { error: signInError } = await sb.auth.signInWithPassword({
        email: u.email,
        password: oldPassword,
      });
      if (signInError) {
        showToast('Ancien mot de passe incorrect', 'error');
        return;
      }

      const { error: updateError } = await sb.auth.updateUser({ password: newPassword });
      if (updateError) {
        showToast(`Erreur : ${updateError.message}`, 'error');
        return;
      }

      showToast('Mot de passe modifié avec succès', 'success');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      showToast(`Erreur : ${e.message || 'Inconnue'}`, 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Suppression de compte
  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      showToast('Saisissez votre mot de passe pour confirmer', 'error');
      return;
    }

    const sb = getSupabase();
    if (!sb || !user?.email) {
      showToast('Utilisateur non connecté', 'error');
      return;
    }

    setIsDeletingAccount(true);
    try {
      const { error: signInError } = await sb.auth.signInWithPassword({
        email: user.email,
        password: deletePassword,
      });
      if (signInError) {
        showToast('Mot de passe incorrect', 'error');
        return;
      }

      const confirmed = await confirm({
        title: '⚠️ Suppression définitive du compte',
        message:
          `Vous êtes sur le point de supprimer définitivement votre compte.\n\n` +
          `Seront supprimés :\n• Votre profil\n• Vos instructions\n• Vos templates\n• Vos autorisations d'édition\n\n` +
          `⚠️ Vos publications Discord restent visibles sur le serveur.\n\nCette action est IRRÉVERSIBLE.`,
        confirmText: 'Supprimer mon compte',
        cancelText: 'Annuler',
        type: 'danger',
      });

      if (!confirmed) return;

      const baseUrl = (localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || 'http://138.2.182.125:8080').replace(/\/+$/, '');
      const key = localStorage.getItem('apiKey') || '';

      const res = await fetch(`${baseUrl}/api/account/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': key,
          'X-User-ID': user.id,
        },
        body: JSON.stringify({ user_id: user.id }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(`Erreur : ${data.error || 'Inconnue'}`, 'error');
        return;
      }

      showToast('Compte supprimé. Au revoir !', 'success');
      onClose?.();

      setTimeout(async () => {
        if (sb) await sb.auth.signOut();
        sessionStorage.removeItem('sessionActive');
        localStorage.removeItem('rememberMe');
      }, 1000);
    } catch (err: any) {
      showToast(`Erreur : ${err?.message || err}`, 'error');
    } finally {
      setIsDeletingAccount(false);
      setDeletePassword('');
    }
  };

  return (
    <div className="settings-grid">
      {profile?.id && (
        <section className="settings-section settings-grid--full">
          <h4 className="settings-section__title">👥 Qui peut modifier mes posts</h4>
          <p className="settings-section__intro" style={{ marginBottom: 12 }}>
            Cliquez sur un utilisateur pour autoriser ou révoquer son droit d&apos;édition. &nbsp;
            <span style={{ color: '#9ca3af' }}>⚪ Gris</span> = Non autorisé &nbsp;•&nbsp;
            <span style={{ color: '#10b981' }}>🟢 Vert</span> = Autorisé
          </p>

          {editorsLoading ? (
            <div className="settings-section__loading">Chargement…</div>
          ) : (
            <div className="settings-editor-badges">
              {allProfiles
                .filter(p => p.id !== profile.id)
                .map(p => {
                  const allowed = allowedEditorIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleEditor(p.id, allowed)}
                      className={`settings-editor-badge ${allowed ? 'settings-editor-badge--allowed' : ''}`}
                    >
                      {allowed ? '🔓 ' : '🔒 '}{p.pseudo || '—'}
                    </button>
                  );
                })}

              {allProfiles.filter(p => p.id !== profile.id).length === 0 && (
                <div className="settings-section__empty">
                  Aucun autre utilisateur en base.
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="settings-section settings-grid--full">
        <h4 className="settings-section__title">🔐 Sécurité du compte</h4>
        <p className="settings-section__intro" style={{ marginBottom: 16 }}>Modifier votre mot de passe de connexion.</p>

        <div className="settings-form-actions">
          <div className="settings-password-grid">
            <div className="form-field">
              <label className="form-label">Nouveau mot de passe</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="form-input"
              />
              <p className="settings-section__intro" style={{ marginTop: 4, marginBottom: 0, fontSize: 11 }}>Minimum 6 caractères</p>
            </div>
            <div className="form-field">
              <label className="form-label">Confirmer le nouveau</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="form-input"
              />
            </div>
            <div className="form-field">
              <label className="form-label">Ancien mot de passe</label>
              <input
                type="password"
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                placeholder="••••••••"
                className="form-input"
              />
            </div>
          </div>
          <div className="settings-form-actions__row">
            <button
              type="button"
              onClick={handleChangePassword}
              disabled={isChangingPassword}
              className="form-btn form-btn--primary"
            >
              {isChangingPassword ? '🔄 Changement…' : '🔐 Changer le mot de passe'}
            </button>
          </div>
        </div>

        {/* Zone de danger — pleine largeur */}
        <div className="settings-section--danger">
          <div className="settings-section--danger__heading">
            <span className="settings-section--danger__title">☠️ Zone de danger</span>
            <span className="settings-section--danger__sub">Action irréversible</span>
          </div>
          <p className="settings-section--danger__body">
            Supprime votre profil, instructions, templates et autorisations. Vos publications Discord restent visibles.
          </p>

          <div className="settings-section--danger__actions">
            <div className="settings-section--danger__field">
              <label className="form-label form-label--danger">Mot de passe de confirmation</label>
              <input
                type="password"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                placeholder="••••••••"
                className="form-input form-input--danger"
              />
            </div>
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={isDeletingAccount || !deletePassword}
              className="settings-btn--danger"
            >
              {isDeletingAccount ? '⏳ Suppression…' : '🗑️ Supprimer définitivement mon compte'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
