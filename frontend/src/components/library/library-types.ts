/** Une variante (saison / autre traduction) pour un même site_id — affichée dans Liens utiles */
export type GameF95Variant = {
  id?: number;
  trad_ver?: string;
  lien_trad?: string;
  type_de_traduction?: string;
  nom_url?: string;
  traducteur?: string;
  traducteur_url?: string;
  version?: string;
  statut?: string;
};

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
  /** Synopsis EN (ex. depuis scraped_data pour Ma collection) */
  synopsis_en?: string;
  /** Synopsis FR (ex. depuis f95_jeux ou enrichissement) */
  synopsis_fr?: string;
  /** Autres lignes (saisons / traductions) pour le même site_id — affichage dédupliqué */
  variants?: GameF95Variant[];
  /** ID de la ligne f95_jeux (pour édition synopsis depuis Ma collection) */
  f95_jeux_id?: number;
};

export type SyncStatus = 'ok' | 'outdated' | 'unknown';

export type AppMode = 'translator' | 'user';
