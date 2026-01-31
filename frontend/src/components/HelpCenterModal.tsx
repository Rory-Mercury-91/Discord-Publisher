import { useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { tauriAPI } from '../lib/tauri-api';
// Script Tampermonkey intégré au build (copie de Tampermonkey/DiscordPublisherDataExtractor.js)
import scriptTampermonkeyRaw from '../assets/DiscordPublisherDataExtractor.js?raw';

interface HelpCenterModalProps {
  onClose?: () => void;
}

type HelpSection = 'formulaire' | 'tags' | 'templates' | 'instructions' | 'history' | 'stats' | 'config' | 'shortcuts';

export default function HelpCenterModal({ onClose }: HelpCenterModalProps) {
  useEscapeKey(() => onClose?.(), true);
  useModalScrollLock();

  const [activeSection, setActiveSection] = useState<HelpSection>('formulaire');

  const sections = [
    { id: 'formulaire', icon: '📝', label: 'Formulaire' },
    { id: 'tags', icon: '🏷️', label: 'Tags' },
    { id: 'templates', icon: '📄', label: 'Templates' },
    { id: 'instructions', icon: '📋', label: 'Instructions' },
    { id: 'history', icon: '🕒', label: 'Historique' },
    { id: 'stats', icon: '📊', label: 'Statistiques' },
    { id: 'config', icon: '⚙️', label: 'Configuration' },
    { id: 'shortcuts', icon: '⌨️', label: 'Raccourcis' }
  ];

  return (
    <div className="modal">
      <div className="panel" onClick={e => e.stopPropagation()} style={{
        maxWidth: 1200,
        width: '95%',
        height: '85vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        paddingBottom: 80 // espace pour le footer
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: 16,
          borderBottom: '2px solid var(--border)'
        }}>
          <h3 style={{ margin: 0 }}>❓ Centre d'aide</h3>
          <button onClick={onClose} style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text)',
            fontSize: 24,
            cursor: 'pointer',
            padding: '0 8px',
            lineHeight: 1
          }}>
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '200px 1fr',
          gap: 20,
          flex: 1,
          minHeight: 0,
          marginTop: 16
        }}>
          {/* Navigation */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            borderRight: '1px solid var(--border)',
            paddingRight: 12
          }}>
            {sections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id as HelpSection)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  background: activeSection === section.id ? 'var(--accent)' : 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  color: activeSection === section.id ? 'white' : 'var(--text)',
                  fontSize: 14,
                  fontWeight: activeSection === section.id ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'left'
                }}
              >
                <span style={{ fontSize: 18 }}>{section.icon}</span>
                <span>{section.label}</span>
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div style={{
            overflowY: 'auto',
            paddingRight: 8
          }} className="styled-scrollbar">
            {activeSection === 'formulaire' && <FormulaireHelp />}
            {activeSection === 'tags' && <TagsHelp />}
            {activeSection === 'templates' && <TemplatesHelp />}
            {activeSection === 'instructions' && <InstructionsHelp />}
            {activeSection === 'history' && <HistoryHelp />}
            {activeSection === 'stats' && <StatsHelp />}
            {activeSection === 'config' && <ConfigHelp />}
            {activeSection === 'shortcuts' && <ShortcutsHelp />}
          </div>
        </div>
        {/* Footer avec bouton Fermer */}
        <div style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: '100%',
          background: 'var(--panel)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '16px 32px',
          zIndex: 10
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 24px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'opacity 0.2s'
            }}
            onMouseOver={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseOut={e => (e.currentTarget.style.opacity = '1')}
          >
            Fermer le centre d'aide
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Section installation script Tampermonkey (intégré au build)
// ============================================
function TampermonkeyInstallSection() {
  const [showGuide, setShowGuide] = useState(false);

  const handleDownloadScript = () => {
    const blob = new Blob([scriptTampermonkeyRaw], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'DiscordPublisherDataExtractor.user.js';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setShowGuide(v => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          background: 'var(--accent)',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'opacity 0.2s'
        }}
        onMouseOver={e => (e.currentTarget.style.opacity = '0.9')}
        onMouseOut={e => (e.currentTarget.style.opacity = '1')}
      >
        {showGuide ? '▼' : '▶'} Installer le script Tampermonkey
      </button>
      {showGuide && (
        <div style={{
          marginTop: 12,
          padding: 16,
          background: 'rgba(0,0,0,0.15)',
          borderRadius: 8,
          fontSize: 13,
          lineHeight: 1.7,
          color: 'var(--text)'
        }}>
          <p style={{ margin: '0 0 12px 0', fontWeight: 600 }}>Guide d'installation :</p>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li style={{ marginBottom: 8 }}>
              <strong>Installer Tampermonkey</strong> dans votre navigateur :
              {' '}
              <button
                type="button"
                onClick={() => tauriAPI.openUrl('https://www.tampermonkey.net/')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--accent)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontSize: 'inherit',
                  fontFamily: 'inherit'
                }}
              >
                tampermonkey.net
              </button>
              {' '}(Chrome, Firefox, Edge, etc.).
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Télécharger le script</strong> : cliquez sur le bouton ci-dessous pour enregistrer <code style={{ fontFamily: 'monospace', fontSize: 11 }}>DiscordPublisherDataExtractor.user.js</code> dans votre dossier Téléchargements.
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={handleDownloadScript}
                  style={{
                    padding: '8px 14px',
                    background: '#4ade80',
                    color: '#0f172a',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  📥 Télécharger le script
                </button>
              </div>
            </li>
            <li>
              <strong>Dans Tampermonkey</strong> : ouvrez le tableau de bord Tampermonkey → « Créer un nouveau script » → supprimez le contenu par défaut et collez le contenu du fichier téléchargé → enregistrez (Ctrl+S). Le script sera actif sur F95/Lewd ; utilisez le bouton « 📋 Copier données » sur une page thread pour copier le JSON dans le presse-papier, puis dans l'app cliquez sur « 📥 Importer Data ».
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}

// ============================================
// AIDE FORMULAIRE (vue d'ensemble, remplir le post)
// ============================================
function FormulaireHelp() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--accent)' }}>
          📝 Remplir le formulaire de publication
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          L'éditeur de contenu permet de préparer un post Discord (traduction, annonce) avant de le publier. Le contenu affiché dépend des informations saisies dans le template (modifiable depuis la modale « Gestion des templates ») : seuls les champs utilisés par ce template sont actifs ; les autres restent désactivés.
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 158, 255, 0.08)',
        border: '1px solid rgba(74, 158, 255, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4a9eff' }}>
          Ordre recommandé
        </h4>
        <ol style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>Titre du post</strong> : généré automatiquement à partir des champs « Nom du jeu » et « Version du jeu ». Champ en lecture seule.</li>
          <li><strong>Tags</strong> : cliquer sur « ➕ Ajouter » pour associer des étiquettes Discord à la publication (voir section Tags).</li>
          <li><strong>Variables du template</strong> : nom du jeu, version du jeu, version traduite, lien du jeu (F95/Lewd/Autre), synopsis (Overview), instructions d'installation, image principale, liens mod/traduction additionnels si le template les inclut.</li>
          <li><strong>Synopsis</strong> : décrire le jeu (résumé). Remplacera la variable <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[Overview]</code> dans le template par votre résumé.</li>
          <li><strong>Instructions d'installation</strong> : saisir du texte ou choisir une instruction enregistrée (voir section Instructions).</li>
          <li><strong>Image</strong> : ajouter une image à votre publication à l'aide d'un lien URL (généralement : clic droit sur l'image → « Copier le lien de l'image ») puis en cliquant sur « Ajouter ».</li>
          <li><strong>Aperçu</strong> : la colonne de droite affiche le rendu du message tel qu’il est écrit avant publication ; en cliquant sur « Aperçu Discord », vous verrez le rendu final.</li>
          <li><strong>Publier</strong> : une fois tout renseigné, cliquer sur « Publier sur Discord » pour envoyer le post (ou « Mettre à jour » en mode édition).</li>
        </ol>
      </section>

      <section style={{
        background: 'rgba(74, 222, 128, 0.08)',
        border: '1px solid rgba(74, 222, 128, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4ade80' }}>
          📥 Importer Data
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Si vous utilisez le script Tampermonkey <code style={{ fontFamily: 'monospace', fontSize: 12 }}>DiscordPublisherDataExtractor.js</code>, vous pouvez coller un JSON depuis le presse-papier : l'app remplit automatiquement le nom du jeu, la version et le lien du jeu. Cherchez le bouton d'import <strong>📥 Importer Data</strong> en bas à gauche du formulaire.
        </p>
        <TampermonkeyInstallSection />
      </section>

      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: 'var(--accent)' }}>
          ✏️ Mode édition
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Depuis l'historique, vous pouvez charger un post en mode édition. Les champs sont préremplis (certains peuvent manquer — contrôlez avant publication) ; modifiez ce que vous souhaitez puis cliquez sur « ✏️ Mettre à jour le post » pour mettre à jour le thread Discord et l'historique.
        </p>
      </section>
    </div>
  );
}

