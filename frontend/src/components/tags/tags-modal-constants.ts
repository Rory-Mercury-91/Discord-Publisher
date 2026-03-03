// Sections prédéfinies pour les tags secondaires
export type Section = 'translationType' | 'gameStatus' | 'sites';

export const SECTIONS: Section[] = ['translationType', 'gameStatus', 'sites'];

export const PREDEFINED: Record<Section, { key: string; label: string }[]> = {
  gameStatus: [
    { key: 'completed', label: '✅ Terminé' },
    { key: 'ongoing', label: '🔄 En cours' },
    { key: 'abandoned', label: '❌ Abandonné' },
  ],
  translationType: [
    { key: 'manual', label: '🧠 Manuelle' },
    { key: 'semi_auto', label: '🖨️ Semi-Automatique' },
    { key: 'auto', label: '🤖 Automatique' },
  ],
  sites: [
    { key: 'f95', label: '🔞 F95' },
    { key: 'lewdcorner', label: '⛔ LewdCorner' },
    { key: 'other_sites', label: '🔗 Autres Sites' },
  ],
};

export const SECTION_TITLES: Record<Section, string> = {
  gameStatus: '🎮 Statut du jeu',
  translationType: '📋 Type de traduction',
  sites: '🌐 Sites',
};

/** Aliases Discord pour mapper les noms de tags vers nos slots */
export const DISCORD_TAG_ALIASES: { section: Section; key: string; aliases: string[] }[] = [
  { section: 'gameStatus', key: 'completed', aliases: ['terminé', 'termine', 'completed', 'fini'] },
  { section: 'gameStatus', key: 'ongoing', aliases: ['en cours', 'ongoing', 'en cours...', 'in progress'] },
  { section: 'gameStatus', key: 'abandoned', aliases: ['abandonné', 'abandonne', 'abandoned'] },
  { section: 'translationType', key: 'manual', aliases: ['manuelle', 'manual', 'manuel'] },
  { section: 'translationType', key: 'semi_auto', aliases: ['semi-automatique', 'semi-auto', 'semi automatique', 'semi auto'] },
  { section: 'translationType', key: 'auto', aliases: ['automatique', 'automatic', 'auto'] },
  { section: 'sites', key: 'f95', aliases: ['f95', 'f95zone'] },
  { section: 'sites', key: 'lewdcorner', aliases: ['lewdcorner', 'lewd corner', 'lewd'] },
  { section: 'sites', key: 'other_sites', aliases: ['autres sites', 'autres', 'other sites', 'others', 'autre'] },
];

export type Translator = { id: string; name: string; kind: 'profile' | 'external' };

export type MappingRow = {
  id: string;
  profile_id: string;
  tag_id: string;
  forum_channel_id: string;
  list_form_traducteur?: string | null;
};

export type ExternalTranslator = {
  id: string;
  name: string;
  tag_id: string;
  forum_channel_id: string;
  list_form_traducteur?: string | null;
};

export type Slot = { id?: string; discordTagId: string };
export type FreeTag = { id?: string; name: string; discordTagId: string; _k: string };

export type TagConfig = {
  translationType: Record<string, Slot>;
  gameStatus: Record<string, Slot>;
  sites: Record<string, Slot>;
  others: FreeTag[];
};

let _seq = 0;
export function uid(): string {
  return `_n${++_seq}`;
}

export function emptyTagConfig(): TagConfig {
  return {
    translationType: Object.fromEntries(PREDEFINED.translationType.map((p) => [p.key, { discordTagId: '' }])),
    gameStatus: Object.fromEntries(PREDEFINED.gameStatus.map((p) => [p.key, { discordTagId: '' }])),
    sites: Object.fromEntries(PREDEFINED.sites.map((p) => [p.key, { discordTagId: '' }])),
    others: [],
  };
}

export type EditRow = { tag_id: string; forum_channel_id: string; list_form_traducteur: string };
