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

// Petit composant Toggle réutilisable (style LogsModal)
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
      <div
        style={{
          position: 'relative',
          width: 40,
          height: 22,
          borderRadius: 11,
          background: checked ? 'var(--accent)' : 'var(--border)',
          transition: 'background 0.2s ease',
          cursor: 'pointer',
          flexShrink: 0
        }}
        onClick={onChange}
      >
        <div
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 21 : 3,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s ease',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
        />
      </div>
      <span style={{ fontSize: 13, fontWeight: 500, color: checked ? 'var(--text)' : 'var(--muted)' }}>
        {label}
      </span>
    </label>
  );
}

export default function AuthModal() {
  const { user, profile, loading, signUp, signIn, updateProfile } = useAuth();
  const { showToast } = useToast();

  const [mode, setMode] = useState<'signin' | 'signup' | 'profile' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pseudo, setPseudo] = useState(profile?.pseudo ?? '');
  const [discordId, setDiscordId] = useState(profile?.discord_id ?? '');
  const [busy, setBusy] = useState(false);
  const [showDiscordHelp, setShowDiscordHelp] = useState(false);

  // 🆕 Toggle "Maintenir la connexion" (persisté dans localStorage)
  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    return localStorage.getItem('rememberMe') !== 'false';
  });

  useEscapeKey(() => { }, true);
  useModalScrollLock(true);

  const needProfile = user && (!profile?.discord_id?.trim() || !profile?.pseudo?.trim());

  // ─── CONNEXION ───────────────────────────────────────────────────────────────
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

    // 🆕 Gestion "Maintenir la connexion"
    localStorage.setItem('rememberMe', String(rememberMe));
    if (!rememberMe) {
      // Marque la session comme active dans sessionStorage uniquement
      // → si l'onglet/navigateur se ferme, le flag disparaît et authContext forcera un signOut
      sessionStorage.setItem('sessionActive', '1');
    } else {
      sessionStorage.removeItem('sessionActive');
    }

    showToast('Connexion réussie', 'success');
  };

  // ─── INSCRIPTION (1 SEULE ÉTAPE) ─────────────────────────────────────────────
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
      // 🆕 Création du compte avec métadonnées intégrées
      const { error } = await signUp(email.trim(), password, { pseudo: p, discord_id: d });
      if (error) {
        showToast(error.message || "Erreur d'inscription", 'error');
        return;
      }
      showToast('Compte créé avec succès !', 'success');
      // Le profil est créé directement via signUp — pas besoin d'une 2e étape
    } finally {
      setBusy(false);
    }
  };

  // ─── COMPLÉTION PROFIL (utilisateur connecté sans profil complet) ─────────────
  const handleProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = (pseudo || '').trim();
    const d = (discordId || '').trim();
    if (!p) { showToast('Le pseudo est obligatoire', 'error'); return; }
    if (!d) { showToast("L'ID Discord est obligatoire", 'error'); return; }
    setBusy(true);
    const { error } = await updateProfile({ pseudo: p, discord_id: d });
    setBusy(false);
    if (error) { showToast(error.message || 'Erreur de mise à jour', 'error'); return; }
    showToast('Profil enregistré', 'success');
  };

  // ─── MOT DE PASSE OUBLIÉ ─────────────────────────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      showToast('Veuillez saisir votre adresse email', 'error');
      return;
    }
    setBusy(true);
    try {
      const sb = getSupabase();
      if (!sb) { showToast('Supabase non configuré', 'error'); return; }
      const apiBase = localStorage.getItem('apiBase') || localStorage.getItem('apiUrl') || 'http://138.2.182.125:8080';
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${apiBase}/reset-password`
      });
      if (error) { showToast(error.message || "Erreur lors de l'envoi", 'error'); return; }
      showToast('Email de réinitialisation envoyé ! Consultez votre boîte mail.', 'success');
      setMode('signin');
      setEmail('');
    } catch (error: any) {
      showToast(error.message || 'Erreur inconnue', 'error');
    } finally {
      setBusy(false);
    }
  };

  // ─── Style partagé pour les inputs ───────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.05)',
    color: 'var(--text)',
    boxSizing: 'border-box'
  };

  const fieldStyle: React.CSSProperties = { marginBottom: 14 };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6 };

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
        <div style={{ color: 'var(--text)', fontSize: 18 }}>Chargement…</div>
      </div>
    );
  }

  if (!needProfile && user && profile?.discord_id?.trim()) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 20, boxSizing: 'border-box' }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, maxWidth: 440, width: '100%', boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
        <h2 style={{ margin: '0 0 20px', fontSize: 20 }}>
          {needProfile || mode === 'profile'
            ? '👤 Compléter mon profil'
            : mode === 'forgot'
              ? '🔑 Mot de passe oublié'
              : mode === 'signup'
                ? '📝 Créer un compte'
                : '🔐 Connexion'}
        </h2>

        {/* ── MOT DE PASSE OUBLIÉ ─────────────────────────────────────────── */}
        {mode === 'forgot' ? (
          <form onSubmit={handleForgotPassword}>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>
              Saisissez votre adresse email. Vous recevrez un lien pour réinitialiser votre mot de passe.
            </p>
            <div style={fieldStyle}>
              <label style={labelStyle}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" required style={inputStyle} />
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

          /* ── COMPLÉTION PROFIL (connecté sans profil) ──────────────────────── */
        ) : needProfile || mode === 'profile' ? (
          <form onSubmit={handleProfile}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Pseudo *</label>
              <input type="text" value={pseudo} onChange={e => setPseudo(e.target.value)} placeholder="Votre pseudo" required style={inputStyle} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>
                ID Discord *{' '}
                <span style={{ fontWeight: 400, color: 'var(--accent)', cursor: 'pointer' }} onClick={() => setShowDiscordHelp(!showDiscordHelp)}>
                  Comment le trouver ?
                </span>
              </label>
              {showDiscordHelp && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, padding: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 8, whiteSpace: 'pre-line' }}>
                  {DISCORD_ID_HELP}
                </div>
              )}
              <input type="text" value={discordId} onChange={e => setDiscordId(e.target.value)} placeholder="Ex. 394893413843206155" required style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button type="submit" disabled={busy} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>

          /* ── CONNEXION ─────────────────────────────────────────────────────── */
        ) : mode === 'signin' ? (
          <>
            <form onSubmit={handleSignIn}>
              {/* Ligne 1 : Email */}
              <div style={fieldStyle}>
                <label style={labelStyle}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" required style={inputStyle} />
              </div>

              {/* Ligne 2 : Mot de passe */}
              <div style={fieldStyle}>
                <label style={labelStyle}>Mot de passe</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required style={inputStyle} />
              </div>

              {/* Ligne 3 : Toggle "Rester connecté" à gauche + bouton Connexion à droite */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <Toggle
                  checked={rememberMe}
                  onChange={() => setRememberMe(v => !v)}
                  label="Rester connecté"
                />
                <button type="submit" disabled={busy} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 600, flexShrink: 0 }}>
                  {busy ? 'Chargement…' : 'Connexion'}
                </button>
              </div>

              {/* Tooltip discret si session non persistante */}
              {!rememberMe && (
                <p style={{ margin: '-10px 0 12px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
                  La session sera effacée à la fermeture du navigateur.
                </p>
              )}
            </form>

            {/* Ligne 4 : Créer un compte */}
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)' }}>
              Pas encore de compte ?{' '}
              <button type="button" onClick={() => setMode('signup')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>
                Créer un compte
              </button>
            </p>

            {/* Ligne 5 : Séparateur */}
            <div style={{ borderTop: '1px solid var(--border)', marginBottom: 14 }} />

            {/* Ligne 6 : Mot de passe oublié centré */}
            <div style={{ textAlign: 'center' }}>
              <button type="button" onClick={() => setMode('forgot')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>
                Mot de passe oublié ?
              </button>
            </div>
          </>

          /* ── INSCRIPTION (1 ÉTAPE) ─────────────────────────────────────────── */
        ) : (
          <>
            <form onSubmit={handleSignUp}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Email *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" required style={inputStyle} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Mot de passe * <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(min. 6 caractères)</span></label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required style={inputStyle} />
              </div>

              {/* Séparateur visuel */}
              <div style={{ margin: '16px 0', borderTop: '1px solid var(--border)', position: 'relative' }}>
                <span style={{ position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)', background: 'var(--panel)', padding: '0 10px', fontSize: 11, color: 'var(--muted)' }}>
                  Informations du profil
                </span>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>Pseudo *</label>
                <input type="text" value={pseudo} onChange={e => setPseudo(e.target.value)} placeholder="Votre pseudo" required style={inputStyle} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>
                  ID Discord *{' '}
                  <span style={{ fontWeight: 400, color: 'var(--accent)', cursor: 'pointer' }} onClick={() => setShowDiscordHelp(!showDiscordHelp)}>
                    Comment le trouver ?
                  </span>
                </label>
                {showDiscordHelp && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, padding: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 8, whiteSpace: 'pre-line' }}>
                    {DISCORD_ID_HELP}
                  </div>
                )}
                <input type="text" value={discordId} onChange={e => setDiscordId(e.target.value)} placeholder="Ex. 394893413843206155" required style={inputStyle} />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="submit" disabled={busy} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                  {busy ? 'Création…' : 'Créer mon compte'}
                </button>
              </div>
            </form>
            <p style={{ marginTop: 16, fontSize: 13, color: 'var(--muted)' }}>
              Déjà un compte ?{' '}
              <button type="button" onClick={() => setMode('signin')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>
                Se connecter
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