// ============================================
// AIDE TAGS — Utilisation dans le formulaire uniquement
// ============================================
function TagsHelp() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section style={{
        background: 'rgba(139, 92, 246, 0.1)',
        border: '1px solid rgba(139, 92, 246, 0.3)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: '#8b5cf6' }}>
          🏷️ Ajouter des tags dans le formulaire
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 16px 0' }}>
          Dans l'éditeur de contenu, le champ <strong>Tags</strong> permet d'associer des étiquettes à votre publication. Voici comment les utiliser :
        </p>

        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
              1. Ouvrir le sélecteur
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)', margin: 0 }}>
              Cliquez sur le bouton <strong>➕ Ajouter</strong> dans le champ Tags pour ouvrir la modale de sélection.
            </p>
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
              2. Choisir un tag
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)', margin: 0 }}>
              Dans la modale, cliquez sur un tag (générique ou traducteur) pour l'ajouter à la publication. Il apparaît alors sous forme de badge dans le formulaire.
            </p>
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
              3. Retirer un tag
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)', margin: 0 }}>
              Cliquez sur le <strong>✕</strong> d'un badge pour le retirer de la publication. Vous pouvez rouvrir la modale pour en ajouter d'autres.
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, marginBottom: 0 }}>Exemple de badge :</p>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px',
                borderRadius: 999,
                background: 'rgba(99, 102, 241, 0.14)',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                fontSize: 13,
                lineHeight: 1.2,
                fontWeight: 600,
                marginTop: 6
              }}
            >
              <span style={{ color: 'var(--text)' }}>Rory Mercury 91</span>
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>✕</span>
            </div>
          </div>

          <div style={{
            padding: 12,
            background: 'rgba(74, 158, 255, 0.08)',
            border: '1px solid rgba(74, 158, 255, 0.25)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--muted)'
          }}>
            💡 Fermeture : <strong>Échap</strong>, bouton Fermer ou clic en dehors de la modale.
          </div>
        </div>
      </section>
    </div>
  );
}

