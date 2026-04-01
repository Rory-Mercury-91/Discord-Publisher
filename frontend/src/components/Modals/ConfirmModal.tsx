import { useEscapeKey } from '../../hooks/useEscapeKey';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  type = 'warning'
}: ConfirmModalProps) {
  useEscapeKey(onCancel, isOpen);
  if (!isOpen) return null;

  const titleClass = `modal-confirm__title modal-confirm__title--${type}`;
  const confirmBtnClass =
    type === 'danger'
      ? 'form-btn form-btn--danger'
      : type === 'warning'
        ? 'form-btn form-btn--warning'
        : 'form-btn form-btn--primary';

  return (
    <div className="modal modal--top" onClick={onCancel}>
      <div
        className="panel modal-panel--confirm"
        onClick={e => e.stopPropagation()}
      >
        <h3 className={titleClass}>{title}</h3>
        <p className="modal-confirm__message">{message}</p>
        <div className="modal-confirm__actions">
          <button type="button" onClick={onCancel} className="form-btn form-btn--ghost">
            {cancelText}
          </button>
          <button type="button" onClick={onConfirm} className={confirmBtnClass}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
