import { TZDate } from '@date-fns/tz';
import { differenceInCalendarDays, getISODay } from 'date-fns';
import type { LocalDate, Session, SetRow, Uuid } from './types.ts';

// §2 F4 / AC4.1. "§4 §9" is AC4.1 (§10.0): the most recent sequence wins over
// "most often followed". Equal weekday counts use the later session, then id.
const WEEK_WINDOW_DAYS = 56;

export interface PrefillSet {
  weight_kg: number;
  reps: number;
  rpe: null;
}

export interface SessionHistory {
  sessions: readonly Session[];
  sets: readonly SetRow[];
  userId: Uuid;
  /** Open session: its own sets are not history. */
  excludeSessionId?: Uuid;
}

interface DatedSession {
  session: Session;
  sets: SetRow[];
}

function day(date: LocalDate): TZDate {
  return new TZDate(`${date}T00:00:00Z`, 'UTC');
}

/** Calendar days from earlier to later. Time is never read from the clock. */
export function daysBetween(earlier: LocalDate, later: LocalDate): number {
  return differenceInCalendarDays(day(later), day(earlier));
}

function byRecent(a: Session, b: Session): number {
  return b.started_at.localeCompare(a.started_at) || b.id.localeCompare(a.id);
}

function aliveSets(input: SessionHistory, session: Session): SetRow[] {
  return input.sets.filter((set) => set.session_id === session.id && set.user_id === input.userId
    && set.deleted_at === null);
}

function historySessions(input: SessionHistory): DatedSession[] {
  return input.sessions
    .filter((session) => session.user_id === input.userId && session.deleted_at === null
      && session.kind === 'gym' && session.id !== input.excludeSessionId)
    .map((session) => ({ session, sets: aliveSets(input, session) }))
    .filter((row) => row.sets.length > 0)
    .sort((a, b) => byRecent(a.session, b.session));
}

/** First appearance wins, warm-ups included: that is the order the session was done in. */
export function exerciseOrder(sets: readonly SetRow[]): Uuid[] {
  const rank = new Map<Uuid, { index: number; at: string }>();
  for (const set of sets) {
    if (set.deleted_at !== null) continue;
    const prev = rank.get(set.exercise_id);
    if (prev == null || set.set_index < prev.index || (set.set_index === prev.index && set.logged_at < prev.at)) {
      rank.set(set.exercise_id, { index: set.set_index, at: set.logged_at });
    }
  }
  return [...rank.entries()]
    .sort((a, b) => a[1].index - b[1].index || a[1].at.localeCompare(b[1].at) || a[0].localeCompare(b[0]))
    .map(([exerciseId]) => exerciseId);
}

function workingSets(sets: readonly SetRow[], exerciseId: Uuid): SetRow[] {
  return sets
    .filter((set) => set.exercise_id === exerciseId && !set.is_warmup && set.deleted_at === null)
    .sort((a, b) => a.set_index - b.set_index || a.logged_at.localeCompare(b.logged_at) || a.id.localeCompare(b.id));
}

/** Most recent gym session that has a working set of this exercise. */
export function lastWorkingSets(input: SessionHistory & { exerciseId: Uuid }): { session: Session; sets: SetRow[] } | null {
  for (const row of historySessions(input)) {
    const sets = workingSets(row.sets, input.exerciseId);
    if (sets.length > 0) return { session: row.session, sets };
  }
  return null;
}

/**
 * AC4.2: set n copies set n (kg, reps). RPE is cleared. Sets past the last
 * working set copy that last set. Warm-ups are not set numbers.
 */
export function prefillPlan(priorSets: readonly SetRow[], count: number): PrefillSet[] {
  const source = priorSets.filter((set) => !set.is_warmup && set.deleted_at === null)
    .sort((a, b) => a.set_index - b.set_index || a.logged_at.localeCompare(b.logged_at));
  if (count < 1 || source.length === 0) return [];
  const last = source[source.length - 1];
  if (last == null) return [];
  return Array.from({ length: count }, (_, index) => {
    const set = source[index] ?? last;
    return { weight_kg: set.weight_kg, reps: set.reps, rpe: null };
  });
}

export function prefillForExercise(input: SessionHistory & { exerciseId: Uuid; count: number }): PrefillSet[] {
  const last = lastWorkingSets(input);
  return last == null ? [] : prefillPlan(last.sets, input.count);
}

function weekdayFallback(input: SessionHistory & { today: LocalDate; except?: Uuid }): Uuid | null {
  const counts = new Map<Uuid, { sessions: number; latest: string }>();
  // historySessions is newest-first, so the first sighting is the latest one.
  for (const row of historySessions(input)) {
    if (daysBetween(row.session.local_date, input.today) > WEEK_WINDOW_DAYS) continue;
    if (daysBetween(row.session.local_date, input.today) < 0) continue;
    if (getISODay(day(row.session.local_date)) !== getISODay(day(input.today))) continue;
    for (const exerciseId of exerciseOrder(row.sets)) {
      if (exerciseId === input.except) continue;
      const prev = counts.get(exerciseId);
      if (prev == null) {
        counts.set(exerciseId, { sessions: 1, latest: `${row.session.local_date}T${row.session.started_at}` });
      } else prev.sessions += 1;
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1].sessions - a[1].sessions
    || b[1].latest.localeCompare(a[1].latest) || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] ?? null;
}

/** First exercise of a new gym session. Null opens the picker. */
export function guessOpeningExercise(input: SessionHistory & { today: LocalDate }): Uuid | null {
  const recent = historySessions(input)[0];
  const first = recent == null ? null : exerciseOrder(recent.sets)[0] ?? null;
  return first ?? weekdayFallback(input);
}

/**
 * Exercise that followed the current one, in order, in the most recent session
 * where it had a successor. Weekday frequency is only the fallback.
 */
export function guessNextExercise(input: SessionHistory & { currentExerciseId: Uuid; today: LocalDate }): Uuid | null {
  for (const row of historySessions(input)) {
    const order = exerciseOrder(row.sets);
    const index = order.indexOf(input.currentExerciseId);
    const next = index >= 0 ? order[index + 1] : undefined;
    if (next != null) return next;
  }
  return weekdayFallback({ ...input, except: input.currentExerciseId });
}

