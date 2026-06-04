import { useMemo, useState } from 'react';
import {
  getCalendarLinkParts,
  getWebtoonWorkStatusFromTags,
} from '../calendarTemplate';
import { formatVarValue, resolveStoredDateValue } from '../logic/formatVar';
import type { AdditionalTranslationLink, Tag, Template, VarConfig } from '../types';

/** Même logique qu’appContext : conserver la forme (#post-XXXXX ou /post-XXXXX), ne rien ajouter si absent. */
function cleanGameLink(url: string): string {
  if (!url || !url.trim()) return url;
  const trimmed = url.trim().replace(/^<|>$/g, '');
  const f95Match = trimmed.match(/f95zone\.to\/threads\/([^\/#]+)(?:\/(post-\d+))?(?:\/)?(#post-\d+)?/);
  if (f95Match) {
    const segment = f95Match[1];
    const postPath = f95Match[2];
    const postHash = f95Match[3];
    const suffix = postHash || (postPath ? `/${postPath}` : '');
    const id = segment.includes('.') ? (segment.match(/\.(\d+)$/)?.[1] ?? segment) : segment;
    const base = `https://f95zone.to/threads/${id}/`;
    return base + (suffix.startsWith('/') ? suffix.slice(1) : suffix);
  }
  const lewdMatch = trimmed.match(/lewdcorner\.com\/threads\/([^\/#]+)(?:\/(post-\d+))?(?:\/)?(#post-\d+)?/);
  if (lewdMatch) {
    const segment = lewdMatch[1];
    const postPath = lewdMatch[2];
    const postHash = lewdMatch[3];
    const suffix = postHash || (postPath ? `/${postPath}` : '');
    const id = segment.includes('.') ? (segment.match(/\.(\d+)$/)?.[1] ?? segment) : segment;
    const base = `https://lewdcorner.com/threads/${id}/`;
    return base + (suffix.startsWith('/') ? suffix.slice(1) : suffix);
  }
  return trimmed;
}

type UsePreviewEngineProps = {
  templates: Template[];
  currentTemplateIdx: number;
  allVarsConfig: VarConfig[];
  inputs: Record<string, string>;
  translationType: string;
  isIntegrated: boolean;
  additionalTranslationLinks: AdditionalTranslationLink[];
  additionalModLinks: AdditionalTranslationLink[];
  uploadedImages: Array<{ id: string; url?: string; name: string; isMain: boolean }>;
  editingPostId: string | null;
  postTags?: string;
  savedTags?: Tag[];
};

export function usePreviewEngine(props: UsePreviewEngineProps) {
  const {
    templates,
    currentTemplateIdx,
    allVarsConfig,
    inputs,
    translationType,
    isIntegrated,
    additionalTranslationLinks,
    additionalModLinks,
    uploadedImages,
    editingPostId,
    postTags = '',
    savedTags = [],
  } = props;

  const [previewOverride, setPreviewOverride] = useState<string | null>(null);

  const preview = useMemo(() => {
    const tpl = templates[currentTemplateIdx];
    if (!tpl) return '';

    let content = tpl.content;

    // 1. GESTION DU MOD COMPATIBLE
    const isModded = (inputs as any)['is_modded_game'] === true || (inputs as any)['is_modded_game'] === 'true';

    // Dans "Infos du Mod", afficher juste "Oui" ou "Non"
    const moddedText = isModded ? 'Oui' : 'Non';

    // Remplace le tag [is_modded_game] dans le texte
    content = content.split('[is_modded_game]').join(moddedText);

    // 2. Construction des lignes MOD et TRADUCTION (affichées en ligne, séparées par " - ")
    const mainModLabel = (inputs['main_mod_label'] || 'Mod').trim() || 'Mod';
    const mainTranslationLabel = (inputs['main_translation_label'] || 'Traduction').trim() || 'Traduction';
    const modLinkUrl = cleanGameLink((inputs['Mod_link'] || '').trim());
    const translateLinkUrl = cleanGameLink((inputs['Translate_link'] || '').trim());

    // Affichage de la ligne mod dans le template : uniquement si au moins un lien est renseigné (URL ou additionnels).
    // La checkbox "Mod compatible" gère seulement Oui/Non dans les Infos du Jeu.
    const modParts: string[] = [];
    if (modLinkUrl) {
      modParts.push(`[${mainModLabel}](<${modLinkUrl}>)`);
    }
    additionalModLinks
      .filter(link => link.label.trim() && link.link.trim())
      .forEach(link => modParts.push(`[${link.label.trim()}](<${cleanGameLink(link.link.trim())}>)`));
    const modLinksLine = modParts.length > 0 ? `   * ${modParts.join(' - ')}` : '';

    const translationParts: string[] = [];
    if (translateLinkUrl) {
      translationParts.push(`[${mainTranslationLabel}](<${translateLinkUrl}>)`);
    }
    additionalTranslationLinks
      .filter(link => link.label.trim() && link.link.trim())
      .forEach(link => translationParts.push(`[${link.label.trim()}](<${cleanGameLink(link.link.trim())}>)`));
    const translationLinksLine = translationParts.length > 0 ? `   * ${translationParts.join(' - ')}` : '';

    content = content.split('[MOD_LINKS_LINE]').join(modLinksLine);
    // Si traduction intégrée ET aucun lien de traduction : masquer toute la section "3. Traductions"
    const hideTranslationsSection = isIntegrated && translationParts.length === 0;
    if (hideTranslationsSection) {
      content = content.replace(/3\. :link: \*\*Traductions\*\*\n\[TRANSLATION_LINKS_LINE\]\n?/g, '');
    } else {
      content = content.split('[TRANSLATION_LINKS_LINE]').join(translationLinksLine);
    }

    // 3. Synopsis : blocs optionnels
    const overviewRaw = (inputs['Overview'] || '').trim();
    if (!overviewRaw) {
      content = content.replace(/\*\*Synopsis du jeu :\*\*\n> \[Overview\]\n?/g, '');
    }
    const synopsisOeuvreRaw = (inputs['Synopsis_Oeuvre'] || '').trim();
    if (!synopsisOeuvreRaw) {
      content = content.replace(/\*\*Synopsis :\*\*\n> \[Synopsis_Oeuvre\]\n?/g, '');
    }

    if (tpl.type === 'calendar') {
      const selectedTagIds = postTags
        ? postTags.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      const workStatus = getWebtoonWorkStatusFromTags(selectedTagIds, savedTags);
      const isFinalWorkStatus = workStatus !== 'ongoing';

      if (workStatus === 'terminated') {
        content = content.replace(
          /Statut actuel : Chapitre \[Chapitre_Actuel\] \(Dernier disponible gratuitement\)\n?/g,
          'Statut actuel : Chapitre [Chapitre_Fin] (Série terminée)\n'
        );
      } else if (workStatus === 'abandoned') {
        content = content.replace(
          /Statut actuel : Chapitre \[Chapitre_Actuel\] \(Dernier disponible gratuitement\)\n?/g,
          'Statut actuel : Chapitre [Chapitre_Fin] (Série abandonnée)\n'
        );
      }

      if (isFinalWorkStatus) {
        content = content.replace(
          /:calendar: \*\*Prochaines disponibilités \(gratuite\)\*\*\n\* \*\*Prochain chapitre :\*\* \[Chapitre_Suivant\] — \[Date_Suivant\]\n\* \*\*Fin de série :\*\* chapitre \[Chapitre_Fin\] — \[Date_Fin\]\n?/g,
          ''
        );
      }

      const hasNext =
        !isFinalWorkStatus &&
        ((inputs['Chapitre_Suivant'] || '').trim() ||
          resolveStoredDateValue(inputs['Date_Suivant'] || '').trim());
      const hasEnd =
        !isFinalWorkStatus &&
        ((inputs['Chapitre_Fin'] || '').trim() ||
          resolveStoredDateValue(inputs['Date_Fin'] || '').trim());
      if (!hasNext) {
        content = content.replace(
          /\* \*\*Prochain chapitre :\*\* \[Chapitre_Suivant\] — \[Date_Suivant\]\n?/g,
          ''
        );
      }
      if (!hasEnd) {
        content = content.replace(
          /\* \*\*Fin de série :\*\* chapitre \[Chapitre_Fin\] — \[Date_Fin\]\n?/g,
          ''
        );
      }
      if (!hasNext && !hasEnd) {
        content = content.replace(
          /:calendar: \*\*Prochaines disponibilités \(gratuite\)\*\*\n?/g,
          ''
        );
      }
      const calendarLinkParts = getCalendarLinkParts(inputs)
        .map(p => ({ label: p.label, url: cleanGameLink(p.url) }))
        .filter(p => p.url);
      if (calendarLinkParts.length === 0) {
        content = content.replace(/:link: \*\*Lien\*\*\n\[CALENDAR_LINKS_LINE\]\n?/g, '');
        content = content.replace(/:link: \*\*Liens\*\*\n\[CALENDAR_LINKS_LINE\]\n?/g, '');
        content = content.replace(
          /:link: \*\*Lien officiel\*\*\n\* \[\[Book_Platform\]\]\(<\[Book_Link\]>\)\n?/g,
          ''
        );
      } else {
        const heading = calendarLinkParts.length >= 2 ? 'Liens' : 'Lien';
        const linksLine = `* ${calendarLinkParts.map(p => `[${p.label}](<${p.url}>)`).join(' - ')}`;
        content = content
          .replace(/:link: \*\*Lien\*\*\n\[CALENDAR_LINKS_LINE\]/g, `:link: **${heading}**\n${linksLine}`)
          .replace(/:link: \*\*Liens\*\*\n\[CALENDAR_LINKS_LINE\]/g, `:link: **${heading}**\n${linksLine}`);
      }
    }

    // 4. Remplacement des variables classiques
    allVarsConfig.forEach(varConfig => {
      const name = varConfig.name;
      if (name === 'is_modded_game') return;
      if (name === 'Mod_link' || name === 'Translate_link') return;
      if (name === 'Overview' || name === 'Synopsis_Oeuvre') return;

      const val = (inputs[name] || '').trim();
      const useDiscordDate =
        tpl.type === 'calendar' && varConfig.type === 'date';
      let finalVal = formatVarValue(val, varConfig.type, {
        discordTimestamp: useDiscordDate,
      });

      if (
        name === 'Game_link' ||
        name === 'Translate_link' ||
        name === 'Book_Link' ||
        name === 'Official_Site_Link' ||
        name === 'Scan_Site_Link'
      ) {
        finalVal = cleanGameLink(val);
      }
      content = content.split('[' + name + ']').join(finalVal || '[' + name + ']');
    });
    const applyBlockquoteSynopsis = (raw: string, tag: string) => {
      if (!raw) return;
      const lines = raw.split('\n');
      const final = lines.length ? lines.map((line, i) => (i === 0 ? line : '> ' + line)).join('\n') : '';
      content = content.split('[' + tag + ']').join(final || '[' + tag + ']');
    };
    applyBlockquoteSynopsis(overviewRaw, 'Overview');
    applyBlockquoteSynopsis(synopsisOeuvreRaw, 'Synopsis_Oeuvre');

    if (tpl.type === 'calendar') {
      const tagIds = postTags ? postTags.split(',').map(s => s.trim()).filter(Boolean) : [];
      const workStatus = getWebtoonWorkStatusFromTags(tagIds, savedTags);
      if (workStatus !== 'ongoing') {
        const dateFinRaw = resolveStoredDateValue(inputs['Date_Fin'] || '').trim();
        if (dateFinRaw) {
          const dateFinFormatted = formatVarValue(dateFinRaw, 'date', { discordTimestamp: true });
          if (dateFinFormatted) {
            content = content.replace(
              /(Statut actuel : Chapitre [^\n]+)\n/,
              `$1 — ${dateFinFormatted}\n`
            );
          }
        }
      }
    }

    // 5. Remplacement de [Translation_Type]
    const displayTranslationType = isIntegrated
      ? `${translationType} (Intégrée)`
      : translationType;
    content = content.split('[Translation_Type]').join(displayTranslationType);

    // 6. Logique Smart Integrated (masquer lien traduction standard si intégré)
    if (isIntegrated) {
      content = content.replace(/^.*\[Translate_link\].*$/gm, '');
      content = content.replace(/\n\n\n+/g, '\n\n');
    }

    // [instruction] : bloc dans un cadre noir (code block) avec titre + liste numérotée
    const instructionContent = (inputs['instruction'] || '').trim();
    const instructionBlock = instructionContent
      ? (() => {
        // Découper sur " 2. ", " 3. " ou ".2. ", ".3. " (sans espace après le point)
        const normalized = instructionContent
          .replace(/\.(\d{1,3})\.\s+/g, '.\n$1. ')
          .replace(/\s+(\d{1,3})\.\s+/g, '\n$1. ');
        const instructionLines = normalized.split('\n').map(l => l.trim()).filter(Boolean);
        const numberedInstructions = instructionLines
          .map((l, i) => (/^\d+\.\s/.test(l) ? l : `${i + 1}. ${l}`))
          .join('\n');
        return '```\nInstructions d\'installation :\n\n' + numberedInstructions + '\n```';
      })()
      : '';
    content = content.split('[instruction]').join(instructionBlock);
    content = content.split('[INVISIBLE_CHAR]').join('\u200B');

    // 7. Réduire les retours à la ligne multiples (conserver une ligne vide entre sections)
    content = content.replace(/\n\n\n+/g, '\n\n');

    // Garder « Version du jeu » et « Version traduite » sur la même ligne (éviter bloc en dessous)
    content = content.replace(/\*\*Version du jeu :\*\*\s*```\s*\n?([^`]*?)\n?```/g, (_, val) => `**Version du jeu :** \`${(val || '').trim()}\``);
    content = content.replace(/\*\*Version traduite :\*\*\s*```\s*\n?([^`]*?)\n?```/g, (_, val) => `**Version traduite :** \`${(val || '').trim()}\``);
    content = content.replace(/\*\*Version du jeu :\*\*[\s\n]*`/g, '**Version du jeu :** `');
    content = content.replace(/\*\*Version traduite :\*\*[\s\n]*`/g, '**Version traduite :** `');

    // Ne pas ajouter le lien dans le preview - il sera ajouté uniquement lors de la publication
    // L'image sera affichée séparément via le composant PreviewImage
    return content;
  }, [
    templates,
    currentTemplateIdx,
    allVarsConfig,
    inputs,
    translationType,
    isIntegrated,
    additionalTranslationLinks,
    additionalModLinks,
    uploadedImages,
    postTags,
    savedTags,
  ]);

  /** Preview effectif : contenu saisi si non vide, sinon rendu template + variables (affichage et publication). */
  // En mode édition, utiliser toujours le preview recalculé (pas previewOverride figé)
  const effectivePreview = editingPostId
    ? preview
    : ((previewOverride != null && previewOverride !== '') ? previewOverride : preview);

  return {
    preview: effectivePreview,
    previewOverride,
    setPreviewOverride
  };
}
