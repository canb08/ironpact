import { expect, it } from 'vitest';
import { doMinPlan, readinessCheck, roundDownLoadable, roundDownStep } from '../../../src/core/readiness.ts';
import { copy } from '../../../src/ui/copy.ts';
import type { Exercise, Readiness, Session, SetRow } from '../../../src/core/types.ts';
import { exercise, id, session, set } from './fixtures.ts';

const userId = set.user_id;

it('U-R1 sum 5 suggests MIN; sum 6 does not; skip = no suggestion', () => {
  expect(readinessCheck({ sleep: 1, soreness: 2, energy: 2 })).toEqual({ sum: 5, suggestMin: true });
  expect(readinessCheck({ sleep: 1, soreness: 1, energy: 1 })).toEqual({ sum: 3, suggestMin: true });
  expect(readinessCheck({ sleep: 2, soreness: 2, energy: 2 })).toEqual({ sum: 6, suggestMin: false });
  expect(readinessCheck({ sleep: 3, soreness: 3, energy: 3 })).toEqual({ sum: 9, suggestMin: false });
  expect(readinessCheck(null)).toEqual({ sum: null, suggestMin: false });
  const stored: Readiness = { sleep: 1, soreness: 1, energy: 3 };
  expect(readinessCheck(stored).suggestMin).toBe(true);
  expect(copy.readinessMin).toBe("Short on energy? Log a 10-minute MIN. It counts as half a session.");
  expect(copy.doMin).toBe("Log MIN");
  expect(copy.fullSend).toBe("Start workout");
});

it('rounds 90% down to a loadable barbell or to the exercise increment', () => {
  expect(roundDownLoadable(90)).toBe(90);
  expect(roundDownLoadable(74.25)).toBe(72.5);
  expect(roundDownLoadable(54)).toBe(52.5);
  expect(roundDownLoadable(20)).toBe(20);
  expect(roundDownLoadable(10)).toBe(0);
  expect(roundDownLoadable(0)).toBe(0);
  expect(roundDownLoadable(40, -1)).toBe(0);
  expect(roundDownLoadable(Number.NaN)).toBe(0);
  expect(roundDownLoadable(40, 20, [])).toBe(20);
  expect(roundDownLoadable(50, 20, [10, 0, 10])).toBe(40);
  expect(roundDownStep(9, 2.5)).toBe(7.5);
  expect(roundDownStep(-13.5, 2.5)).toBe(-15);
  expect(roundDownStep(9, 0)).toBe(0);
});

it('Do MIN is the first 2 exercises × 2 sets at 90%', () => {
  const bench = exercise;
  const squat: Exercise = { ...exercise, id: id(41), name: 'Squat', lower_body: true };
  const curl: Exercise = { ...exercise, id: id(44), name: 'Curl', increment_kg: 2 };
  const pull: Exercise = { ...exercise, id: id(45), name: 'Pull-up', kind: 'bw_lift', increment_kg: 2.5 };
  const parent: Session = { ...session, id: id(80), user_id: userId, started_at: '2026-10-20T08:00:00.000Z', local_date: '2026-10-20' };
  const empty: Session = { ...session, id: id(79), user_id: userId, started_at: '2026-10-27T08:00:00.000Z', local_date: '2026-10-27' };
  const gone: Session = { ...parent, id: id(78), deleted_at: parent.started_at, started_at: '2026-10-28T08:00:00.000Z' };
  const sets: SetRow[] = [
    { ...set, id: id(90), session_id: parent.id, exercise_id: id(99), set_index: 1, weight_kg: 20, reps: 8 },
    { ...set, id: id(91), session_id: parent.id, exercise_id: curl.id, set_index: 2, is_warmup: true, weight_kg: 10, reps: 10 },
    { ...set, id: id(92), session_id: parent.id, exercise_id: bench.id, set_index: 3, weight_kg: 100, reps: 5 },
    { ...set, id: id(93), session_id: parent.id, exercise_id: bench.id, set_index: 4, weight_kg: 100, reps: 5 },
    { ...set, id: id(94), session_id: parent.id, exercise_id: squat.id, set_index: 5, weight_kg: 80, reps: 5 },
    { ...set, id: id(95), session_id: parent.id, exercise_id: pull.id, set_index: 6, weight_kg: 10, reps: 6 },
    { ...set, id: id(96), session_id: gone.id, exercise_id: pull.id, weight_kg: 50, reps: 1 },
  ];
  const plan = doMinPlan({
    sessions: [empty, gone, parent], sets, exercises: [bench, squat, curl, pull], userId,
  });
  expect(plan.mode).toBe('min');
  expect(plan.blocks.map((block) => block.exercise_id)).toEqual([bench.id, squat.id]);
  expect(plan.blocks[0]?.sets).toEqual([
    { set_index: 1, weight_kg: 90, reps: 5, rpe: null, is_warmup: false },
    { set_index: 2, weight_kg: 90, reps: 5, rpe: null, is_warmup: false },
  ]);
  expect(plan.blocks[1]?.sets).toEqual([
    { set_index: 1, weight_kg: 70, reps: 5, rpe: null, is_warmup: false },
    { set_index: 2, weight_kg: 70, reps: 5, rpe: null, is_warmup: false },
  ]);

  const light = doMinPlan({
    sessions: [parent],
    sets: [
      { ...set, id: id(97), session_id: parent.id, exercise_id: curl.id, weight_kg: 16, reps: 8 },
      { ...set, id: id(98), session_id: parent.id, exercise_id: pull.id, set_index: 2, weight_kg: 10, reps: 6 },
    ],
    exercises: [curl, pull], userId,
  });
  expect(light.blocks[0]?.sets[0]?.weight_kg).toBe(14);
  expect(light.blocks[1]?.sets[0]?.weight_kg).toBe(7.5);
  expect(light.blocks[1]?.sets[1]?.weight_kg).toBe(7.5);
  expect(doMinPlan({ sessions: [], sets: [], exercises: [], userId }).blocks).toEqual([]);
});
