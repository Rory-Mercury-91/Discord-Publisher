/**
 * Génère le titre dynamique du post à partir du nom et de la version du jeu.
 * Format : "Nom du jeu [Version du jeu]"
 */
export function buildDynamicTitle(gameName?: string, gameVersion?: string): string {
  const name = gameName?.trim();
  const version = gameVersion?.trim();
  const titleParts: string[] = [];

  if (name) {
    const cleanName = name.replace(/^\[(.*)\]$/, '$1');
    titleParts.push(cleanName);
  }
  if (version) {
    titleParts.push(`[${version}]`);
  }

  return titleParts.join(' ');
}
