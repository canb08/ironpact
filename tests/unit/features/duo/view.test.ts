import { expect, it } from 'vitest';
import type { SetRow } from '../../../../src/core/types.ts';
import {
  baselineWeekStarts,
  combinedKg,
  combinedSessions,
  debugWeekRequested,
  fairFromSets,
  formatFairPercent,
  formatTonnes,
  lastCreditDate,
  partnerStatus,
  platesAfterDebugClose,
  presenceMinutes,
  presenceWork,
  toggleRawKg,
  visiblePresence,
} from '../../../../src/features/duo/view.ts';
import type { CrewPresence } from '../../../../src/data/duo.contract.ts';

const now = Date.parse('2026-11-02T12:00:00.000Z');
const presence = (last: string, started = '2026-11-02T11:46:00.000Z'): CrewPresence => ({
  user_id: '00000000-0000-4000-8000-000000000002',
  session_id: '00000000-0000-4000-8000-000000000099',
  kind: 'gym',
  exercise_label: 'Bench',
  set_no: 3,
  planned_sets: 5,
  started_at: started,
  last_active_at: last,
});

function setRow(date: string, kg: number, session = `session-${date}`): SetRow {
  return {
    id: `set-${date}-${kg}`,
    user_id: '00000000-0000-4000-8000-000000000001',
    local_date: date,
    client_updated_at: `${date}T12:00:00.000Z`,
    deleted_at: null,
    session_id: session,
    exercise_id: '00000000-0000-4000-8000-000000000010',
    set_index: 1,
    reps: 5,
    weight_kg: kg,
    rpe: 8,
    is_warmup: false,
    note: null,
    logged_at: `${date}T12:00:00.000Z`,
  };
}

it('hides presence 2 minutes after the last activity and formats the live line', () => {
  const row = presence('2026-11-02T12:00:00.000Z');
  expect(visiblePresence([row], now)).toEqual([row]);
  expect(visiblePresence([row], now + 119_000)).toEqual([row]);
  expect(visiblePresence([row], now + 120_000)).toEqual([]);
  expect(presenceWork(row)).toBe('Bench 3/5');
  expect(presenceMinutes(row, now)).toBe(14);
  expect(presenceWork({ ...row, exercise_label: null })).toBeNull();
});

it('rejects ?debug=week unless the build allows it, then adds one plate', () => {
  expect(debugWeekRequested('?debug=week', false)).toBe(false);
  expect(debugWeekRequested('?debug=other', true)).toBe(false);
  expect(debugWeekRequested('', true)).toBe(false);
  expect(debugWeekRequested('?debug=week', true)).toBe(true);
  expect(platesAfterDebugClose(0)).toBe(1);
  expect(platesAfterDebugClose(16)).toBe(17);
  expect(() => platesAfterDebugClose(-1)).toThrow(RangeError);
});

it('says last trained in days and never counts a gap with no credit', () => {
  expect(partnerStatus({ live: true, lastCredit: '2026-10-01', today: '2026-11-02' })).toEqual({ kind: 'live' });
  expect(partnerStatus({ live: false, lastCredit: null, today: '2026-11-02' })).toEqual({ kind: 'none' });
  expect(partnerStatus({ live: false, lastCredit: '2026-11-02', today: '2026-11-02' })).toEqual({ kind: 'today' });
  expect(partnerStatus({ live: false, lastCredit: '2026-10-31', today: '2026-11-02' })).toEqual({ kind: 'days', days: 2 });
  expect(lastCreditDate({
    sessions: [{
      id: 's', user_id: 'u', local_date: '2026-10-31', client_updated_at: '2026-10-31T12:00:00.000Z', deleted_at: null,
      kind: 'gym', mode: 'full', started_at: '2026-10-31T12:00:00.000Z', ended_at: null, tz: 'UTC',
      readiness: null, together_id: null, note: null,
    }],
    sets: [setRow('2026-10-31', 80, 's')],
    cardio: [],
    martial: [],
    min: [],
  })).toBe('2026-10-31');
});

it('compares each person to their own baseline and keeps raw kg out of the percent', () => {
  expect(baselineWeekStarts('2026-11-04')).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  const building = fairFromSets([setRow('2026-11-04', 100)], '2026-11-04');
  expect(building.state).toBe('building');
  expect(building.percent).toBeNull();
  const ready = fairFromSets([
    setRow('2026-10-06', 80, 'a'),
    setRow('2026-10-13', 80, 'b'),
    setRow('2026-11-04', 100, 'c'),
  ], '2026-11-04');
  expect(ready.state).toBe('ready');
  expect(ready.percent).toBeGreaterThan(0);
  expect(formatFairPercent(ready.percent ?? 0)).toMatch(/^\+/);
  expect(formatFairPercent(ready.percent ?? 0)).not.toContain('100');
  expect(toggleRawKg(null, 'a')).toBe('a');
  expect(toggleRawKg('a', 'b')).toBe('b');
  expect(toggleRawKg('b', 'b')).toBeNull();
});

it('sums this week only for the together block', () => {
  expect(combinedSessions(['2026-11-02', '2026-11-03', '2026-10-26'], '2026-11-02')).toBe(2);
  const kg = combinedKg([
    { reps: 5, weight_kg: 100, is_warmup: false, local_date: '2026-11-03' },
    { reps: 5, weight_kg: 200, is_warmup: true, local_date: '2026-11-03' },
    { reps: 5, weight_kg: 100, is_warmup: false, local_date: '2026-10-26' },
  ], '2026-11-02');
  expect(kg).toBe(500);
  expect(formatTonnes(kg)).toBe('0.5');
});
