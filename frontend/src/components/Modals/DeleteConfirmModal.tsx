import { useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  postTitle: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export default function DeleteConfirmModal({
  isOpen,
  postTitle,
  onConfirm,
  onCancel
}: DeleteConfirmModalProps) {
  const [reason, setReason] = useState('');

  useEscapeKey(onCancel, isOpen);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(reason.trim());
    setReason('');
  };

  return (
    <div className="modal modal--top">
      <div
        className="panel modal-panel--delete"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="modal-confirm__title modal-confirm__title--danger">
          🗑️ Supprimer définitivement
        </h3>

        <div className="modal-confirm__body">
          <p>
            Vous êtes sur le point de supprimer le post <strong>"{postTitle}"</strong>
          </p>
          <p className="modal-confirm__body--muted">Cette action va :</p>
          <ul>
            <li>Retirer le post de votre historique</li>
            <li>Le supprimer de la base de données</li>
            <li>Supprimer le thread (et tout son contenu) sur Discord</li>
            <li>Envoyer une annonce de suppression dans le salon Discord</li>
          </ul>
          <p className="modal-confirm__body--warning">⚠️ Cette action est irréversible.</p>
        </div>

        <div className="modal-confirm__reason-wrap">
          <label className="form-label">Raison de la suppression (facultatif)</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Ex: Contenu inapproprié, doublon, erreur de publication..."
            rows={3}
            className="form-textarea"
            style={{ minHeight: 80 }}
            maxLength={500}
          />
          <div className="modal-confirm__reason-count">{reason.length}/500 caractères</div>
        </div>

        <div className="modal-confirm__actions">
          <button type="button" onClick={onCancel} className="form-btn form-btn--ghost">
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="form-btn form-btn--danger"
          >
            🗑️ Supprimer définitivement
          </button>
        </div>
      </div>
    </div>
  );
}
