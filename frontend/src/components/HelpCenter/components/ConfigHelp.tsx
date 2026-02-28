// frontend\src\components\HelpCenter\components\ConfigHelp.tsx
import { useEffect, useState } from 'react';

const STORAGE_KEY_MASTER_ADMIN = 'discord-publisher:master-admin-code';

export default function ConfigHelp() {
  const [masterAdmin, setMasterAdmin] = useState(() => !!localStorage.getItem(STORAGE_KEY_MASTER_ADMIN));

  useEffect(() => {
    const sync = () => setMasterAdmin(!!localStorage.getItem(STORAGE_KEY_MASTER_ADMIN));
    window.addEventListener('masterAdminUnlocked', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('masterAdminUnlocked', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return (
    <div className="help-content-inner">
      <section className="help-intro">
        <h4 className="help-section__title">⚙️ À quoi sert la Configuration ?</h4>
        <p>
          La fenêtre Configuration regroupe tous les réglages de l'application en <strong>4 onglets</strong> : Préférences (clé API, fenêtre, labels, bibliothèque), Mon compte (droits d'édition, mot de passe, suppression du compte), Administration et Enrichissement (réservés aux Master Admin).
        </p>
      </section>

      <section className="help-section help-section--info">
        <h4 className="help-section__title">⚙️ Préférences</h4>
        <ul>
          <li><strong>🔑 Clé API</strong> : collez ici votre clé personnelle (obtenue avec <code>/generer-cle</code> sur le Discord).</li>
          <li><strong>🪟 État de la fenêtre au démarrage</strong> : état de l'application au lancement (Normal, Maximisé, Plein écran ou Minimisé).</li>
          <li><strong>🏷️ Labels par défaut</strong> : valeurs préservées pour « Traduction » et « Mod » lors de la réinitialisation du formulaire.</li>
          <li><strong>📚 Mode d'affichage Bibliothèque</strong> : Compact (toutes les infos visibles) ou Enrichi (bouton « Plus d'informations »).</li>
        </ul>
      </section>

      <section className="help-section help-section--success">
        <h4 className="help-section__title">👤 Mon compte</h4>
        <ul>
          <li><strong>👥 Qui peut modifier mes posts</strong> : gérez les droits d'édition des autres utilisateurs (vert = autorisé).</li>
          <li><strong>🔐 Sécurité du compte</strong> : changez votre mot de passe (ancien + nouveau + confirmation).</li>
          <li><strong>☠️ Zone de danger</strong> : suppression définitive du compte (profil, templates, instructions, autorisations). Les publications (posts) ne sont pas supprimées.</li>
        </ul>
      </section>

      {masterAdmin && (
        <>
          <section className="help-section help-section--warning">
            <h4 className="help-section__title">🛡️ Administration</h4>
            <ul>
              <li><strong>🌐 URL de l'API</strong> : modifiez l'adresse du serveur backend (propagée automatiquement à tous les utilisateurs).</li>
              <li><strong>💾 Sauvegarde et restauration</strong> : Exportez tout en JSON ou restaurez depuis un fichier.</li>
              <li><strong>🗑️ Tout supprimer</strong> : nettoyage complet et irréversible des données sur Supabase + local.</li>
            </ul>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '12px 0 0 0' }}>
              Le code Master Admin est requis pour accéder à cet onglet. Une fois validé, il reste actif pendant la session.
            </p>
          </section>

          <section className="help-section help-section--info">
            <h4 className="help-section__title">🤖 Enrichissement automatique</h4>
            <p>
              Lancez l'enrichissement massif des fiches jeux : récupération des synopsis anglais sur F95Zone, traduction automatique, et sauvegarde dans Supabase.
            </p>
            <ul>
              <li>Bouton « Lancer l'enrichissement » avec suivi en temps réel (progression + logs).</li>
              <li>Possibilité d'arrêter à tout moment.</li>
              <li>Idéal pour mettre à jour rapidement tous les jeux sans synopsis.</li>
            </ul>
          </section>
        </>
      )}

      <section className="help-section help-section--tip">
        <span>💡 <strong>Astuce :</strong> Tous les changements sont sauvegardés automatiquement. Vous pouvez fermer la fenêtre à tout moment sans perdre vos réglages.</span>
      </section>
    </div>
  );
}
