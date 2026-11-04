export const DOCK_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

/** Presentation of the current load; never round or change a typed/scrubbed value. */
export function sleevePlates(kg: number, barKg: number, available: readonly number[]): number[] {
  if (!Number.isFinite(kg) || kg < barKg) return [];
  let remaining = Math.round((kg - barKg) * 500);
  const result: number[] = [];
  for (const plate of [...new Set(available.filter((value) => Number.isFinite(value) && value >= .001))].sort((a, b) => b - a)) {
    const grams = Math.round(plate * 1000);
    while (remaining >= grams && result.length < 100) {
      result.push(plate);
      remaining -= grams;
    }
  }
  return result;
}

export function plateColour(kg: number): string {
  if (kg === 25 || kg === 2.5) return 'var(--plate-red)';
  if (kg === 20 || kg === 1.25) return 'var(--plate-blue)';
  if (kg === 15) return 'var(--plate-yellow)';
  if (kg === 10) return 'var(--plate-green)';
  return 'var(--chalk)';
}
