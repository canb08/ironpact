import { expect, it } from 'vitest';
import { session, set } from '../../core/fixtures.ts';
import { longestSharedStreak, monthBounds, plateStates, sessionsTogether, topSets, volumeKg } from '../../../../src/features/crew-feed/stats.ts';

it('keeps month totals inside the calendar month and draws one person of plates', () => {
  expect(monthBounds('2026-11-02')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  expect(monthBounds('2024-02-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  expect(sessionsTogether([['2026-10-31', '2026-11-02'], ['2026-11-02', '2026-11-03']], '2026-11-01', '2026-11-30')).toBe(2);
  expect(sessionsTogether([['2026-11-02', '2026-11-02'], ['2026-11-04']], '2026-11-01', '2026-11-30')).toBe(0);
  expect(volumeKg([
    { ...set, local_date: '2026-11-02', reps: 5, weight_kg: 80, is_warmup: false },
    { ...set, local_date: '2026-11-02', reps: 5, weight_kg: 100, is_warmup: true },
    { ...set, local_date: '2026-10-01', reps: 3, weight_kg: 200, is_warmup: false },
  ], '2026-11-01', '2026-11-30')).toBe(400);
  expect(plateStates(0, 3, 0)).toEqual(['empty', 'empty', 'empty']);
  expect(plateStates(1, 3, 0)).toEqual(['full', 'empty', 'empty']);
  expect(topSets([
    { ...set, exercise_id: 'squat', weight_kg: 100, reps: 5, is_warmup: false },
    { ...set, exercise_id: 'squat', weight_kg: 110, reps: 3, is_warmup: false },
    { ...set, exercise_id: 'bench', weight_kg: 80, reps: 5, is_warmup: true },
    { ...set, id: 'row', exercise_id: 'row', weight_kg: 60, reps: 8, is_warmup: false },
  ]).map((row) => row.exerciseId)).toEqual(['squat', 'row']);
});

it('counts the longest run of weeks both people trained', () => {
  const person = (user: string, dates: string[]) => ({
    target: 3,
    entries: {
      sessions: dates.map((date) => ({ ...session, id: `${user}-${date}`, user_id: user, local_date: date })),
      sets: dates.map((date) => ({ ...set, id: `set-${user}-${date}`, user_id: user, session_id: `${user}-${date}`, local_date: date })),
      cardio: [],
      martial: [],
      min: [],
    },
  });
  expect(longestSharedStreak([
    person('a', ['2026-10-20', '2026-10-27']),
    person('b', ['2026-10-21', '2026-10-28']),
  ], '2026-11-02')).toBe(2);
  expect(longestSharedStreak([
    person('a', ['2026-10-20', '2026-10-27']),
    person('b', ['2026-10-21']),
  ], '2026-11-02')).toBe(1);
  expect(longestSharedStreak([person('a', ['2026-11-02'])], '2026-11-02')).toBe(0);
});
