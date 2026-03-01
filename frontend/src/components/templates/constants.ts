/** Données pour l'aide Markdown (syntaxe + description par catégorie) */
export interface MarkdownExampleItem {
  syntax: string;
  description: string;
}

export interface MarkdownExampleSection {
  category: string;
  items: MarkdownExampleItem[];
}

export const MARKDOWN_EXAMPLES: MarkdownExampleSection[] = [
  {
    category: '📝 Titres',
    items: [
      { syntax: '# Titre 1', description: 'Titre principal (très grand)' },
      { syntax: '## Titre 2', description: 'Sous-titre (grand)' },
      { syntax: '### Titre 3', description: 'Sous-sous-titre (moyen)' },
    ],
  },
  {
    category: '✨ Mise en forme du texte',
    items: [
      { syntax: '**texte en gras**', description: 'Texte en gras' },
      { syntax: '*texte en italique*', description: 'Texte en italique' },
      { syntax: '***gras et italique***', description: 'Texte en gras et italique' },
      { syntax: '~~texte barré~~', description: 'Texte barré' },
      { syntax: '__souligné__', description: 'Texte souligné' },
      { syntax: '`code`', description: 'Code inline' },
    ],
  },
  {
    category: '🔗 Liens',
    items: [
      { syntax: '[Texte du lien](https://exemple.com)', description: 'Lien hypertexte' },
      { syntax: 'https://exemple.com', description: 'Lien automatique (Discord)' },
    ],
  },
  {
    category: '📋 Listes',
    items: [
      { syntax: '- Item 1\n- Item 2\n- Item 3', description: 'Liste à puces' },
      { syntax: '1. Premier\n2. Deuxième\n3. Troisième', description: 'Liste numérotée' },
    ],
  },
  {
    category: '💬 Citations',
    items: [
      { syntax: '> Citation', description: 'Citation simple' },
      { syntax: '>>> Citation\nmultiligne', description: 'Citation multiligne (Discord)' },
    ],
  },
  {
    category: '💻 Blocs de code',
    items: [
      { syntax: '```\nCode multiligne\n```', description: 'Bloc de code' },
      { syntax: '```python\nprint("Hello")\n```', description: 'Bloc de code avec syntaxe colorée' },
    ],
  },
  {
    category: '📐 Autres',
    items: [
      { syntax: '||texte caché||', description: 'Spoiler (Discord)' },
      { syntax: ':emoji:', description: 'Emoji (ex: :fire: pour 🔥)' },
    ],
  },
];

export const MARKDOWN_DOCS_URL = 'https://support.discord.com/hc/fr/articles/210298617';
