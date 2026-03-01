/**
 * Applique un objet de configuration importé (JSON) en mettant à jour localStorage et les setters fournis.
 */

export type ApplyFullConfigSetters = {
  setTemplates: (templates: unknown[]) => void;
  setAllVarsConfig: (config: unknown[]) => void;
  setInputs: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  setSavedTags: (tags: unknown[]) => void;
  setSavedInstructions: (instructions: Record<string, string>) => void;
  setPublishedPosts: (posts: unknown[]) => void;
};

export function applyFullConfig(config: unknown, setters: ApplyFullConfigSetters): void {
  if (!config || typeof config !== 'object') {
    throw new Error('Fichier invalide (JSON attendu)');
  }

  const c = config as Record<string, unknown>;

  const importedBase =
    (typeof c.apiBase === 'string' && c.apiBase.trim()) ||
    (typeof c.apiUrl === 'string' && c.apiUrl.trim()) ||
    '';

  if (importedBase) {
    localStorage.setItem('apiBase', importedBase);
    localStorage.setItem('apiUrl', importedBase);
  }

  if (typeof c.apiKey === 'string') {
    localStorage.setItem('apiKey', c.apiKey);
  }

  if (Array.isArray(c.templates)) {
    setters.setTemplates(c.templates);
  }

  if (Array.isArray(c.allVarsConfig)) {
    setters.setAllVarsConfig(c.allVarsConfig);
  }

  if (Array.isArray(c.savedTags)) {
    setters.setSavedTags(c.savedTags);
  }

  if (c.savedInstructions && typeof c.savedInstructions === 'object' && !Array.isArray(c.savedInstructions)) {
    setters.setSavedInstructions(c.savedInstructions as Record<string, string>);
  }

  if (Array.isArray(c.publishedPosts)) {
    setters.setPublishedPosts(c.publishedPosts);
  }

  if (Array.isArray(c.allVarsConfig)) {
    const allVarsConfig = c.allVarsConfig as Array<{ name?: string }>;
    setters.setInputs(prev => {
      const next: Record<string, string> = { ...prev };
      for (const v of allVarsConfig) {
        if (v?.name && !(v.name in next)) next[v.name] = '';
      }
      if (!('is_modded_game' in next)) next['is_modded_game'] = 'false';
      if (!('Mod_link' in next)) next['Mod_link'] = '';
      if (!('use_additional_links' in next)) next['use_additional_links'] = 'false';
      return next;
    });
  }
}
