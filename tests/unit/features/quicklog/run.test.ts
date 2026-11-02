import { describe, expect, it } from 'vitest';
import { formatClock, formatKm, formatPace } from '../../../../src/features/quicklog/time.ts';
import {
  durationInRange,
  elapsedSeconds,
  kmFromMeters,
  kmInRange,
  latestRun,
  metersFromKm,
  stoppedDuration,
} from '../../../../src/features/quicklog/run/model.ts';

describe('run dials', () => {
  it('formats kilometres on and off the 0.1 detent', () => {
    expect(formatKm(5)).toBe('5.0');
    expect(formatKm(5.2)).toBe('5.2');
    expect(formatKm(5.23)).toBe('5.23');
    expect(formatKm(0.1)).toBe('0.1');
    expect(formatKm(100)).toBe('100.0');
  });

  it('formats the clock as mm:ss until an hour', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(1660)).toBe('27:40');
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(3661)).toBe('1:01:01');
  });

  it('keeps pace in whole seconds', () => {
    expect(formatPace(1660, 5.2)).toBe('5:19');
    expect(formatPace(1800, 5.1)).toBe('5:53');
  });

  it('turns kilometres into 10 m steps and rejects world records', () => {
    expect(metersFromKm(5.2)).toBe(5200);
    expect(metersFromKm(0.1)).toBe(100);
    expect(kmFromMeters(5200)).toBe(5.2);
    expect(kmInRange(5.2)).toBe(true);
    expect(kmInRange(0)).toBe(false);
    expect(kmInRange(101)).toBe(false);
    expect(kmInRange(5.234)).toBe(false);
    expect(durationInRange(1660)).toBe(true);
    expect(durationInRange(0)).toBe(false);
    expect(durationInRange(86400)).toBe(false);
  });

  it('counts live-run seconds and never stops at zero', () => {
    expect(elapsedSeconds(1_000, 1_000)).toBe(0);
    expect(elapsedSeconds(1_000, 126_000)).toBe(125);
    expect(stoppedDuration(1_000, 1_400)).toBe(1);
    expect(stoppedDuration(1_000, 126_000)).toBe(125);
    expect(stoppedDuration(1_000, 1_000 + 86_400_000)).toBe(86_399);
  });

  it('picks the newest run', () => {
    const older = { id: 'a', logged_at: '2026-10-01T00:00:00.000Z' };
    const newer = { id: 'b', logged_at: '2026-10-02T00:00:00.000Z' };
    const tie = { id: 'c', logged_at: '2026-10-02T00:00:00.000Z' };
    expect(latestRun([])).toBeNull();
    expect(latestRun([older, newer])?.id).toBe('b');
    expect(latestRun([newer, tie])?.id).toBe('c');
  });
});
