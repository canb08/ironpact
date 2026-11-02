import { expect, it } from 'vitest';
import type { PrEvent } from '../../../../src/data/adapter.ts';
import type { CardioEntry, MartialEntry, Session } from '../../../../src/core/types.ts';
import {
  disciplinesOf,
  formatPaceLabel,
  martialInWindow,
  runPrs,
  runsInWindow,
  weeklyDistance,
  weeklyMinutes,
} from '../../../../src/features/stats/activity.ts';
import { cardio, id, martial, session } from '../../core/fixtures.ts';

const window = { from: '2026-08-17', to: '2026-11-02' };
const me = id(2);

function at(sessionId: string, date: string, patch: Partial<Session> = {}): Session {
  return {
    ...session,
    id: sessionId,
    user_id: me,
    local_date: date,
    started_at: `${date}T08:00:00.000Z`,
    client_updated_at: `${date}T08:00:00.000Z`,
    ...patch,
  };
}

function run(n: number, sessionId: string, date: string, distanceM: number, durationS: number, patch: Partial<CardioEntry> = {}): CardioEntry {
  return {
    ...cardio,
    id: id(n),
    user_id: me,
    session_id: sessionId,
    local_date: date,
    logged_at: `${date}T08:00:00.000Z`,
    distance_m: distanceM,
    duration_s: durationS,
    deleted_at: null,
    ...patch,
  };
}

function mat(n: number, sessionId: string, date: string, discipline: string, minutes: number, patch: Partial<MartialEntry> = {}): MartialEntry {
  return {
    ...martial,
    id: id(n),
    user_id: me,
    session_id: sessionId,
    local_date: date,
    discipline,
    duration_min: minutes,
    logged_at: `${date}T08:00:00.000Z`,
    deleted_at: null,
    ...patch,
  };
}

it('sums run distance by ISO week and skips deleted or out-of-window rows', () => {
  const sessions = [
    at(id(30), '2026-08-20'),
    at(id(31), '2026-08-22'),
    at(id(32), '2026-10-01'),
    at(id(33), '2026-08-01'),
    at(id(34), '2026-09-10', { deleted_at: '2026-09-11T08:00:00.000Z' }),
  ];
  const runs = runsInWindow([
    run(40, id(30), '2026-08-20', 5000, 1500),
    run(41, id(31), '2026-08-22', 3000, 900),
    run(42, id(32), '2026-10-01', 10000, 3600),
    run(43, id(33), '2026-08-01', 40000, 9999),
    run(44, id(34), '2026-09-10', 8000, 2000),
    run(45, id(30), '2026-08-20', 1000, 300, { deleted_at: '2026-08-21T08:00:00.000Z' }),
  ], sessions, me, window);
  expect(runs.map((point) => point.distanceM)).toEqual([5000, 3000, 10000]);
  expect(runs[0]?.secondsPerKm).toBe(300);
  expect(formatPaceLabel(300)).toBe('5:00');
  const weeks = weeklyDistance(runs, window);
  expect(weeks).toHaveLength(12);
  expect(weeks[0]).toEqual({ weekStart: '2026-08-17', distanceM: 8000 });
  expect(weeks.find((week) => week.weekStart === '2026-09-28')).toEqual({ weekStart: '2026-09-28', distanceM: 10000 });
  expect(weeks.filter((week) => week.distanceM === 0).length).toBe(10);
  expect(weeks.some((week) => week.weekStart === '2026-08-10')).toBe(false);
});

it('groups martial minutes by discipline and week', () => {
  const sessions = [at(id(50), '2026-09-01'), at(id(51), '2026-09-08'), at(id(52), '2026-09-09')];
  const points = martialInWindow([
    mat(60, id(50), '2026-09-01', 'BJJ', 60),
    mat(61, id(51), '2026-09-08', 'BJJ', 30),
    mat(62, id(52), '2026-09-09', 'Boxing', 20),
    mat(63, id(50), '2026-09-01', 'BJJ', 90, { deleted_at: '2026-09-02T08:00:00.000Z' }),
  ], sessions, me, window);
  expect(disciplinesOf(points)).toEqual(['BJJ', 'Boxing']);
  const bjj = weeklyMinutes(points, 'BJJ', window);
  expect(bjj.find((week) => week.weekStart === '2026-08-31')).toEqual({ weekStart: '2026-08-31', minutes: 60 });
  expect(bjj.find((week) => week.weekStart === '2026-09-07')).toEqual({ weekStart: '2026-09-07', minutes: 30 });
  expect(weeklyMinutes(points, 'Boxing', window).find((week) => week.weekStart === '2026-09-07')?.minutes).toBe(20);
});

it('lists only live distance and pace marks inside the window', () => {
  const pr = (n: number, type: PrEvent['pr_type'], date: string, value: number, patch: Partial<PrEvent> = {}): PrEvent => ({
    id: id(n),
    user_id: me,
    local_date: date,
    client_updated_at: `${date}T08:00:00.000Z`,
    deleted_at: null,
    exercise_id: null,
    source_id: id(n + 1),
    pr_type: type,
    reps: null,
    value,
    previous_value: null,
    pct_over_previous: null,
    seen_by: [],
    ...patch,
  });
  const rows = runPrs([
    pr(70, 'distance', '2026-09-01', 10000),
    pr(71, 'pace', '2026-10-01', 300),
    pr(72, 'e1rm', '2026-10-01', 140),
    pr(73, 'distance', '2026-08-01', 5000),
    pr(74, 'pace', '2026-10-02', 280, { deleted_at: '2026-10-03T08:00:00.000Z' }),
  ], window);
  expect(rows.map((row) => row.id)).toEqual([id(70), id(71)]);
});
