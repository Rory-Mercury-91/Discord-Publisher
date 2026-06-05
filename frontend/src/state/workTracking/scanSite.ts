import type { AdditionalTranslationLink } from '../types';
import { hasAnyScanLink } from './scanLinks';

/** Au moins un lien scan (principal ou additionnel) — affiche la note warning. */
export function hasScanSiteFilled(
  inputs: Record<string, string>,
  additionalScanLinks: AdditionalTranslationLink[] = []
): boolean {
  return hasAnyScanLink(inputs, additionalScanLinks);
}
