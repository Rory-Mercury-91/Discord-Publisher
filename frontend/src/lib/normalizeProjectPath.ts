/** Segments de chemin Windows obsolètes → noms actuels du dossier parent. */
const LEGACY_PATH_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Projet GitHub/gi, 'Projet_GitHub'],
  [/Projet Github/gi, 'Projet_GitHub'],
];

/**
 * Corrige les chemins enregistrés avant le renommage « Projet GitHub » → « Projet_GitHub ».
 */
export function normalizeProjectPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;

  let normalized = trimmed;
  for (const [pattern, replacement] of LEGACY_PATH_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}
