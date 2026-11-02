import type { Exercise, LocalDate, Session, SetRow, Uuid } from './types.ts';
import { daysBetween, lastWorkingSets, type SessionHistory } from './prefill.ts';

// §2 F5 / §1.6 D10. Gap is calendar days between local dates, not instants.
const GAP_DAYS = 14;

export interface Nudge {
  incrementKg: number;
  /** Opening stepper weight: the first working set, not the last. */
  fromKg: number;
  nextKg: number;
  /** `rpe` = some RPE was logged and the max was ≤8. `reps` = no RPE at all. */
  reason: 'rpe' | 'reps';
}

export type NudgeCopyKey =
  | 'progressionNudge'
  | 'progressionNoRpe'
  | 'progressionBig'
  | 'progressionBigNoRpe'
  | 'progressionAdd'
  | 'progressionAddNoRpe';

function formatKg(kg: number): string {
  const rounded = Math.round(kg * 1000) / 1000;
  return String(rounded);
}

export function formatNudgeChip(nudge: Nudge): string {
  return `+${formatKg(nudge.incrementKg)} → ${formatKg(nudge.nextKg)}`;
}

/** Which `copy.ts` sentence P2D should show. 2.5 and 5 keep the spec wording. */
export function nudgeCopyKey(nudge: Nudge): NudgeCopyKey {
  if (nudge.incrementKg === 5) return nudge.reason === 'rpe' ? 'progressionBig' : 'progressionBigNoRpe';
  if (nudge.incrementKg === 2.5) return nudge.reason === 'rpe' ? 'progressionNudge' : 'progressionNoRpe';
  return nudge.reason === 'rpe' ? 'progressionAdd' : 'progressionAddNoRpe';
}

function isBigJump(exercise: Pick<Exercise, 'lower_body' | 'category'>, bigJumps: boolean): boolean {
  return bigJumps && exercise.lower_body && exercise.category === 'compound';
}

/**
 * D10: every working set hit `rep_target`, and max logged RPE ≤8 or RPE was
 * absent. No nudge after more than 14 days. Big jumps are +5 kg, not 2× increment.
 * The chip is never applied by this function.
 */
export function progressionNudge(input: {
  exercise: Pick<Exercise, 'rep_target' | 'increment_kg' | 'lower_body' | 'category'>;
  sets: readonly SetRow[];
  lastLocalDate: LocalDate;
  today: LocalDate;
  bigJumps: boolean;
}): Nudge | null {
  if (daysBetween(input.lastLocalDate, input.today) > GAP_DAYS) return null;
  const working = input.sets.filter((set) => !set.is_warmup && set.deleted_at === null);
  if (working.length === 0) return null;
  if (working.some((set) => set.reps < input.exercise.rep_target)) return null;
  const logged = working.flatMap((set) => set.rpe == null ? [] : [set.rpe]);
  if (logged.some((rpe) => rpe > 8)) return null;
  const incrementKg = isBigJump(input.exercise, input.bigJumps) ? 5 : input.exercise.increment_kg;
  if (!Number.isFinite(incrementKg) || incrementKg <= 0) return null;
  const first = [...working].sort((a, b) => a.set_index - b.set_index || a.logged_at.localeCompare(b.logged_at))[0];
  if (first == null) return null;
  return {
    incrementKg,
    fromKg: first.weight_kg,
    nextKg: Math.round((first.weight_kg + incrementKg) * 1000) / 1000,
    reason: logged.length === 0 ? 'reps' : 'rpe',
  };
}

export function progressionForExercise(input: SessionHistory & {
  exercise: Pick<Exercise, 'id' | 'rep_target' | 'increment_kg' | 'lower_body' | 'category'> & { id: Uuid };
  today: LocalDate;
  bigJumps: boolean;
  sessions: readonly Session[];
  sets: readonly SetRow[];
}): Nudge | null {
  const last = lastWorkingSets({ ...input, exerciseId: input.exercise.id });
  if (last == null) return null;
  return progressionNudge({
    exercise: input.exercise,
    sets: last.sets,
    lastLocalDate: last.session.local_date,
    today: input.today,
    bigJumps: input.bigJumps,
  });
}
