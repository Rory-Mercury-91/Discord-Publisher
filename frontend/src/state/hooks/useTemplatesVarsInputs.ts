import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { cleanGameLinkUrl } from '../logic/links';
import { defaultTemplates, defaultVarsConfig } from '../defaults';
import type { Template, VarConfig } from '../types';

/** Format Supabase : objet { templates, customVars } ou ancien format (tableau de templates). */
export type SavedTemplatesPayload =
  | { templates: Template[]; customVars?: VarConfig[] }
  | Template[];

export function parseSavedTemplatesValue(value: unknown): { templates: Template[]; customVars: VarConfig[] } {
  if (Array.isArray(value) && value.length >= 0) {
    return { templates: value as Template[], customVars: [] };
  }
  if (value && typeof value === 'object' && 'templates' in value) {
    const o = value as { templates: unknown; customVars?: unknown };
    const templates = Array.isArray(o.templates) ? (o.templates as Template[]) : [];
    const customVars = Array.isArray(o.customVars) ? (o.customVars as VarConfig[]) : [];
    return { templates, customVars };
  }
  return { templates: [], customVars: [] };
}

function getStoredVarsConfig(): VarConfig[] {
  try {
    const raw = localStorage.getItem('customVariables');
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return defaultVarsConfig;
}

function buildInitialInputs(): Record<string, string> {
  const vars = getStoredVarsConfig();
  const obj: Record<string, string> = {};
  vars.forEach(v => (obj[v.name] = ''));
  obj['instruction'] = '';
  obj['is_modded_game'] = 'false';
  obj['use_additional_links'] = 'false';
  obj['Mod_link'] = '';
  obj['main_translation_label'] = localStorage.getItem('default_translation_label') || 'Traduction';
  obj['main_mod_label'] = localStorage.getItem('default_mod_label') || 'Mod';
  try {
    const raw = localStorage.getItem('savedInputs');
    if (raw) Object.assign(obj, JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return obj;
}

/** État et actions pour templates, variables de configuration et inputs du formulaire. */
export function useTemplatesVarsInputs() {
  const [templates, setTemplates] = useState<Template[]>(() => {
    try {
      const raw = localStorage.getItem('customTemplates');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      /* ignore */
    }
    return defaultTemplates;
  });

  const [currentTemplateIdx, setCurrentTemplateIdx] = useState(0);

  const [allVarsConfig, setAllVarsConfig] = useState<VarConfig[]>(() => getStoredVarsConfig());

  const [inputs, setInputs] = useState<Record<string, string>>(buildInitialInputs);

  const templatesSyncEnabledRef = useRef(false);

  useEffect(() => {
    localStorage.setItem('customTemplates', JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    const cleanedVars = allVarsConfig.filter(
      v =>
        v.name !== 'Traductor' &&
        v.name !== 'Developpeur' &&
        v.name !== 'install_instructions'
    );
    localStorage.setItem('customVariables', JSON.stringify(cleanedVars));
  }, [allVarsConfig]);

  useEffect(() => {
    localStorage.setItem('savedInputs', JSON.stringify(inputs));
  }, [inputs]);

  useEffect(() => {
    const t = setTimeout(() => {
      templatesSyncEnabledRef.current = true;
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  const updateTemplate = useCallback((idx: number, t: Template) => {
    setTemplates(prev => {
      const copy = [...prev];
      const previous = copy[idx];
      const newT = previous?.isDefault ? { ...t, isDefault: false } : t;
      copy[idx] = newT;
      return copy;
    });
  }, []);

  const syncTemplatesToSupabase = useCallback(
    async (templatesToSync?: Template[], customVarsToSync?: VarConfig[]): Promise<{ ok: boolean; error?: string }> => {
      const sb = getSupabase();
      if (!sb) return { ok: false, error: 'Supabase non configuré' };
      const { data: { session } } = await sb.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return { ok: true };
      const list = templatesToSync ?? templates;
      const customVars = customVarsToSync ?? allVarsConfig.filter(v => v.isCustom);
      if (!templatesToSync && list.length > 0 && list[0]?.isDefault === true && customVars.length === 0) {
        return { ok: true };
      }
      const payload: SavedTemplatesPayload = { templates: list, customVars };
      try {
        const { error } = await sb
          .from('saved_templates')
          .upsert(
            { owner_id: userId, value: payload, updated_at: new Date().toISOString() },
            { onConflict: 'owner_id' }
          );
        if (error) throw new Error((error as { message?: string })?.message);
        return { ok: true };
      } catch (e: unknown) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [templates, allVarsConfig]
  );

  const fetchTemplatesFromSupabase = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;
    const { data, error } = await sb
      .from('saved_templates')
      .select('value')
      .eq('owner_id', userId)
      .maybeSingle();
    if (error || !data?.value) return;
    try {
      const raw = Array.isArray(data.value) ? data.value : JSON.parse(String(data.value));
      const { templates: tpl, customVars: cv } = parseSavedTemplatesValue(raw);
      if (tpl.length > 0) setTemplates(tpl);
      if (cv.length > 0) {
        const merged = [...defaultVarsConfig, ...cv.map(v => ({ ...v, isCustom: true as const }))];
        setAllVarsConfig(merged);
      }
    } catch {
      /* ignore */
    }
  }, []);

  /** Applique un payload Supabase (templates + customVars) sur l'état local. Utilisé au chargement initial et par le realtime. */
  const applySavedTemplatesPayload = useCallback((value: unknown) => {
    try {
      const { templates: tpl, customVars: cv } = parseSavedTemplatesValue(value);
      if (tpl.length > 0) setTemplates(tpl);
      if (cv.length > 0) {
        const merged = [...defaultVarsConfig, ...cv.map(v => ({ ...v, isCustom: true as const }))];
        setAllVarsConfig(merged);
      }
    } catch {
      /* ignorer */
    }
  }, []);

  /** Enregistre les templates et variables personnalisées pour un owner donné (usage admin). */
  const syncTemplatesForOwnerToSupabase = useCallback(
    async (
      ownerId: string,
      templatesToSync: Template[],
      customVarsToSync: VarConfig[] = []
    ): Promise<{ ok: boolean; error?: string }> => {
      const sb = getSupabase();
      if (!sb) return { ok: false, error: 'Supabase non configuré' };
      const payload: SavedTemplatesPayload = { templates: templatesToSync, customVars: customVarsToSync };
      try {
        const { error } = await sb
          .from('saved_templates')
          .upsert(
            { owner_id: ownerId, value: payload, updated_at: new Date().toISOString() },
            { onConflict: 'owner_id' }
          );
        if (error) throw new Error((error as { message?: string })?.message);
        return { ok: true };
      } catch (e: unknown) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    []
  );

  const restoreDefaultTemplates = useCallback(() => {
    setTemplates(defaultTemplates);
    try {
      localStorage.setItem('customTemplates', JSON.stringify(defaultTemplates));
    } catch {
      /* ignore */
    }
    syncTemplatesToSupabase(defaultTemplates, allVarsConfig.filter(v => v.isCustom)).catch(() => {});
  }, [syncTemplatesToSupabase, allVarsConfig]);

  useEffect(() => {
    if (!templatesSyncEnabledRef.current) return;
    const id = setTimeout(() => {
      syncTemplatesToSupabase().catch(() => {});
    }, 400);
    return () => clearTimeout(id);
  }, [templates, allVarsConfig, syncTemplatesToSupabase]);

  const addVarConfig = useCallback((v: VarConfig) => {
    if (v.name === 'Traductor' || v.name === 'Developpeur' || v.name === 'install_instructions') return;
    setAllVarsConfig(prev => [...prev, { ...v, isCustom: true }]);
  }, []);

  const updateVarConfig = useCallback((idx: number, v: VarConfig) => {
    setAllVarsConfig(prev => {
      const copy = [...prev];
      copy[idx] = { ...v, isCustom: copy[idx].isCustom };
      return copy;
    });
  }, []);

  const deleteVarConfig = useCallback((idx: number) => {
    const varName = allVarsConfig[idx]?.name;
    setAllVarsConfig(prev => {
      const copy = [...prev];
      copy.splice(idx, 1);
      return copy;
    });
    if (varName) {
      setInputs(prev => {
        const copy = { ...prev };
        delete copy[varName];
        return copy;
      });
    }
  }, [allVarsConfig]);

  const setInput = useCallback((name: string, value: string) => {
    let finalValue = value;
    if (name === 'Game_link' || name === 'Translate_link' || name === 'Mod_link') {
      finalValue = cleanGameLinkUrl(value);
    }
    setInputs(prev => ({ ...prev, [name]: finalValue }));
  }, []);

  return {
    templates,
    setTemplates,
    currentTemplateIdx,
    setCurrentTemplateIdx,
    updateTemplate,
    restoreDefaultTemplates,
    syncTemplatesToSupabase,
    syncTemplatesForOwnerToSupabase,
    fetchTemplatesFromSupabase,
    applySavedTemplatesPayload,
    allVarsConfig,
    setAllVarsConfig,
    addVarConfig,
    updateVarConfig,
    deleteVarConfig,
    inputs,
    setInputs,
    setInput
  };
}
