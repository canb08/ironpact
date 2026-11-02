import { expect, it } from 'vitest';
import { daysBetween, guessNextExercise, guessOpeningExercise, prefillForExercise, prefillPlan } from '../../../src/core/prefill.ts';
import type { Exercise, Session, SetRow } from '../../../src/core/types.ts';
import { exercise, id, session, set } from './fixtures.ts';

const userId = set.user_id;
const today = '2026-11-02';

function gym(n: number, started: string, local: string, extra: Partial<Session> = {}): Session {
  return { ...session, id: id(n), user_id: userId, started_at: started, local_date: local, client_updated_at: started, ...extra };
}
function logged(n: number, parent: Session, exerciseId: string, extra: Partial<SetRow> = {}): SetRow {
  return {
    ...set, id: id(n), user_id: userId, session_id: parent.id, exercise_id: exerciseId,
    local_date: parent.local_date, logged_at: parent.started_at, client_updated_at: parent.started_at,
    weight_kg: 80, reps: 5, rpe: 9, is_warmup: false, set_index: 1, ...extra,
  };
}

const bench = exercise.id;
const squat: Exercise = { ...exercise, id: id(41), name: 'Squat', lower_body: true };
const row: Exercise = { ...exercise, id: id(42), name: 'Row' };
const dead: Exercise = { ...exercise, id: id(43), name: 'Deadlift', lower_body: true };

it('U-F1 next exercise from last session with same first exercise', () => {
  const older = gym(80, '2026-10-12T08:00:00.000Z', '2026-10-12');
  const newer = gym(81, '2026-10-26T08:00:00.000Z', '2026-10-26');
  const open = gym(82, '2026-11-02T08:00:00.000Z', today);
  const sets = [
    logged(100, older, bench),
    logged(101, older, squat.id, { set_index: 2, logged_at: '2026-10-12T08:10:00.000Z' }),
    logged(102, older, row.id, { set_index: 3, logged_at: '2026-10-12T08:20:00.000Z' }),
    logged(103, newer, bench),
    logged(104, newer, row.id, { set_index: 2, logged_at: '2026-10-26T08:10:00.000Z' }),
    logged(105, open, bench),
  ];
  const history = { sessions: [older, newer, open], sets, userId, today, excludeSessionId: open.id };
  expect(guessOpeningExercise(history)).toBe(bench);
  // Most recent sequence wins over the older, more common Bench → Squat pair.
  expect(guessNextExercise({ ...history, currentExerciseId: bench })).toBe(row.id);
  expect(guessNextExercise({ ...history, currentExerciseId: row.id })).toBe(bench);
});

it('U-F2 fallback: most frequent for weekday over 8 weeks', () => {
  const monday = (n: number, local: string, exerciseId: string) => {
    const parent = gym(n, `${local}T08:00:00.000Z`, local);
    return { parent, set: logged(n + 50, parent, exerciseId) };
  };
  const rows = [
    monday(10, '2026-10-26', bench),
    monday(11, '2026-10-19', bench),
    monday(12, '2026-10-12', squat.id),
    monday(13, '2026-09-07', bench),
    monday(14, '2026-08-31', squat.id),
  ];
  const tuesday = gym(15, '2026-10-27T08:00:00.000Z', '2026-10-27');
  const history = {
    sessions: [...rows.map((row) => row.parent), tuesday],
    sets: [...rows.map((row) => row.set), logged(90, tuesday, squat.id)],
    userId, today,
  };
  // Tuesday is the most recent session, so it wins the opening guess.
  // Monday frequency is the fallback only, and 2026-08-31 is outside 8 weeks.
  expect(guessOpeningExercise(history)).toBe(squat.id);
  expect(guessNextExercise({ ...history, currentExerciseId: dead.id })).toBe(bench);
  expect(daysBetween('2026-09-07', today)).toBe(56);
  expect(daysBetween('2026-08-31', today)).toBe(63);
});

