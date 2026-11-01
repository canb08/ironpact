import { describe, expect, it } from 'vitest';
import { createClock, localDateIn } from '../../../src/data/clock.ts';

describe('clock calibration', () => {
  it.each([120_000, 1_200_000, -120_000])('always applies a %i ms skew using the RTT midpoint', async (skew) => {
    const start = Date.parse('2026-10-25T12:00:00.000Z');
    let time = start;
    const clock = createClock({ now: () => time, timezone: () => 'Europe/Amsterdam' });
    await clock.calibrate(async () => {
      time += 400;
      return new Date(start + 200 + skew).toISOString();
    });
    expect(clock.offsetMs()).toBe(skew);
    expect(clock.now()).toBe(new Date(start + 400 + skew).toISOString());
  });

  it('computes Amsterdam calendar dates across the repeated DST hour and midnight', () => {
    expect(localDateIn('Europe/Amsterdam', '2026-10-25T00:30:00.000Z')).toBe('2026-10-25');
    expect(localDateIn('Europe/Amsterdam', '2026-10-25T01:30:00.000Z')).toBe('2026-10-25');
    expect(localDateIn('Europe/Amsterdam', '2026-10-25T22:30:00.000Z')).toBe('2026-10-25');
    expect(localDateIn('Europe/Amsterdam', '2026-10-25T23:10:00.000Z')).toBe('2026-10-26');
  });
});
