import { describe, expect, it } from 'vitest';
import { formatSessionClock, idleEndedAt, sessionSeconds, workingTonnes } from '../../../../src/features/session/sessionModel.ts';
import type { Exercise, SetRow } from '../../../../src/core/types.ts';

describe('session clock and idle close', () => {
  it('formats mm:ss and switches to h:mm:ss past an hour', () => {
    expect(formatSessionClock(0)).toBe('00:00');
    expect(formatSessionClock(65)).toBe('01:05');
    expect(formatSessionClock(3600)).toBe('1:00:00');
    expect(formatSessionClock(3661)).toBe('1:01:01');
  });

  it('measures duration from the stored instants', () => {
    expect(sessionSeconds('2026-11-02T10:00:00.000Z', '2026-11-02T10:14:05.000Z')).toBe(14 * 60 + 5);
    expect(sessionSeconds('2026-11-02T10:00:00.000Z', null, Date.parse('2026-11-02T10:00:09.000Z'))).toBe(9);
  });

  it('closes an idle session at the last set plus five minutes', () => {
    const start = '2026-11-02T08:00:00.000Z';
    const logged = '2026-11-02T08:30:00.000Z';
    expect(idleEndedAt(start, [logged], Date.parse(logged) + 3 * 60 * 60 * 1000 - 1)).toBeNull();
    expect(idleEndedAt(start, [logged], Date.parse(logged) + 3 * 60 * 60 * 1000)).toBe('2026-11-02T08:35:00.000Z');
    expect(idleEndedAt(start, [], Date.parse(start) + 3 * 60 * 60 * 1000)).toBe('2026-11-02T08:05:00.000Z');
  });

  it('sums working-set tonnes and skips warm-ups', () => {
    const exercise = { id: 'ex', kind: 'lift' } as Exercise;
    const set = (weight_kg: number, reps: number, is_warmup: boolean): SetRow => ({
      id: `${weight_kg}-${reps}-${is_warmup}`, user_id: 'u', session_id: 's', exercise_id: 'ex',
      set_index: 1, weight_kg, reps, rpe: null, is_warmup, note: null, logged_at: startStamp(),
      local_date: '2026-11-02', client_updated_at: startStamp(), deleted_at: null,
    });
    expect(workingTonnes([set(80, 5, true), set(80, 5, false), set(100, 3, false)], [exercise], null)).toBe(0.7);
  });
});

function startStamp(): string {
  return '2026-11-02T08:00:00.000Z';
}
