/**
 * Ouvre le dialogue système pour choisir un exécutable (Tauri).
 */
export async function pickExecutableFile(): Promise<string | null> {
  const win = window as unknown as {
    __TAURI__?: { dialog?: { open: (opts: unknown) => Promise<string | string[] | null> } };
    __TAURI_PLUGIN_DIALOG__?: { open: (opts: unknown) => Promise<string | string[] | null> };
  };
  const dialogOpen = win.__TAURI__?.dialog?.open ?? win.__TAURI_PLUGIN_DIALOG__?.open;
  if (!dialogOpen) {
    alert('Sélection de fichier non disponible.');
    return null;
  }
  try {
    const selected = await dialogOpen({
      title: 'Choisir un exécutable',
      filters: [
        { name: 'Exécutables', extensions: ['exe', 'bat', 'cmd'] },
        { name: 'Tous', extensions: ['*'] },
      ],
      multiple: false,
      directory: false,
    });
    return selected && typeof selected === 'string' ? selected : null;
  } catch (e) {
    console.warn('Dialog exécutable:', e);
    return null;
  }
}
