/** Site scan renseigné (label + URL) — affiche la note warning dans le message. */
export function hasScanSiteFilled(inputs: Record<string, string>): boolean {
  const label = (inputs.Scan_Site_Label || '').trim();
  const url = (inputs.Scan_Site_Link || '').trim();
  return !!label && !!url;
}
