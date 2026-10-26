import type { LiftSet } from './e1rm.ts';

// §2 F7 / B2: working-set tonnage. BW uses added load unless a bodyweight is supplied.
// Assisted loads retain their sign when bodyweight is unknown; no BW is invented.
export function volume(sets: readonly LiftSet[], kind: 'lift' | 'bw_lift' = 'lift', bodyweightKg?: number | null): number {
  return sets.reduce((sum, set) => set.is_warmup ? sum
    : sum + set.reps * (set.weight_kg + (kind === 'bw_lift' ? bodyweightKg ?? 0 : 0)), 0);
}
