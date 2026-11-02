import type { BodyweightEntry, LocalDate, Uuid } from '../../core/types.ts';
import { addLocalDays } from './calendar.ts';

/** Inclusive calendar window: the weigh-in day plus the six days before it. */
export const MOVING_AVERAGE_DAYS = 7;

export interface MovingAveragePoint {
  localDate: LocalDate;
  weightKg: number;
  /** Mean of the real weigh-ins in `[localDate - 6, localDate]`. Empty days are not invented. */
  averageKg: number;
  samples: number;
}

function later(candidate: BodyweightEntry, current: BodyweightEntry): boolean {
  if (candidate.measured_at !== current.measured_at) return candidate.measured_at > current.measured_at;
  return candidate.id > current.id;
}

/**
 * 7-day moving average of one person's body weight.
 * One point per real weigh-in (latest row if a date is repeated). Deleted rows, other users,
 * and non-positive weights are ignored. A day with no weigh-in is absent, not filled with a copy.
 */
export function movingAverage7(rows: readonly BodyweightEntry[], userId: Uuid): MovingAveragePoint[] {
  const byDate = new Map<LocalDate, BodyweightEntry>();
  for (const row of rows) {
    if (row.user_id !== userId || row.deleted_at !== null) continue;
    if (!Number.isFinite(row.weight_kg) || !(row.weight_kg > 0)) continue;
    const current = byDate.get(row.local_date);
    if (current == null || later(row, current)) byDate.set(row.local_date, row);
  }
  const points = [...byDate.values()].sort((a, b) => a.local_date.localeCompare(b.local_date) || a.id.localeCompare(b.id));
  return points.map((point) => {
    const start = addLocalDays(point.local_date, -(MOVING_AVERAGE_DAYS - 1));
    const sample = points.filter((row) => row.local_date >= start && row.local_date <= point.local_date);
    const sum = sample.reduce((total, row) => total + row.weight_kg, 0);
    return {
      localDate: point.local_date,
      weightKg: point.weight_kg,
      averageKg: sample.length === 0 ? point.weight_kg : sum / sample.length,
      samples: sample.length,
    };
  });
}
