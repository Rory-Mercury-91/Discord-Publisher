/**
 * Modale de gestion des labels personnalisés pour une entrée de collection (même logique que Nexus).
 */
import { useEffect, useState, useCallback } from 'react';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../../hooks/useModalScrollLock';
import type { CollectionLabel } from '../../../state/hooks/useCollection';

const PRESET_COLORS = [
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#ef4444',
  '#f97316',
  '#14b8a6',
];

interface CollectionLabelsModalProps {
  entryId: string;
  gameTitle: string;
  labels: CollectionLabel[];
  allLabels: CollectionLabel[];
  onUpdate: (entryId: string, labels: CollectionLabel[]) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
  onLabelsUpdated?: () => void;
}

export default function CollectionLabelsModal({
  entryId,
  gameTitle,
  labels,
  allLabels,
  onUpdate,
  onClose,
  onLabelsUpdated,
}: CollectionLabelsModalProps) {
  // Fermer sans appeler onLabelsUpdated pour éviter de déclencher un refresh qui fermerait la modale détail
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEscapeKey(
    () => (showColorPickerModal ? setShowColorPickerModal(false) : handleClose()),
    true
  );
  useModalScrollLock();

  const [currentLabels, setCurrentLabels] = useState<CollectionLabel[]>(labels);
  const [newLabelText, setNewLabelText] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(PRESET_COLORS[0]);
  const [selectedExisting, setSelectedExisting] = useState('');
  const [loading, setLoading] = useState(false);
  const [showColorPickerModal, setShowColorPickerModal] = useState(false);

  useEffect(() => {
    setCurrentLabels(labels);
  }, [labels]);

  const availableSuggestions = allLabels.filter(
    (l) => !currentLabels.some((c) => c.label.toLowerCase() === l.label.toLowerCase())
  );

  const handleAddNew = useCallback(async () => {
    const text = newLabelText.trim();
    if (!text || loading) return;
    const next = [...currentLabels, { label: text, color: newLabelColor }];
    setLoading(true);
    try {
      const res = await onUpdate(entryId, next);
      if (res.ok) {
        setCurrentLabels(next);
        setNewLabelText('');
        setNewLabelColor(PRESET_COLORS[0]);
        onLabelsUpdated?.();
      }
    } finally {
      setLoading(false);
    }
  }, [entryId, newLabelText, newLabelColor, currentLabels, onUpdate, loading, onLabelsUpdated]);

  const addExistingByLabel = useCallback(
    async (labelName: string) => {
      const item = availableSuggestions.find((l) => l.label === labelName);
      if (!item || loading) return;
      const next = [...currentLabels, item];
      setLoading(true);
      try {
        const res = await onUpdate(entryId, next);
        if (res.ok) {
          setCurrentLabels(next);
          setSelectedExisting('');
          onLabelsUpdated?.();
        }
      } finally {
        setLoading(false);
      }
    },
    [entryId, availableSuggestions, currentLabels, onUpdate, loading, onLabelsUpdated]
  );

  const handleRemove = useCallback(
    async (label: string) => {
      if (loading) return;
      const next = currentLabels.filter((l) => l.label !== label);
      setLoading(true);
      try {
        const res = await onUpdate(entryId, next);
        if (res.ok) {
          setCurrentLabels(next);
          onLabelsUpdated?.();
        }
      } finally {
        setLoading(false);
      }
    },
    [entryId, currentLabels, onUpdate, loading, onLabelsUpdated]
  );

  return (
    <div className="library-detail-backdrop" role="dialog" aria-modal="true" aria-labelledby="library-labels-modal-title">
      <div
        className="library-detail-panel library-labels-modal-panel styled-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="library-detail-header library-labels-modal-header">
          <h2 id="library-labels-modal-title" className="library-detail-title">Labels personnalisés</h2>
          <p className="library-labels-modal-subtitle">{gameTitle}</p>
        </div>
        <div className="library-detail-body library-labels-modal-body">
          {/* Ligne 1 : Labels pleine largeur */}
          <div className="library-labels-modal-row library-labels-modal-row--full">
            <div className="library-detail-block library-labels-block-labels">
              <h3 className="library-detail-block-title">🏷️ Labels</h3>
              {currentLabels.length > 0 ? (
                <div className="library-labels-list">
                  {currentLabels.map((l) => (
                    <span
                      key={l.label}
                      className="library-labels-badge"
                      style={{
                        background: `${l.color}22`,
                        borderColor: `${l.color}66`,
                        color: l.color,
                      }}
                    >
                      {l.label}
                      <button
                        type="button"
                        className="library-labels-badge-remove"
                        onClick={() => handleRemove(l.label)}
                        disabled={loading}
                        title="Retirer"
                        style={{ color: l.color }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="library-labels-empty">Aucun label. Ajoutez-en ci-dessous.</p>
              )}
            </div>
          </div>

          {/* Ligne 2 : gauche = choix existant (si présent), droite = ajout nouveau */}
          <div className="library-labels-modal-row library-labels-modal-row--two-cols">
            {availableSuggestions.length > 0 && (
              <div className="library-detail-block library-labels-block-choose">
                <h3 className="library-detail-block-title">Choisir un label existant</h3>
                <select
                  className="app-select library-labels-select"
                  value={selectedExisting}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedExisting(v);
                    if (v) addExistingByLabel(v);
                  }}
                  disabled={loading}
                >
                  <option value="">Sélectionner…</option>
                  {availableSuggestions.map((l) => (
                    <option key={l.label} value={l.label}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="library-detail-block library-labels-block-add">
              <h3 className="library-detail-block-title">
                {availableSuggestions.length > 0 ? 'Ajouter un nouveau label' : 'Ajouter un nouveau label'}
              </h3>
              <div className="library-labels-add-row">
                <input
                  type="text"
                  className="app-input library-labels-input"
                  value={newLabelText}
                  onChange={(e) => setNewLabelText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddNew())}
                  placeholder="Nom du label"
                />
                <div className="library-labels-color-trigger-wrap">
                  <span className="library-labels-color-trigger-label">Couleur</span>
                  <span className="library-labels-color-trigger-rainbow-wrap">
                    <button
                      type="button"
                      className="library-labels-color-trigger library-labels-color-trigger--rainbow"
                      style={{ background: newLabelColor }}
                      onClick={() => setShowColorPickerModal(true)}
                      title="Choisir une couleur"
                    />
                  </span>
                </div>
                {showColorPickerModal && (
                  <div
                    className="library-labels-color-modal-backdrop"
                    onClick={() => setShowColorPickerModal(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Choisir une couleur"
                  >
                    <div className="library-labels-color-modal-panel" onClick={(e) => e.stopPropagation()}>
                      <div className="library-labels-color-modal-section">
                        <span className="library-labels-color-modal-label">Choix précis</span>
                        <input
                          type="color"
                          value={newLabelColor}
                          onChange={(e) => setNewLabelColor(e.target.value)}
                          className="library-labels-color-picker-input"
                          title="Couleur personnalisée"
                        />
                      </div>
                      <div className="library-labels-color-modal-sep" />
                      <div className="library-labels-color-modal-section">
                        <span className="library-labels-color-modal-label">Couleurs primaires</span>
                        <div className="library-labels-color-modal-presets" role="group" aria-label="Couleurs primaires">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className="library-labels-preset"
                            style={{
                              background: c,
                              border: newLabelColor === c ? '2px solid var(--text)' : '1px solid var(--border)',
                            }}
                            onClick={() => {
                              setNewLabelColor(c);
                              setShowColorPickerModal(false);
                            }}
                            title={c}
                          />
                        ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="form-btn form-btn--ghost library-labels-color-modal-close"
                        onClick={() => setShowColorPickerModal(false)}
                      >
                        ↩️ Fermer
                      </button>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="library-labels-add-btn"
                  onClick={handleAddNew}
                  disabled={!newLabelText.trim() || loading}
                  title="Ajouter le label"
                >
                  ✅
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="library-detail-footer library-labels-modal-footer">
          <button type="button" onClick={handleClose} className="form-btn form-btn--ghost">
            ↩️ Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
