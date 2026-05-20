/** Constantes partagées entre ajout manuel et édition de fiche collection */

export const MANUAL_GAME_STATUTS = ['En cours', 'Terminé', 'Abandonné', 'En pause', 'En attente'] as const;

export const MANUAL_GAME_ENGINES = [
  'ADRIFT', 'Flash', 'HTML', 'Java', 'QSP', 'RAGS', 'RPGM', 'Ren\'Py', 'Tads', 'Unity', 'Unreal Engine', 'WebGL', 'Wolf RPG', 'Autre',
] as const;

export const MANUAL_GAME_SOURCES = ['F95Zone', 'LewdCorner', 'Autre'] as const;

export type ManualGameSource = (typeof MANUAL_GAME_SOURCES)[number];

export function manualGameSourceIcon(s: string): string {
  if (s === 'F95Zone') return '🔵';
  if (s === 'LewdCorner') return '🟣';
  return '🔘';
}
