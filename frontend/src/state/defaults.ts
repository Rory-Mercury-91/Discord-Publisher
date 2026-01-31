import type { Template, VarConfig } from './types';

export const defaultVarsConfig: VarConfig[] = [
  { name: 'Game_name', label: 'Nom du jeu', placeholder: 'Lost Solace' },
  { name: 'Game_version', label: 'Version du jeu', placeholder: 'v0.1' },
  { name: 'Translate_version', label: 'Version de la traduction', placeholder: 'v0.1' },
  { name: 'Game_link', label: 'Lien du jeu', placeholder: 'https://...' },
  { name: 'Translate_link', label: 'Lien de la traduction', placeholder: 'https://...' },
  { name: 'Overview', label: 'Synopsis', placeholder: 'Synopsis du jeu...', type: 'textarea' },
  { name: 'is_modded_game', label: 'Mod compatible', type: 'text' },
  { name: 'Mod_link', label: 'Lien du mod', placeholder: 'https://...' }
];

export const defaultTemplate: Template = {
  id: 'my',
  name: 'Mes traductions',
  type: 'my',
  isDefault: true,
  content: `## :flag_fr: La traduction française de [Game_name] est disponible ! :tada:

Vous pouvez l'installer dès maintenant pour profiter du jeu dans notre langue. Bon jeu à tous ! :point_down:

1. :computer: **Infos du Jeu**
   * **Nom du jeu :** [Game_name]
   * **Version du jeu :** \`[Game_version]\`
   * **Version traduite :** \`[Translate_version]\`
   * **Type de traduction :** [Translation_Type]
   * **Mod compatible :** [is_modded_game]

2. :link: **Liens requis**
   * [Jeu original](<[Game_link]>)
[MOD_LINKS_LINE]

3. :link: **Traductions**
[TRANSLATION_LINKS_LINE]

**Synopsis du jeu :**
> [Overview]
[instruction]`
};

export const defaultTemplates: Template[] = [defaultTemplate];
