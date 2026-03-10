/**
 * Contexte partagé pour l'enrichissement de la collection.
 * Permet au planificateur et à l'UI d'utiliser la même instance.
 */

import { createContext, useContext, type ReactNode } from 'react';
import { useEnrichCollection } from './hooks/useEnrichCollection';

type EnrichmentContextValue = ReturnType<typeof useEnrichCollection>;

const EnrichmentContext = createContext<EnrichmentContextValue | null>(null);

export function EnrichmentProvider({ children }: { children: ReactNode }) {
  const value = useEnrichCollection();
  return (
    <EnrichmentContext.Provider value={value}>
      {children}
    </EnrichmentContext.Provider>
  );
}

export function useEnrichment() {
  const ctx = useContext(EnrichmentContext);
  if (!ctx) throw new Error('useEnrichment doit être utilisé dans EnrichmentProvider');
  return ctx;
}