it('ties: equal weekday frequency uses the more recent exercise, then the smaller id', () => {
  const pairs: [string, string][] = [
    ['2026-10-26', squat.id],
    ['2026-10-19', bench],
    ['2026-10-12', squat.id],
    ['2026-10-05', bench],
  ];
  const sessions: Session[] = [];
  const sets: SetRow[] = [];
  pairs.forEach(([local, exerciseId], index) => {
    const parent = gym(200 + index, `${local}T08:00:00.000Z`, local);
    sessions.push(parent);
    sets.push(logged(300 + index, parent, exerciseId));
  });
  expect(guessNextExercise({
    sessions, sets, userId, today, currentExerciseId: dead.id,
  })).toBe(squat.id);

  const sameDay = gym(210, '2026-10-26T08:00:00.000Z', '2026-10-26');
  const otherDay = gym(211, '2026-10-19T08:00:00.000Z', '2026-10-19');
  expect(guessNextExercise({
    sessions: [sameDay, otherDay],
    sets: [
      logged(320, sameDay, bench),
      logged(321, sameDay, squat.id, { set_index: 2 }),
      logged(322, otherDay, bench),
      logged(323, otherDay, squat.id, { set_index: 2 }),
    ],
    userId, today, currentExerciseId: dead.id,
  })).toBe(bench);
});

it('opening guess breaks a same-time tie by session id and is null when nothing qualifies', () => {
  const started = '2026-10-26T08:00:00.000Z';
  const low = gym(30, started, '2026-10-26');
  const high = gym(31, started, '2026-10-26');
  expect(guessOpeningExercise({
    sessions: [low, high],
    sets: [logged(70, low, bench), logged(71, high, squat.id)],
    userId, today,
  })).toBe(squat.id);
  expect(guessOpeningExercise({ sessions: [], sets: [], userId, today })).toBeNull();
  expect(guessNextExercise({ sessions: [], sets: [], userId, today, currentExerciseId: bench })).toBeNull();
});

it('U-F3 set n prefilled from set n; extra sets copy last', () => {
  const older = gym(60, '2026-10-01T08:00:00.000Z', '2026-10-01');
  const newer = gym(61, '2026-10-20T08:00:00.000Z', '2026-10-20');
  const dropped = gym(62, '2026-10-27T08:00:00.000Z', '2026-10-27', { deleted_at: newer.started_at });
  const open = gym(63, '2026-11-02T08:00:00.000Z', today);
  const sets = [
    logged(400, older, bench, { weight_kg: 60, reps: 8 }),
    logged(401, newer, bench, { weight_kg: 80, reps: 5, rpe: 9, set_index: 2 }),
    logged(402, newer, bench, { weight_kg: 40, reps: 10, is_warmup: true, set_index: 1 }),
    logged(403, newer, bench, { weight_kg: 85, reps: 3, set_index: 3, deleted_at: newer.started_at }),
    logged(404, newer, bench, { weight_kg: 82.5, reps: 5, set_index: 4 }),
    logged(405, dropped, bench, { weight_kg: 200, reps: 1 }),
    logged(406, open, bench, { weight_kg: 1, reps: 1 }),
  ];
  const plan = prefillForExercise({
    sessions: [older, newer, dropped, open], sets, userId, exerciseId: bench, count: 4, excludeSessionId: open.id,
  });
  expect(plan).toEqual([
    { weight_kg: 80, reps: 5, rpe: null },
    { weight_kg: 82.5, reps: 5, rpe: null },
    { weight_kg: 82.5, reps: 5, rpe: null },
    { weight_kg: 82.5, reps: 5, rpe: null },
  ]);
  expect(prefillPlan([], 3)).toEqual([]);
  expect(prefillForExercise({
    sessions: [newer], sets, userId, exerciseId: squat.id, count: 2,
  })).toEqual([]);
  expect(prefillPlan(sets, 0)).toEqual([]);
});
