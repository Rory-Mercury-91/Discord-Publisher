
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
  if (!isOpen) return null;

  const getTypeColor = () => {
    switch (type) {
      case 'danger': return '#ff6b6b';
      case 'warning': return '#ffa502';
      case 'info': return 'var(--accent)';
      default: return 'var(--accent)';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100000, // ✅ AU-DESSUS du ConfigModal (99999)
        backdropFilter: 'blur(4px)'
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          maxWidth: 550,
          width: '90%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          animation: 'modalSlideIn 0.2s ease-out'
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{
          margin: '0 0 12px',
          color: getTypeColor(),
          fontSize: 20,
          fontWeight: 600
        }}>
          {title}
        </h3>

        <p style={{
          margin: '0 0 24px',
          color: 'var(--text)',
          lineHeight: 1.5,
          fontSize: 15,
          whiteSpace: 'pre-line'
        }}>
          {message}
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--muted)';
            }}
          >
            {cancelText}
          </button>

          <button
            onClick={onConfirm}
            style={{
              padding: '10px 20px',
              background: getTypeColor(),
              border: 'none',
              color: 'white',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              transition: 'all 0.2s',
              boxShadow: `0 2px 8px ${getTypeColor()}40`
            }}
          >
            {confirmText}
          </button>

        </div>
      </div>

      <style>{`
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
