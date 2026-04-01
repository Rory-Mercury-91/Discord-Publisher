/**
 * Traduit les messages renvoyés par Supabase Auth (souvent en anglais) pour les toasts UI.
 */

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function translateSupabaseAuthError(raw: string): string {
  const n = norm(raw);

  if (
    n.includes('new password should be different') ||
    n.includes('different from the old password') ||
    n.includes('same as the old') ||
    n.includes('must be different from your old password')
  ) {
    return 'Le nouveau mot de passe doit être différent de l’actuel. Si c’était déjà le bon mot de passe, vous pouvez fermer cette fenêtre : votre compte est utilisable.';
  }

  if (n.includes('invalid login credentials') || n.includes('invalid credentials')) {
    return 'Email ou mot de passe incorrect';
  }

  if (n.includes('email not confirmed')) {
    return 'Email non confirmé. Vérifiez votre boîte mail.';
  }

  if (n.includes('user already registered') || n.includes('already been registered')) {
    return 'Un compte existe déjà avec cet email';
  }

  if (n.includes('password should be at least') || n.includes('at least 6 characters')) {
    return 'Le mot de passe doit contenir au moins 6 caractères';
  }

  if (n.includes('signup is disabled')) {
    return 'Les inscriptions sont désactivées';
  }

  if (n.includes('email rate limit') || n.includes('too many requests') || n.includes('rate limit')) {
    return 'Trop de tentatives. Réessayez dans quelques minutes.';
  }

  if (n.includes('network') || n.includes('fetch') || n.includes('failed to fetch')) {
    return 'Erreur réseau. Vérifiez votre connexion Internet.';
  }

  if (n.includes('jwt expired') || n.includes('session expired')) {
    return 'Session expirée. Reconnectez-vous.';
  }

  if (n.includes('invalid refresh token')) {
    return 'Session invalide. Reconnectez-vous.';
  }

  // Erreurs PostgREST / RLS (profil, etc.)
  if (n.includes('permission denied') || n.includes('row-level security')) {
    return 'Action non autorisée';
  }
  if (n.includes('duplicate key') || n.includes('unique constraint')) {
    return 'Cette valeur est déjà utilisée';
  }

  return raw.trim();
}
