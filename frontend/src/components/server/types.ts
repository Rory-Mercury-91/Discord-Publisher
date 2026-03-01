/** Onglets du panneau serveur */
export type ServerTab = 'status' | 'security' | 'operations' | 'ip_analysis';

/** Résultat d'une action serveur (API / SSH) */
export interface ActionResult {
  ts: number;
  action: string;
  output: string;
  ok: boolean;
}

/** Ligne d'analyse IP (logs [REQUEST]) */
export interface IpRow {
  ip: string;
  total: number;
  suspicious: number;
  org: string;
  category: 'MOI' | 'MEMBRE' | 'PROXY' | 'PUBLIC' | 'ERREUR';
  identity: string;
  topRoute: string;
}
