/**
 * Modale d'ajout ou de modification d'un exécutable (nom + fichier).
 */
import { useCallback, useState } from 'react';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { useModalScrollLock } from '../../../hooks/useModalScrollLock';
import { pickExecutableFile } from '../../../lib/pick-executable-file';
import type { ExecutablePathEntry } from '../../../state/hooks/useCollection';

interface ExecutablePathModalProps {
  gameTitle: string;
  mode: 'add' | 'edit';
  initial?: ExecutablePathEntry;
  onConfirm: (entry: ExecutablePathEntry) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}

export default function ExecutablePathModal({
  gameTitle,
  mode,
  initial,
  onConfirm,
  onClose,
}: ExecutablePathModalProps) {
  useEscapeKey(onClose, true);
  useModalScrollLock();

  const [name, setName] = useState(initial?.name?.trim() ?? '');
  const [path, setPath] = useState(initial?.path ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBrowse = useCallback(async () => {
    const selected = await pickExecutableFile();
    if (selected) setPath(selected);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      setError('Veuillez sélectionner un exécutable.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const entry: ExecutablePathEntry = {
        path: trimmedPath,
        name: name.trim() || null,
        last_launch: initial?.last_launch ?? null,
      };
      const res = await onConfirm(entry);
      if (res.ok) onClose();
      else setError(res.error ?? 'Erreur lors de l\'enregistrement.');
    } finally {
      setSaving(false);
    }
  }, [path, name, initial?.last_launch, onConfirm, onClose]);

  const pathLabel = path
    ? path.replace(/\\/g, '/').split('/').pop() ?? path
    : null;

  return (
    <div
      className="library-detail-backdrop library-executable-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-executable-modal-title"
      onClick={onClose}
    >
      <div
        className="library-executable-modal-panel styled-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="library-executable-modal-header">
          <h2 id="library-executable-modal-title" className="library-executable-modal-title">
            {mode === 'add' ? 'Ajouter un exécutable' : 'Modifier l\'exécutable'}
          </h2>
          <p className="library-executable-modal-subtitle" title={gameTitle}>{gameTitle}</p>
        </header>

        <div className="library-executable-modal-body">
          <div className="library-executable-modal-field">
            <label className="form-label" htmlFor="executable-name-input">Nom</label>
            <input
              id="executable-name-input"
              type="text"
              className="app-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSubmit())}
              placeholder="Ex. : Saison 1, Saison 2…"
              disabled={saving}
              autoFocus
            />
          </div>

          <div className="library-executable-modal-field">
            <span className="form-label">Fichier exécutable</span>
            <div className="library-executable-modal-file-row">
              <button
                type="button"
                className="form-btn form-btn--secondary library-executable-modal-browse"
                onClick={handleBrowse}
                disabled={saving}
                title={path || 'Parcourir…'}
              >
                📂 Parcourir…
              </button>
              <span
                className={`library-executable-modal-file-label${path ? '' : ' library-executable-modal-file-label--empty'}`}
                title={path || undefined}
              >
                {pathLabel ?? 'Aucun fichier sélectionné'}
              </span>
            </div>
          </div>

          {error && <p className="library-executable-modal-error" role="alert">{error}</p>}
        </div>

        <footer className="library-executable-modal-footer">
          <button type="button" className="form-btn form-btn--ghost" onClick={onClose} disabled={saving}>
            Annuler
          </button>
          <button
            type="button"
            className="form-btn form-btn--primary"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? 'Enregistrement…' : mode === 'add' ? 'Ajouter' : 'Enregistrer'}
          </button>
        </footer>
      </div>
    </div>
  );
}