// ============================================
// AIDE STATISTIQUES
// ============================================
function StatsHelp() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--accent)' }}>
          📈 À quoi servent les statistiques ?
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          La fenêtre Statistiques affiche des indicateurs basés sur vos publications enregistrées dans l'historique : nombre total de publications, répartition par traducteurs, et répartition par mois. Les données proviennent des posts présents dans l'app (Supabase + historique local).
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 158, 255, 0.08)',
        border: '1px solid rgba(74, 158, 255, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4a9eff' }}>
          📅 Filtre par période
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Vous pouvez restreindre les statistiques à une période donnée :
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>Toutes les périodes</strong> : toutes les publications de l'historique.</li>
          <li><strong>7 derniers jours</strong> : publications des 7 derniers jours.</li>
          <li><strong>30 derniers jours</strong> : publications du dernier mois.</li>
          <li><strong>6 derniers mois</strong> : publications des 6 derniers mois.</li>
        </ul>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Le total, le classement des traducteurs et les publications par mois sont recalculés en fonction de la période choisie.
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 222, 128, 0.08)',
        border: '1px solid rgba(74, 222, 128, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4ade80' }}>
          👤 Répartition par traducteur
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Cette section affiche tous les traducteurs selon le nombre de publications auxquelles ils sont associés. Seuls les <strong>tags marqués comme « Tag traducteur »</strong> (dans la gestion des tags) sont pris en compte. Si aucun tag traducteur n'est défini ou utilisé dans les posts, cette section affiche « Aucune donnée ».
        </p>
      </section>

      <section style={{
        background: 'rgba(139, 92, 246, 0.08)',
        border: '1px solid rgba(139, 92, 246, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#8b5cf6' }}>
          📆 Publications par mois
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Un graphique en barres montre le nombre de publications par mois (sur la période filtrée). Chaque barre correspond à un mois (ex. « janv. 2026 ») et sa hauteur est proportionnelle au nombre de publications. Utile pour visualiser l'activité dans le temps.
        </p>
      </section>
    </div>
  );
}

