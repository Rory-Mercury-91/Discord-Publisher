import { useCallback, useState } from 'react';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
};

type ConfirmState = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  type: 'danger' | 'warning' | 'info';
};

export function useConfirm() {
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirmer',
    cancelText: 'Annuler',
    type: 'warning'
  });

  const [resolver, setResolver] = useState<((v: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve);
      setConfirmState({
        isOpen: true,
        title: options.title,
        message: options.message,
        confirmText: options.confirmText ?? 'Confirmer',
        cancelText: options.cancelText ?? 'Annuler',
        type: options.type ?? 'warning'
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolver?.(true);
    setResolver(null);
    setConfirmState(prev => ({ ...prev, isOpen: false }));
  }, [resolver]);

  const handleCancel = useCallback(() => {
    resolver?.(false);
    setResolver(null);
    setConfirmState(prev => ({ ...prev, isOpen: false }));
  }, [resolver]);

  return { confirm, confirmState, handleConfirm, handleCancel };
}
