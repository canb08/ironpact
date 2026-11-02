import { expect, it } from 'vitest';
import type { Exercise, Session, SetRow } from '../../../../src/core/types.ts';
import { bestE1rmPerSession, chartGeometry, chartModel, trendWindow } from '../../../../src/features/stats/trend.ts';
import { exercise, id, session, set } from '../../core/fixtures.ts';
import { copy } from '../../../../src/ui/copy.ts';

const window = { from: '2026-08-17', to: '2026-11-02' };
const me = id(2);
const partner = id(20);

function at(sessionId: string, userId: string, date: string, started: string, patch: Partial<Session> = {}): Session {
  return { ...session, id: sessionId, user_id: userId, local_date: date, started_at: started, client_updated_at: started, ...patch };
}

function liftSet(setId: string, userId: string, sessionId: string, date: string, weight: number, reps: number, patch: Partial<SetRow> = {}): SetRow {
  return {
    ...set,
    id: setId,
    user_id: userId,
    session_id: sessionId,
    exercise_id: exercise.id,
    local_date: date,
    logged_at: `${date}T08:00:00.000Z`,
    client_updated_at: `${date}T08:00:00.000Z`,
    weight_kg: weight,
    reps,
    is_warmup: false,
    ...patch,
  };
}

it('covers the current ISO week and the 11 before it', () => {
  expect(trendWindow('2026-11-02')).toEqual({ from: '2026-08-17', to: '2026-11-02' });
  expect(trendWindow('2026-11-08')).toEqual({ from: '2026-08-17', to: '2026-11-08' });
});

it('keeps the best working-set e1RM per session inside the 12-week window', () => {
  const points = bestE1rmPerSession({
    userId: me,
    exerciseId: exercise.id,
    ...window,
    exercise,
    sessions: [
      at(id(30), me, '2026-09-01', '2026-09-01T08:00:00.000Z'),
      at(id(31), me, '2026-10-01', '2026-10-01T08:00:00.000Z'),
      at(id(32), me, '2026-08-01', '2026-08-01T08:00:00.000Z'),
      at(id(33), me, '2026-10-20', '2026-10-20T08:00:00.000Z', { deleted_at: '2026-10-21T08:00:00.000Z' }),
    ],
    sets: [
      liftSet(id(40), me, id(30), '2026-09-01', 80, 5),
      liftSet(id(41), me, id(30), '2026-09-01', 100, 5, { is_warmup: true }),
      liftSet(id(42), me, id(31), '2026-10-01', 90, 1),
      liftSet(id(43), me, id(31), '2026-10-01', 80, 10),
      liftSet(id(44), me, id(32), '2026-08-01', 200, 1),
      liftSet(id(45), me, id(33), '2026-10-20', 300, 1),
      liftSet(id(46), me, id(30), '2026-09-01', 70, 5, { deleted_at: '2026-09-02T08:00:00.000Z' }),
    ],
    bodyweights: [],
  });
  expect(points.map((point) => point.sessionId)).toEqual([id(30), id(31)]);
  expect(points[0]?.e1rm).toBeCloseTo(80 * (1 + 5 / 30));
  expect(points[1]?.e1rm).toBeCloseTo(80 * (1 + 10 / 30));
});

it('uses a bodyweight logged before the window for a bw lift', () => {
  const bw: Exercise = { ...exercise, id: id(50), kind: 'bw_lift', name: 'Pull-up' };
  const points = bestE1rmPerSession({
    userId: me,
    exerciseId: bw.id,
    ...window,
    exercise: bw,
    sessions: [
      at(id(51), me, '2026-09-01', '2026-09-01T08:00:00.000Z'),
      at(id(52), me, '2026-10-01', '2026-10-01T08:00:00.000Z'),
    ],
    sets: [
      liftSet(id(53), me, id(51), '2026-09-01', 10, 5, { exercise_id: bw.id }),
      liftSet(id(54), me, id(52), '2026-10-01', 15, 5, { exercise_id: bw.id }),
    ],
    bodyweights: [{
      ...set,
      id: id(55),
      user_id: me,
      local_date: '2026-07-01',
      weight_kg: 80,
      measured_at: '2026-07-01T07:00:00.000Z',
    }],
  });
  expect(points[0]?.e1rm).toBeCloseTo(90 * (1 + 5 / 30));
  expect(points).toHaveLength(2);
});

it('rebases both lines so each starts at 100%', () => {
  const mine = bestE1rmPerSession({
    userId: me,
    exerciseId: exercise.id,
    ...window,
    exercise,
    sessions: [
      at(id(60), me, '2026-09-01', '2026-09-01T08:00:00.000Z'),
      at(id(61), me, '2026-10-06', '2026-10-06T08:00:00.000Z'),
    ],
    sets: [
      liftSet(id(62), me, id(60), '2026-09-01', 60, 1),
      liftSet(id(63), me, id(61), '2026-10-06', 75, 1),
    ],
    bodyweights: [],
  });
  const theirs = bestE1rmPerSession({
    userId: partner,
    exerciseId: exercise.id,
    ...window,
    exercise,
    sessions: [
      at(id(64), partner, '2026-09-08', '2026-09-08T08:00:00.000Z'),
      at(id(65), partner, '2026-10-13', '2026-10-13T08:00:00.000Z'),
    ],
    sets: [
      liftSet(id(66), partner, id(64), '2026-09-08', 140, 1),
      liftSet(id(67), partner, id(65), '2026-10-13', 126, 1),
    ],
    bodyweights: [],
  });
  expect(mine[0]?.e1rm).toBe(60);
  expect(theirs[0]?.e1rm).toBe(140);
  expect(mine[0]?.e1rm).not.toBe(theirs[0]?.e1rm);

  const model = chartModel(mine, theirs, true);
  expect(model.mode).toBe('percent');
  expect(model.mine[0]?.value).toBe(100);
  expect(model.partner[0]?.value).toBe(100);
  expect(model.mine[1]?.value).toBeCloseTo(125);
  expect(model.partner[1]?.value).toBeCloseTo(90);
  expect(model.mine[0]?.raw).toBe(60);
  expect(model.partner[0]?.raw).toBe(140);
  expect(model.partner[0]?.value).not.toBe(model.partner[0]?.raw);

  const drawn = chartGeometry(model, window);
  expect(drawn.mine[0]?.y).toBeCloseTo(drawn.partner[0]?.y ?? Number.NaN);
  expect(drawn.partner[0]?.x).toBeGreaterThan(drawn.mine[0]?.x ?? 0);

  const alone = chartModel(mine, theirs, false);
  expect(alone.mode).toBe('kg');
  expect(alone.mine[0]?.value).toBe(60);
  expect(alone.partner).toEqual([]);
  expect(copy.emptyProgress).toBe('Two sessions and the lines start drawing.');
  expect(copy.progressShowPartner).toBe('Show {partner}');
});
