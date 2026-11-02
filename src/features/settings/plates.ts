/** Kilogram plates a gym bag usually holds. Stored on `profiles.plates_kg`, heaviest first. */
export const STOCK_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5, 0.25] as const;

export function togglePlate(current: readonly number[], plate: number): number[] {
  const has = current.some((kg) => kg === plate);
  const next = has ? current.filter((kg) => kg !== plate) : [...current, plate];
  return next.filter((kg) => Number.isFinite(kg) && kg > 0).sort((a, b) => b - a);
}

/** Stock plates, then any custom weight already saved, so a toggle cannot drop it. */
export function listedPlates(current: readonly number[]): number[] {
  const extras = current.filter((kg) => Number.isFinite(kg) && !STOCK_PLATES_KG.some((stock) => stock === kg));
  return [...STOCK_PLATES_KG, ...extras];
}