// ============================================
// AIDE HISTORIQUE
// ============================================
function HistoryHelp() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--accent)' }}>
          📋 À quoi sert l'historique ?
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          L'historique des publications liste toutes les traductions publiées (ou mises à jour) depuis l'app. Chaque entrée affiche le titre, la date, l'auteur et permet d'éditer le post sur Discord, d'ouvrir le thread, ou de supprimer définitivement la publication.
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 158, 255, 0.08)',
        border: '1px solid rgba(74, 158, 255, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4a9eff' }}>
          📂 D'où viennent les données ?
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Les publications sont enregistrées dans la base Supabase (<strong>published_posts</strong>) et, à l'ouverture de l'historique, l'app peut fusionner les posts venant de l'API Koyeb (<strong>/api/history</strong>) pour inclure les publications faites depuis un autre appareil. L'historique affiché est donc la réunion de vos données locales/Supabase et de celles du serveur de publication.
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          À chaque publication ou mise à jour depuis l'éditeur, l'entrée est ajoutée ou mise à jour dans l'historique et synchronisée avec Supabase.
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 222, 128, 0.08)',
        border: '1px solid rgba(74, 222, 128, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4ade80' }}>
          🔍 Recherche, tri et filtres
        </h4>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>Recherche</strong> : le champ texte filtre les posts par titre, contenu ou tags.</li>
          <li><strong>Tri</strong> : par date (plus récent en premier ou plus ancien en premier).</li>
          <li><strong>Filtre par auteur</strong> : afficher uniquement « Mes publications » ou les publications d'un utilisateur précis (si vous avez les droits).</li>
          <li><strong>Réinitialiser</strong> : remet recherche, tri et filtre à zéro.</li>
        </ul>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Les résultats sont paginés (15 publications par page).
        </p>
      </section>

      <section style={{
        background: 'rgba(139, 92, 246, 0.08)',
        border: '1px solid rgba(139, 92, 246, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#8b5cf6' }}>
          ✏️ Éditer un post
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Le bouton <strong>Éditer</strong> n'apparaît que si vous avez le droit de modifier ce post :
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li>Vous êtes l'auteur de la publication (votre Discord est enregistré comme auteur),</li>
          <li>Vous êtes master admin, ou</li>
          <li>L'auteur vous a autorisé dans Configuration → « Qui peut modifier mes posts ».</li>
        </ul>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Cliquer sur Éditer charge le post dans l'éditeur de contenu en mode édition ; vous pouvez modifier puis republier pour mettre à jour le thread Discord.
        </p>
      </section>

      <section style={{
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#ef4444' }}>
          🗑️ Supprimer définitivement
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          La suppression retire l'entrée de l'historique, la supprime de la base Supabase et, si un thread Discord est associé, supprime ce thread (et tout son contenu) sur Discord. Une confirmation est demandée avant d'agir.
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Si le post n'a pas de thread Discord (ancienne donnée ou erreur), seule l'entrée en base et dans l'historique est supprimée. Cette action est irréversible.
        </p>
      </section>

    </div>
  );
}

