/** Display only. Credit totals come from core/credits.ts. */
export function formatWeekText(credits: number, target: number, minCount: number): string {
  const shown = Number.isInteger(credits) ? String(credits) : credits.toFixed(1);
  return `${shown}/${target} · ${minCount} MIN`;
}
