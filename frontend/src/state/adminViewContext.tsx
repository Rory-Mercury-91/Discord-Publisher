// src/state/adminViewContext.tsx
import React, { createContext, useContext, useState } from 'react';

type AdminViewContextValue = {
  viewAsProfileId  : string | null;
  viewAsProfileName: string | null;
  setViewAs        : (profileId: string | null, name: string | null) => void;
  isViewingAsOther : boolean;
};

const AdminViewContext = createContext<AdminViewContextValue | null>(null);

export function AdminViewProvider({ children }: { children: React.ReactNode }) {
  const [viewAsProfileId,   setViewAsProfileId]   = useState<string | null>(null);
  const [viewAsProfileName, setViewAsProfileName] = useState<string | null>(null);

  const setViewAs = (profileId: string | null, name: string | null) => {
    setViewAsProfileId(profileId);
    setViewAsProfileName(name);
  };

  return (
    <AdminViewContext.Provider
      value={{
        viewAsProfileId,
        viewAsProfileName,
        setViewAs,
        isViewingAsOther: !!viewAsProfileId,
      }}
    >
      {children}
    </AdminViewContext.Provider>
  );
}

export function useAdminView() {
  const ctx = useContext(AdminViewContext);
  if (!ctx) throw new Error('useAdminView must be used inside AdminViewProvider');
  return ctx;
}