// ============================================
// AIDE INSTRUCTIONS
// ============================================
function InstructionsHelp() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--accent)' }}>
          📋 À quoi servent les instructions ?
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Les instructions sont des blocs de texte nommés (ex. « Installation Windows », « Guide Linux ») utilisés dans vos publications. Le template contient la variable <strong>[instruction]</strong> : au moment de la publication, elle est remplacée par le contenu de l'instruction que vous avez choisie ou saisie dans le formulaire.
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 158, 255, 0.08)',
        border: '1px solid rgba(74, 158, 255, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4a9eff' }}>
          💾 Sauvegarde locale
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Dans la fenêtre <strong>Gestion des instructions</strong> (bouton 📋 dans l'éditeur) :
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>Ajouter</strong> : remplissez le nom et le contenu, puis cliquez sur « ➕ Ajouter ». L'instruction est enregistrée localement dans l'app.</li>
          <li><strong>Modifier</strong> : cliquez sur ✏️ sur une instruction, modifiez le contenu et validez avec « ✅ Enregistrer ».</li>
          <li><strong>Supprimer</strong> : cliquez sur 🗑️ ; une confirmation est demandée. La suppression est définitive.</li>
        </ul>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Ces actions ne touchent que votre copie locale. Pour les conserver ou les partager via la base, utilisez la synchronisation (voir ci-dessous).
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 222, 128, 0.08)',
        border: '1px solid rgba(74, 222, 128, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4ade80' }}>
          🔄 Synchronisation automatique (Supabase)
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Les <strong>instructions sont synchronisées automatiquement</strong> avec la base de données Supabase à chaque modification. Vous n&apos;avez rien à faire !
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>✅ Création/modification</strong> : vos instructions sont envoyées automatiquement vers la base.</li>
          <li><strong>✅ Partage</strong> : si un utilisateur vous ajoute dans « Qui peut modifier mes posts » (Configuration), ses instructions apparaissent automatiquement dans votre app.</li>
          <li><strong>✅ Révocation</strong> : si votre accès est révoqué, les instructions partagées sont supprimées automatiquement de votre appareil.</li>
          <li><strong>🔃 Forcer sync / 📥 Recharger</strong> : boutons de secours dans Configuration si besoin de resynchroniser manuellement.</li>
        </ul>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          <strong>Note :</strong> vous ne pouvez modifier que vos propres instructions sur la base. Les instructions reçues d&apos;autres utilisateurs sont en lecture seule.
        </p>
      </section>

      <section style={{
        background: 'rgba(139, 92, 246, 0.08)',
        border: '1px solid rgba(139, 92, 246, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#8b5cf6' }}>
          🎯 Utiliser une instruction dans le formulaire
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Dans l'éditeur de contenu, le champ <strong>Instruction</strong> (visible si le template utilise <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[instruction]</code>) permet de :
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>Sélectionner</strong> une instruction enregistrée dans la liste déroulante (recherche possible). Le contenu est inséré dans le champ.</li>
          <li><strong>Saisir ou modifier</strong> le texte directement dans la zone de texte.</li>
        </ul>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          Lors de la publication, le bloc <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[instruction]</code> du template est remplacé par ce contenu (formaté en liste numérotée dans le message Discord).
        </p>
      </section>
    </div>
  );
}

