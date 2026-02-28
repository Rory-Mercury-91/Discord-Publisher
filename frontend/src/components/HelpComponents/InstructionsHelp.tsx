// frontend\src\components\HelpComponents\InstructionsHelp.tsx
import { useEffect, useState } from 'react';

const STORAGE_KEY_MASTER_ADMIN = 'discord-publisher:master-admin-code';

export default function InstructionsHelp() {
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
    <div style={{ display: 'grid', gap: 24 }}>

      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--accent)' }}>
          📋 À quoi servent les instructions ?
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Les instructions sont des blocs de texte nommés utilisés dans vos publications. Le template contient la variable <strong>[instruction]</strong> : au moment de la publication, elle est remplacée par le contenu de l'instruction que vous avez choisie ou saisie dans le formulaire.
        </p>
      </section>

      <section className="help-section help-section--info">
        <h4 className="help-section__title">
          📋 Gestion des instructions
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Dans la modale <strong>Gestion des instructions</strong> (bouton 📋 dans l'éditeur) :
        </p>
        {masterAdmin ? (
          <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
            <li><strong>Afficher les instructions de</strong> : par défaut « Moi ». Vous pouvez filtrer par un autre profil ou par un <strong>traducteur externe</strong>. Cela permet de voir et gérer les instructions attribuées à chaque personne.</li>
            <li><strong>Ajouter / Modifier</strong> : renseignez le nom, le contenu et <strong>Appartient à</strong>. Vous pouvez attribuer l'instruction à votre profil (« Moi »), à un autre profil ou à un <strong>traducteur externe</strong>. Répartir les instructions entre profils et traducteurs externes évite que tout soit sous « Moi » et permet d'afficher la bonne liste dans l'éditeur selon « Publié pour ».</li>
            <li><strong>Supprimer</strong> : 🗑️ avec confirmation. Toutes les instructions sont synchronisées avec Supabase (profil et traducteurs externes).</li>
          </ul>
        ) : (
          <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
            <li><strong>Afficher les instructions de</strong> : par défaut « Moi ». Si un autre utilisateur vous a autorisé comme éditeur (« Qui peut modifier mes posts »), vous pouvez filtrer par son profil pour voir ses instructions.</li>
            <li><strong>Ajouter / Modifier</strong> : renseignez le nom, le contenu et <strong>Appartient à</strong>. Vous pouvez attribuer l'instruction à votre profil (« Moi ») ou, si vous êtes éditeur autorisé, au profil de la personne concernée.</li>
            <li><strong>Supprimer</strong> : 🗑️ avec confirmation. Toutes les instructions sont synchronisées avec Supabase.</li>
          </ul>
        )}
      </section>

      <section style={{
        background: 'rgba(74, 222, 128, 0.08)',
        border: '1px solid rgba(74, 222, 128, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4ade80' }}>
          🔄 Synchronisation et partage (Supabase)
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Toutes les instructions (attribuées à un profil ou à un traducteur externe) sont synchronisées avec Supabase. Les instructions d'autres profils que vous voyez grâce au partage (« Qui peut modifier mes posts ») restent en lecture seule sur la base si vous n'êtes pas éditeur autorisé.
        </p>
      </section>

      <section className="help-section help-section--info">
        <h4 className="help-section__title">
          🎯 Utiliser une instruction dans le formulaire
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Dans l'éditeur de contenu, le champ <strong>Instruction</strong> (visible si le template utilise <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[instruction]</code>) affiche une liste filtrée selon <strong>Publié pour</strong> : seules les instructions attribuées au traducteur sélectionné (votre profil, un autre profil ou un traducteur externe) sont proposées. En attribuant correctement les instructions en modale (Appartient à), la liste affichée correspond au bon traducteur au moment de la publication.
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Vous pouvez choisir une instruction dans la liste ou saisir le texte directement. Lors de la publication, <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[instruction]</code> est remplacé par ce contenu (formaté en liste numérotée dans le message Discord).
        </p>
      </section>
    </div>
  );
}
