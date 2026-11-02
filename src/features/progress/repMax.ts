import { e1rm, type LiftSet } from '../../core/e1rm.ts';

export interface RepMaxRow {
  reps: number;
  /** Heaviest working weight at this exact rep count, or null when none exists. */
  actualKg: number | null;
  /** Local date of that heaviest set. */
  date: string | null;
  /** Weight the best e1RM implies at this rep count. Lifts only. */
  derivedKg: number | null;
}

export interface RepMaxSession {
  localDate: string;
  sets: readonly LiftSet[];
}

/** Epley inverted: the load whose estimate is `estimated`. 1 rep is the load itself. */
export function weightAtReps(estimated: number, reps: number): number {
  return reps <= 1 ? estimated : estimated / (1 + reps / 30);
}

/**
 * 1–12 rep-max table. Actual cells are the heaviest working set at that rep count.
 * The derived column is the best e1RM turned back into a weight (barbell lifts only).
 */
export function repMaxTable(
  history: readonly RepMaxSession[],
  kind: 'lift' | 'bw_lift',
  bodyweightKg: (localDate: string) => number | null,
): RepMaxRow[] {
  const best = new Map<number, { kg: number; date: string }>();
  let peak: number | null = null;
  for (const item of history) {
    const body = kind === 'bw_lift' ? bodyweightKg(item.localDate) : null;
    for (const set of item.sets) {
      if (set.is_warmup || !Number.isInteger(set.reps) || set.reps < 1 || set.reps > 12) continue;
      const current = best.get(set.reps);
      if (current == null || set.weight_kg > current.kg || (set.weight_kg === current.kg && item.localDate > current.date)) {
        best.set(set.reps, { kg: set.weight_kg, date: item.localDate });
      }
      const estimated = e1rm(set, kind, body);
      if (estimated != null && (peak == null || estimated > peak)) peak = estimated;
    }
  }
  const rows: RepMaxRow[] = [];
  for (let reps = 1; reps <= 12; reps += 1) {
    const cell = best.get(reps);
    rows.push({
      reps,
      actualKg: cell?.kg ?? null,
      date: cell?.date ?? null,
      derivedKg: kind === 'lift' && peak != null ? weightAtReps(peak, reps) : null,
    });
  }
  return rows;
}

/** One decimal, trailing zero dropped: 80 → "80", 82.5 → "82.5". */
export function formatKgCell(value: number): string {
  const rounded = Math.round((value + Number.EPSILON) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
