import { useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';

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
    setReason(''); // Réinitialiser pour la prochaine fois
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
        zIndex: 100000,
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
          maxWidth: 600,
          width: '90%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          animation: 'modalSlideIn 0.2s ease-out'
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{
          margin: '0 0 12px',
          color: '#ff6b6b',
          fontSize: 20,
          fontWeight: 600
        }}>
          🗑️ Supprimer définitivement
        </h3>

        <div style={{
          margin: '0 0 20px',
          color: 'var(--text)',
          lineHeight: 1.5,
          fontSize: 15
        }}>
          <p style={{ margin: '0 0 12px' }}>
            Vous êtes sur le point de supprimer le post <strong>"{postTitle}"</strong>
          </p>
          <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 13 }}>
            Cette action va :
          </p>
          <ul style={{ margin: '0 0 12px', paddingLeft: 20, color: 'var(--muted)', fontSize: 13 }}>
            <li>Retirer le post de votre historique</li>
            <li>Le supprimer de la base de données</li>
            <li>Supprimer le thread (et tout son contenu) sur Discord</li>
            <li>Envoyer une annonce de suppression dans le salon Discord</li>
          </ul>
          <p style={{ margin: '12px 0 8px', color: '#ff6b6b', fontWeight: 500 }}>
            ⚠️ Cette action est irréversible.
          </p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{
            display: 'block',
            fontSize: 14,
            fontWeight: 500,
            marginBottom: 8,
            color: 'var(--text)'
          }}>
            Raison de la suppression (facultatif)
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Ex: Contenu inapproprié, doublon, erreur de publication..."
            rows={3}
            style={{
              width: '100%',
              padding: 12,
              background: 'var(--input-bg)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              fontSize: 14,
              fontFamily: 'inherit',
              resize: 'vertical',
              minHeight: 80
            }}
            maxLength={500}
          />
          <div style={{
            marginTop: 4,
            fontSize: 11,
            color: 'var(--muted)',
            textAlign: 'right'
          }}>
            {reason.length}/500 caractères
          </div>
        </div>

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
            Annuler
          </button>

          <button
            onClick={handleConfirm}
            style={{
              padding: '10px 20px',
              background: '#ff6b6b',
              border: 'none',
              color: 'white',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              transition: 'all 0.2s',
              boxShadow: '0 2px 8px #ff6b6b40'
            }}
          >
            🗑️ Supprimer définitivement
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