// ============================================
// AIDE RACCOURCIS CLAVIER
// ============================================
function ShortcutsHelp() {
  const shortcuts = [
    {
      category: 'Navigation',
      items: [
        { keys: 'Ctrl + H', description: 'Ouvrir l\'historique des publications' },
        { keys: 'Ctrl + T', description: 'Basculer entre thème clair/sombre' },
      ]
    },
    {
      category: 'Édition',
      items: [
        { keys: 'Ctrl + Z', description: 'Annuler (Undo) dans les champs de saisie (natif)' },
        { keys: 'Ctrl + Y', description: 'Refaire (Redo) dans les champs de saisie (natif)' },
        { keys: 'Ctrl + S', description: 'Sauvegarder le template (modale Templates)' },
      ]
    },
    {
      category: 'Interface',
      items: [
        { keys: 'Échap', description: 'Fermer la modale active' },
      ]
    }
  ];

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--accent)' }}>
          ⌨️ Raccourcis clavier
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Utilisez ces raccourcis pour naviguer plus rapidement dans l'application.
        </p>
      </section>

      {shortcuts.map((section, idx) => (
        <section key={idx}>
          <h5 style={{
            margin: '0 0 12px 0',
            fontSize: 15,
            color: '#4a9eff',
            borderBottom: '1px solid var(--border)',
            paddingBottom: 8
          }}>
            {section.category}
          </h5>
          <div style={{ display: 'grid', gap: 8 }}>
            {section.items.map((item, itemIdx) => (
              <div
                key={itemIdx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '150px 1fr',
                  gap: 16,
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 6
                }}
              >
                <kbd style={{
                  display: 'inline-block',
                  padding: '6px 10px',
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  fontSize: 13,
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}>
                  {item.keys}
                </kbd>
                <span style={{ fontSize: 14, color: 'var(--text)' }}>
                  {item.description}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div style={{
        padding: 12,
        background: 'rgba(74, 158, 255, 0.1)',
        border: '1px solid rgba(74, 158, 255, 0.3)',
        borderRadius: 6,
        fontSize: 13,
        color: 'var(--text)'
      }}>
        💡 <strong>Astuce :</strong> D'autres raccourcis seront ajoutés au fur et à mesure
        des mises à jour de l'application.
      </div>
    </div>
  );
}

// ============================================
// AIDE TEMPLATES
// ============================================
function TemplatesHelp() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--accent)' }}>
          📄 À quoi servent les templates ?
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Les templates définissent la structure du message Discord (titre, corps, mise en forme). Ils contiennent des <strong>variables</strong> entre crochets (ex. <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[Game_name]</code>, <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[instruction]</code>, <code style={{ fontFamily: 'monospace', fontSize: 12 }}>[Overview]</code>) qui sont remplacées par les valeurs du formulaire au moment de la publication.
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 222, 128, 0.08)',
        border: '1px solid rgba(74, 222, 128, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4ade80' }}>
          Gérer le template
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          La fenêtre <strong>Gestion du template</strong> (bouton « Gérer le Template ») permet de modifier le template, ou de restaurer le Template par défaut. Les templates peuvent être partagés via la base : dans Configuration, utilisez « Envoyer » / « Récupérer » pour les templates afin de les synchroniser avec Supabase ou bien en exportant ou important un Template d'un autre utilisateur.
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Les variables disponibles (ex. <code style={{ fontFamily: 'monospace', fontSize: 11 }}>[Game_name]</code>, <code style={{ fontFamily: 'monospace', fontSize: 11 }}>[Game_version]</code>, <code style={{ fontFamily: 'monospace', fontSize: 11 }}>[instruction]</code>, <code style={{ fontFamily: 'monospace', fontSize: 11 }}>[Overview]</code>) sont documentées dans la modale Templates ou dans le Markdown d'aide du champ contenu.
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 158, 255, 0.08)',
        border: '1px solid rgba(74, 158, 255, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4a9eff' }}>
          👁️ Zone Aperçu
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          La zone d'aperçu (à droite) affiche le <strong>résultat final</strong> du template avec toutes les variables remplies. Cette zone est en <strong>lecture seule</strong> et montre exactement ce qui sera publié sur Discord. Utilisez le bouton <strong>🎨 Aperçu Discord</strong> pour voir le rendu avec la mise en forme Markdown.
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 8px 0' }}>
          Pour personnaliser le contenu, modifiez les <strong>variables du formulaire</strong> ou le <strong>template</strong> via la Gestion des templates.
        </p>
      </section>
    </div>
  );
}

