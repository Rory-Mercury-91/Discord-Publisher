// frontend\src\components\SettingsComponents\MyAccountSettings.tsx
import { useEffect, useState } from 'react';
import { useConfirm } from '../../hooks/useConfirm';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from '../../state/authContext';
import { useToast } from '../ToastProvider';

const sectionStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 20,
  background: 'rgba(255,255,255,0.02)',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  boxSizing: 'border-box',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'rgba(255,255,255,0.05)',
  color: 'var(--text)',
  fontSize: 14,
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  color: 'var(--muted)',
  fontWeight: 500,
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 16,
  alignItems: 'start',
};

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
    <div style={gridStyle}>
      {/* Qui peut modifier mes posts */}
      {profile?.id && (
        <section style={{ ...sectionStyle, alignSelf: 'stretch', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem', flexShrink: 0 }}>👥 Qui peut modifier mes posts</h4>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5, flexShrink: 0 }}>
            Cliquez sur un utilisateur pour autoriser ou révoquer son droit d'édition.<br />
            <span style={{ color: '#9ca3af' }}>⚪ Gris</span> = Non autorisé &nbsp;•&nbsp;
            <span style={{ color: '#10b981' }}>🟢 Vert</span> = Autorisé
          </p>

          {editorsLoading ? (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Chargement…</div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allProfiles
                .filter(p => p.id !== profile.id)
                .map(p => {
                  const allowed = allowedEditorIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleEditor(p.id, allowed)}
                      style={{
                        padding: '11px 14px',
                        borderRadius: 10,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                        textAlign: 'center',
                        transition: 'all 0.2s',
                        flexShrink: 0,
                        background: allowed ? 'rgba(16,185,129,0.15)' : 'rgba(156,163,175,0.15)',
                        color: allowed ? '#10b981' : '#9ca3af',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.boxShadow = allowed
                          ? '0 0 0 2px rgba(16,185,129,0.3)'
                          : '0 0 0 2px rgba(156,163,175,0.3)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      {allowed ? '🔓 ' : '🔒 '}{p.pseudo || '—'}
                    </button>
                  );
                })}

              {allProfiles.filter(p => p.id !== profile.id).length === 0 && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>
                  Aucun autre utilisateur en base.
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Sécurité du compte */}
      <section style={{ ...sectionStyle, gridColumn: profile?.id ? undefined : '1 / -1' }}>
        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>🔐 Sécurité du compte</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Modifier votre mot de passe de connexion.</p>

          {[
            { label: 'Ancien mot de passe', val: oldPassword, set: setOldPassword },
            { label: 'Nouveau mot de passe', val: newPassword, set: setNewPassword, hint: 'Minimum 6 caractères' },
            { label: 'Confirmer le nouveau mot de passe', val: confirmPassword, set: setConfirmPassword },
          ].map(({ label, val, set, hint }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={labelStyle}>{label}</label>
              <input
                type="password"
                value={val}
                onChange={e => set(e.target.value)}
                placeholder="••••••••"
                style={inputStyle}
              />
              {hint && <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>{hint}</p>}
            </div>
          ))}

          <button
            type="button"
            onClick={handleChangePassword}
            disabled={isChangingPassword}
            style={{
              padding: '12px 16px',
              background: 'var(--accent)',
              border: 'none',
              color: '#fff',
              borderRadius: 10,
              cursor: isChangingPassword ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 700,
              opacity: isChangingPassword ? 0.6 : 1,
            }}
          >
            {isChangingPassword ? '🔄 Changement…' : '🔐 Changer le mot de passe'}
          </button>
        </div>

        {/* Zone de danger */}
        <div style={{ padding: 16, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>☠️ Zone de danger</span>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>Action irréversible</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
            Supprime votre profil, instructions, templates et autorisations. Vos publications Discord restent visibles.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ ...labelStyle, color: '#ef4444' }}>Mot de passe de confirmation</label>
            <input
              type="password"
              value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)}
              placeholder="••••••••"
              style={{ ...inputStyle, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.05)' }}
            />
          </div>

          <button
            type="button"
            onClick={handleDeleteAccount}
            disabled={isDeletingAccount || !deletePassword}
            style={{
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: isDeletingAccount || !deletePassword ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.18)',
              border: '1px solid rgba(239,68,68,0.4)',
              color: isDeletingAccount || !deletePassword ? 'rgba(239,68,68,0.35)' : '#ef4444',
              borderRadius: 8,
              cursor: isDeletingAccount || !deletePassword ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 700,
              transition: 'all 0.2s',
            }}
          >
            {isDeletingAccount ? '⏳ Suppression…' : '🗑️ Supprimer définitivement mon compte'}
          </button>
        </div>
      </section>
    </div>
  );
}
