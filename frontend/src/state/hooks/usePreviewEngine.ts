import { useMemo, useState } from 'react';
import type { AdditionalTranslationLink, Template, VarConfig } from '../types';

function cleanGameLink(url: string): string {
  if (!url || !url.trim()) return url;

  const trimmed = url.trim();

  // Retirer les chevrons si présents (au cas où l'utilisateur les met manuellement)
  const cleaned = trimmed.replace(/^<|>$/g, '');

  // F95Zone - Nettoyer : garder threads/slug.ID/ et préserver #post-XXXXX si présent
  const f95Match = cleaned.match(/f95zone\.to\/threads\/([^\/#]+?)(?:\/post-\d+)?\/?(#post-\d+)?/);
  if (f95Match) {
    const segment = f95Match[1].replace(/\/$/, '');
    const hash = f95Match[2] || '';
    return `https://f95zone.to/threads/${segment}/${hash}`.replace(/\/+$/, (m) => (hash ? m : '/'));
  }

  // LewdCorner - Nettoyer : garder threads/slug.ID/ et préserver #post-XXXXX si présent
  const lewdMatch = cleaned.match(/lewdcorner\.com\/threads\/([^\/#]+?)(?:\/post-\d+)?\/?(#post-\d+)?/);
  if (lewdMatch) {
    const segment = lewdMatch[1].replace(/\/$/, '');
    const hash = lewdMatch[2] || '';
    return `https://lewdcorner.com/threads/${segment}/${hash}`.replace(/\/+$/, (m) => (hash ? m : '/'));
  }

  // Si aucun pattern reconnu, retourner l'URL nettoyée
  return cleaned;
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
  uploadedImages: Array<{ id: string; path?: string; url?: string; name: string; isMain: boolean }>;
  editingPostId: string | null;
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
    editingPostId
  } = props;

  const [previewOverride, setPreviewOverride] = useState<string | null>(null);

  const preview = useMemo(() => {
    const tpl = templates[currentTemplateIdx];
    if (!tpl) return '';

    let content = tpl.content;

    // 1. GESTION DU MOD COMPATIBLE
    const isModded = (inputs as any)['is_modded_game'] === true || (inputs as any)['is_modded_game'] === 'true';
    const modLink = cleanGameLink((inputs['Mod_link'] || '').trim());

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

    // 3. Remplacement des variables classiques
    allVarsConfig.forEach(varConfig => {
      const name = varConfig.name;
      if (name === 'is_modded_game') return;
      if (name === 'Mod_link' || name === 'Translate_link') return;

      const val = (inputs[name] || '').trim();
      let finalVal = val;

      // Nettoyer les liens (Game_link, Translate_link) à la volée
      if (name === 'Game_link' || name === 'Translate_link') {
        finalVal = cleanGameLink(val);
      }

      if (name === 'Overview' && val) {
        // Synopsis uniquement : préserver les retours à la ligne en blockquote "> "
        const lines = val.split('\n');
        finalVal = lines.length
          ? lines.map((line, i) => (i === 0 ? line : '> ' + line)).join('\n')
          : '';
      }

      content = content.split('[' + name + ']').join(finalVal || '[' + name + ']');
    });

    // 4. Remplacement de [Translation_Type]
    const displayTranslationType = isIntegrated
      ? `${translationType} (Intégrée)`
      : translationType;
    content = content.split('[Translation_Type]').join(displayTranslationType);

    // 5. Logique Smart Integrated (masquer lien traduction standard si intégré)
    if (isIntegrated) {
      content = content.replace(/^.*\[Translate_link\].*$/gm, '');
      content = content.replace(/\n\n\n+/g, '\n\n');
    }

    // [instruction] : bloc de type code (indépendant du synopsis)
    const instructionContent = (inputs['instruction'] || '').trim();
    const instructionBlock = instructionContent
      ? (() => {
        const instructionLines = instructionContent.split('\n').map(l => l.trim()).filter(Boolean);
        const numberedInstructions = instructionLines.map((l, index) => `${index + 1}. ${l}`).join('\n');
        return '```\nInstructions d\'installation :\n' + numberedInstructions + '\n```';
      })()
      : '';
    content = content.split('[instruction]').join(instructionBlock);
    content = content.split('[INVISIBLE_CHAR]').join('\u200B');

    // 6. Réduire les retours à la ligne multiples (garder au moins une ligne vide entre sections pour le preview Discord)
    content = content.replace(/\n\n\n+/g, '\n\n');

    // Ne pas ajouter le lien dans le preview - il sera ajouté uniquement lors de la publication
    // L'image sera affichée séparément via le composant PreviewImage
    return content;
  }, [templates, currentTemplateIdx, allVarsConfig, inputs, translationType, isIntegrated, additionalTranslationLinks, additionalModLinks, uploadedImages]);

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