// ============================================
// AIDE CONFIGURATION
// ============================================
function ConfigHelp() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--accent)' }}>
          ⚙️ À quoi sert la configuration ?
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          La configuration regroupe les paramètres de l'API (URL Koyeb, clé API), l'état de la fenêtre au démarrage, les droits d'édition (qui peut modifier vos posts), et la synchronisation des données (tags, instructions, templates) avec la base Supabase. En mode admin, l'export/import complet et le nettoyage des données sont également disponibles.
        </p>
      </section>

      <section style={{
        background: 'rgba(74, 158, 255, 0.08)',
        border: '1px solid rgba(74, 158, 255, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4a9eff' }}>
          🌐 API et fenêtre
        </h4>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>URL de l'API Koyeb</strong> : URL de base de votre service (ex. https://votre-app.koyeb.app), sans /api.</li>
          <li><strong>Clé API</strong> : clé secrète pour l'accès à l'API de publication.</li>
          <li><strong>État de la fenêtre au démarrage</strong> : Normal, Maximisé, Plein écran ou Minimisé (application Tauri). Enregistré avec le bouton « Enregistrer ».</li>
        </ul>
      </section>

      <section style={{
        background: 'rgba(74, 222, 128, 0.08)',
        border: '1px solid rgba(74, 222, 128, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#4ade80' }}>
          👥 Qui peut modifier mes posts
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          Vous pouvez autoriser ou révoquer le droit d'édition de vos publications pour d'autres utilisateurs (identifiés par leur profil Supabase). Les utilisateurs autorisés pourront éditer vos posts depuis l'historique et verront automatiquement vos instructions (synchronisation temps réel).
        </p>
      </section>

      <section style={{
        background: 'rgba(139, 92, 246, 0.08)',
        border: '1px solid rgba(139, 92, 246, 0.25)',
        borderRadius: 8,
        padding: 16
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#8b5cf6' }}>
          🔄 Synchronisation avec la base
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Comportement de synchronisation selon le type de données :
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, paddingLeft: 20 }}>
          <li><strong>📝 Instructions</strong> : synchronisation <strong>automatique</strong> à chaque modification (aucune action requise).</li>
          <li><strong>🏷️ Tags / 📋 Templates</strong> : utilisez les boutons <strong>📤 Envoyer</strong> / <strong>📥 Récupérer</strong> dans Configuration.</li>
        </ul>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0 0' }}>
          À l'ouverture de l'app, toutes les données sont chargées automatiquement depuis la base si vous êtes connecté.
        </p>
      </section>

      <section>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, color: 'var(--accent)' }}>
          🔐 Mode admin
        </h4>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
          En débloquant le mode admin (via le code Master Admin dans la fenêtre d'accès à la configuration), vous accédez à l'<strong>export</strong> et l'<strong>import</strong> complets (sauvegarde JSON de toutes les données) et au <strong>nettoyage complet des données</strong> (suppression des publications, tags, config, etc. sur Supabase). Utilisez ces options avec précaution.
        </p>
      </section>
    </div>
  );
}
