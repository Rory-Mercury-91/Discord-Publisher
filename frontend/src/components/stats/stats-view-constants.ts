/** Palette pour graphiques (camemberts, barres) */
export const CHART_PALETTE = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#38bdf8', '#a78bfa', '#fb923c', '#34d399',
];

export function chartColor(i: number): string {
  return CHART_PALETTE[i % CHART_PALETTE.length];
}
