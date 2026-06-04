/** Métadonnée historique : exclure le thread du contrôle de version F95. */
export const SKIP_VERSION_CHECK_INPUT_KEY = '_skip_version_check';

export function parseSkipVersionCheckFlag(value: unknown): boolean {
  if (value == null || value === '') return false;
  return ['true', '1', 'yes'].includes(String(value).toLowerCase());
}

/** Inputs à persister en historique selon le toggle (sans laisser un ancien flag dans `inputs`). */
export function buildSavedInputsForPublish(
  inputs: Record<string, string>,
  skipVersionControl: boolean
): Record<string, string> {
  const { [SKIP_VERSION_CHECK_INPUT_KEY]: _removed, ...rest } = inputs;
  if (skipVersionControl) {
    return { ...rest, [SKIP_VERSION_CHECK_INPUT_KEY]: 'true' };
  }
  return rest;
}
