import { useCallback, useState } from 'react';

/** Payload passé à showErrorModal (sans timestamp, ajouté par le hook) */
export type ErrorModalPayload = {
  code?: string | number;
  message: string;
  context?: string;
  httpStatus?: number;
  discordError?: unknown;
};

/** Données affichées dans la modale (avec timestamp) */
export type ErrorModalData = ErrorModalPayload & { timestamp: number };

export function useErrorModal() {
  const [errorModalData, setErrorModalData] = useState<ErrorModalData | null>(null);

  const showErrorModal = useCallback((error: ErrorModalPayload) => {
    setErrorModalData({
      ...error,
      timestamp: Date.now()
    });
  }, []);

  const closeErrorModal = useCallback(() => {
    setErrorModalData(null);
  }, []);

  return { errorModalData, showErrorModal, closeErrorModal };
}
