// Conteneur : état et logique de la mise à jour, rendu des sous-composants
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { check } from '@tauri-apps/plugin-updater';
import { useEffect, useState } from 'react';

import UpdateAvailableCard from './components/UpdateAvailableCard';
import UpdateSuccessToast from './components/UpdateSuccessToast';

type UpdateState = 'idle' | 'checking' | 'available' | 'installing' | 'updated';

export default function UpdateNotification() {
  const [state, setState] = useState<UpdateState>('idle');
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useElevation, setUseElevation] = useState<boolean>(false);

  useEffect(() => {
    const justUpdated = localStorage.getItem('justUpdated');
    if (justUpdated) {
      try {
        const versionInfo = JSON.parse(justUpdated);
        console.log('[Updater] 🎉 Mise à jour réussie !', versionInfo.version);
        setState('updated');
        setUpdateVersion(versionInfo.version);
      } finally {
        localStorage.removeItem('justUpdated');
      }
      const t = setTimeout(() => setState('idle'), 5000);
      return () => clearTimeout(t);
    }

    const timeout = setTimeout(async () => {
      const version = await getVersion();
      setCurrentVersion(version);
      console.log('[Updater] 📱 Version actuelle:', version);
      checkForUpdate();
    }, 3000);

    return () => clearTimeout(timeout);
  }, []);

  async function checkForUpdate() {
    try {
      setState('checking');
      console.log('[Updater] 🔍 Vérification des mises à jour...');

      const update = await check();

      if (update) {
        console.log('[Updater] ✨ Nouvelle version:', update.version);
        setState('available');
        setUpdateVersion(update.version);
        setCurrentVersion(update.currentVersion);
      } else {
        console.log('[Updater] ✅ Application à jour');
        setState('idle');
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      console.error('[Updater] ❌ Erreur vérification:', err);

      if (e.message?.includes('error sending request')) {
        setError('Impossible de vérifier les mises à jour. Vérifiez votre connexion Internet.');
      } else if (e.message?.includes('signature')) {
        setError('Erreur de signature de la mise à jour. Contactez le support.');
      } else {
        setError(`Erreur: ${e.message || String(err)}`);
      }
      setState('idle');
    }
  }

  async function handleInstall() {
    try {
      setState('installing');
      setError(null);
      console.log('[Updater] 🚀 Installation...', useElevation ? 'AVEC UAC' : 'SANS UAC');

      localStorage.setItem(
        'pendingUpdate',
        JSON.stringify({ version: updateVersion, timestamp: Date.now() })
      );

      await invoke('download_and_install_update', { useElevation });
      console.log('[Updater] ✅ Installation lancée');
    } catch (err: unknown) {
      const e = err as { message?: string };
      console.error('[Updater] ❌ Erreur installation:', err);
      setError(typeof err === 'string' ? err : (e?.message || 'Erreur inconnue'));
      setState('available');
      localStorage.removeItem('pendingUpdate');
    }
  }

  function handleDismiss() {
    setState('idle');
    setError(null);
    setTimeout(checkForUpdate, 24 * 60 * 60 * 1000);
  }

  if (state === 'idle' || state === 'checking') return null;

  if (state === 'updated') {
    return <UpdateSuccessToast updateVersion={updateVersion} />;
  }

  return (
    <UpdateAvailableCard
      state={state === 'installing' ? 'installing' : 'available'}
      updateVersion={updateVersion}
      currentVersion={currentVersion}
      error={error}
      useElevation={useElevation}
      onToggleElevation={() => setUseElevation((v) => !v)}
      onInstall={handleInstall}
      onDismiss={handleDismiss}
    />
  );
}
