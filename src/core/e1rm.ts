import type { SetRow } from './types.ts';

export type LiftSet = Pick<SetRow, 'reps' | 'weight_kg' | 'is_warmup'>;
// §2 F7 / U-E1–E5: Epley only for working sets, reps 1–12; 1 rep is the base.
export function e1rm(set: LiftSet, kind: 'lift' | 'bw_lift' = 'lift', bodyweightKg?: number | null): number | null {
  if (set.is_warmup || !Number.isInteger(set.reps) || set.reps < 1 || set.reps > 12) return null;
  if (kind === 'bw_lift' && (bodyweightKg == null || !Number.isFinite(bodyweightKg) || bodyweightKg <= 0)) return null;
  const base = set.weight_kg + (kind === 'bw_lift' ? bodyweightKg ?? 0 : 0);
  if (!Number.isFinite(base) || base < 0) return null;
  return set.reps === 1 ? base : base * (1 + set.reps / 30);
}
