import type { ConfirmOptions } from '../../hooks/useConfirm';

interface EditorHeaderProps {
  editingPostId: string | null;
  translatorOptions: Array<{ id: string; name: string; kind: 'profile' | 'external' }>;
  selectedTranslatorId: string;
  onTranslatorChange: (id: string) => void;
  onImportData: () => void;
  onResetForm: () => void;
  onExitEditMode: () => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Afficher le bouton Exporter (formulaire liste) — visible uniquement si List_manager */
  showExportListManager?: boolean;
  onExportListManager?: () => void;
}

export default function EditorHeader({
  editingPostId,
  translatorOptions,
  selectedTranslatorId,
  onTranslatorChange,
  onImportData,
  onResetForm,
  onExitEditMode,
  confirm,
  showExportListManager,
  onExportListManager,
}: EditorHeaderProps) {
  const handleExitEditMode = async () => {
    const ok = await confirm({
      title: 'Quitter le mode édition',
      message: 'Abandonner les modifications non enregistrées ? Le formulaire repassera en mode création.',
      confirmText: 'Quitter',
      cancelText: 'Rester',
      type: 'warning',
    });
    if (ok) onExitEditMode();
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: 'Vider le formulaire',
      message: 'Voulez-vous vraiment vider tous les champs ? Cette action est irréversible.',
      confirmText: 'Vider',
      cancelText: 'Annuler',
      type: 'danger'
    });

    if (ok) {
      onResetForm();
    }
  };
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      marginBottom: 16,
      gap: 10,
      flexWrap: 'nowrap',
      height: 32,
      minHeight: 32
    }}>
      <h4 style={{
        margin: 0,
        fontSize: 14,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
        lineHeight: '32px'
      }}>
        📝 Contenu du post Discord
        {editingPostId && (
          <>
            <span style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--accent)',
              background: 'rgba(125,211,252,0.15)',
              padding: '4px 10px',
              borderRadius: 6
            }}>
              ✏️ Mode modification
            </span>
            <button
              type="button"
              onClick={handleExitEditMode}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--muted)',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border)',
                padding: '4px 10px',
                borderRadius: 6,
                cursor: 'pointer',
              }}
              title="Abandonner les modifications et repasser en mode création"
            >
              ✕ Quitter l'édition
            </button>
          </>
        )}
      </h4>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* Bouton Exporter (formulaire liste) — visible uniquement si List_manager */}
        {showExportListManager && onExportListManager && (
          <button
            type="button"
            onClick={onExportListManager}
            style={{
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.3)',
              color: '#22c55e',
              padding: '0 12px',
              borderRadius: 6,
              height: 32,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexShrink: 0,
            }}
            title="Copier les données du formulaire au format attendu par « Insérer les données du jeu »"
          >
            📤 Exporter
          </button>
        )}
        {/* Bouton Importer Données */}
        <button
          type="button"
          onClick={onImportData}
          style={{
            background: 'rgba(99,102,241,0.1)',
            border: '1px solid rgba(99,102,241,0.3)',
            color: '#818cf8',
            padding: '0 12px',
            borderRadius: 6,
            height: 32,
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
          }}
        >
          📥 Importer Données
        </button>

        {/* Bouton Vider le formulaire */}
        <button
          type="button"
          onClick={handleReset}
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            color: '#ef4444',
            padding: '0 12px',
            borderRadius: 6,
            height: 32,
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
          }}
        >
          🗑️ Vider le formulaire
        </button>

        {/* Sélecteur de traducteur (visible seulement s'il y a plusieurs options) */}
        {translatorOptions.length > 1 && (
          <>
            <div style={{ width: 1, height: 22, background: 'var(--border)', flexShrink: 0 }} />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '0 10px',
              borderRadius: 8,
              height: 32,
              background: 'rgba(88,101,242,0.05)',
              border: '1px solid rgba(88,101,242,0.2)',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                👤 Publier pour :
              </span>
              <select
                value={selectedTranslatorId}
                onChange={(e) => onTranslatorChange(e.target.value)}
                style={{
                  height: 24,
                  padding: '0 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--text)',
                  fontSize: 12,
                  cursor: 'pointer',
                  minWidth: '140px'
                }}
              >
                {translatorOptions.map(opt => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
