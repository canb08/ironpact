import type { Exercise, Uuid } from '../../core/types.ts';
import type { EntryBundle } from './bundle.ts';
import { bestE1rmPerSession, type SessionBest, type TrendWindow } from './trend.ts';

export interface LiftSeries {
  exercise: Exercise;
  mine: SessionBest[];
  partner: SessionBest[];
}

function seriesFor(
  userId: Uuid,
  exercise: Exercise,
  bundle: EntryBundle,
  window: TrendWindow,
): SessionBest[] {
  return bestE1rmPerSession({
    userId,
    exerciseId: exercise.id,
    from: window.from,
    to: window.to,
    exercise,
    sessions: bundle.sessions,
    sets: bundle.sets,
    bodyweights: bundle.bodyweight,
  });
}

/** Lifts the viewer has at least one e1RM for in the window, by name. */
export function liftSeries(input: {
  userId: Uuid;
  partnerId: Uuid | null;
  exercises: readonly Exercise[];
  window: TrendWindow;
  mine: EntryBundle;
  partner: EntryBundle | null;
}): LiftSeries[] {
  const lifts = input.exercises
    .filter((exercise) => exercise.deleted_at === null && (exercise.kind === 'lift' || exercise.kind === 'bw_lift'))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const rows: LiftSeries[] = [];
  for (const exercise of lifts) {
    const mine = seriesFor(input.userId, exercise, input.mine, input.window);
    if (mine.length === 0) continue;
    const partner = input.partnerId != null && input.partner != null
      ? seriesFor(input.partnerId, exercise, input.partner, input.window)
      : [];
    rows.push({ exercise, mine, partner });
  }
  return rows;
}
