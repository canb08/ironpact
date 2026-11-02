import { e1rm, type LiftSet } from '../../core/e1rm.ts';

export function bestE1rm(sets: readonly LiftSet[], kind: 'lift' | 'bw_lift', bodyweightKg?: number | null): number | null {
  let best: number | null = null;
  for (const set of sets) {
    const value = e1rm(set, kind, bodyweightKg);
    if (value === null) continue;
    if (best === null || value > best) best = value;
  }
  return best;
}

export function formatE1rm(value: number): string {
  return (Math.round((value + Number.EPSILON) * 10) / 10).toFixed(1);
}
