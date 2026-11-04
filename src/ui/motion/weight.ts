import { SPRING_MS } from './springs';

/** Same HEAVY spring, slower for a heavier load. MINs remain light. */
export function weightDuration(weightKg = 20): number {
  const kg = Number.isFinite(weightKg) ? Math.max(0, weightKg) : 20;
  return Math.round(SPRING_MS.heavy * (0.7 + Math.min(200, kg) / 200));
}

export function barBend(weightKg: number): number {
  return Math.min(8, Math.max(0, Number.isFinite(weightKg) ? weightKg : 0) / 25);
}
