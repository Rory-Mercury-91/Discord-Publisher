/** Type d'un jeu F95 (API jeux + champs optionnels) */
export type GameF95 = {
  id: number;
  site_id: number;
  site: string;
  nom_du_jeu: string;
  nom_url: string;
  version: string;
  trad_ver: string;
  lien_trad: string;
  statut: string;
  tags: string;
  type: string;
  traducteur: string;
  traducteur_url: string;
  relecture: string;
  type_de_traduction: string;
  ac: string;
  image: string;
  type_maj: string;
  date_maj: string;
  published_post_id?: number | null;
  synced_at?: string;
  created_at?: string;
  updated_at?: string;
  _sync?: SyncStatus;
};

export type SyncStatus = 'ok' | 'outdated' | 'unknown';

export type AppMode = 'translator' | 'user';
