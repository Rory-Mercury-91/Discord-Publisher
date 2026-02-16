import React, { createContext, useCallback, useContext, useState } from 'react';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type?: Toast['type'], duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: Toast['type'] = 'info', duration = 3000) => {
    const id = Date.now().toString() + Math.random();
    const newToast: Toast = { id, message, type, duration };

    setToasts(prev => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 100002,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      maxWidth: 400
    }}>
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const getIcon = () => {
    switch (toast.type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return 'ℹ️';
    }
  };

  const getColor = () => {
    switch (toast.type) {
      case 'success': return '#10b981';
      case 'error': return '#ef4444';
      case 'warning': return '#f59e0b';
      case 'info': return '#3b82f6';
      default: return '#3b82f6';
    }
  };

  return (
    <div
      style={{
        background: 'var(--panel)',
        border: `1px solid ${getColor()}`,
        borderRadius: 8,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minWidth: 300,
        boxShadow: `0 4px 12px rgba(0,0,0,0.3), 0 0 0 1px ${getColor()}20`,
        animation: 'toastSlideIn 0.3s ease-out',
        cursor: 'pointer'
      }}
      onClick={() => onRemove(toast.id)}
    >
      <div style={{
        fontSize: 20,
        lineHeight: 1,
        flexShrink: 0
      }}>
        {getIcon()}
      </div>

      <div style={{
        flex: 1,
        color: '#fff',
        fontSize: 14,
        lineHeight: 1.4
      }}>
        {toast.message}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(toast.id);
        }}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--muted)',
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          padding: 4,
          flexShrink: 0
        }}
      >
        ✕
      </button>

      <style>{`
        @keyframes toastSlideIn {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
