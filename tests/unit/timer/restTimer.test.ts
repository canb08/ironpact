import { describe, expect, it } from 'vitest';
import {
  adjust,
  defaultRestSeconds,
  formatRestLabel,
  overBy,
  remaining,
  skip,
  start,
} from '../../../src/features/timer/restTimer';

describe('rest timer pure clock', () => {
  it('defaults to 120 s compound and 90 s isolation', () => {
    expect(defaultRestSeconds('compound')).toBe(120);
    expect(defaultRestSeconds('isolation')).toBe(90);
  });

  it('stores endsAt and never counts down a stored remainder', () => {
    const timer = start(1_000_000, 120, 'bench');
    expect(timer.endsAt).toBe(1_120_000);
    expect(remaining(timer, 1_030_000)).toBe(90);
    expect(remaining(timer, 1_090_000)).toBe(30);
    expect(formatRestLabel(timer, 1_090_000)).toBe('0:30');
    expect(timer.endsAt).toBe(1_120_000);
  });

  it('background for 60 s mid-timer returns the remaining time from endsAt', () => {
    const timer = start(0, 120);
    expect(remaining(timer, 30_000)).toBe(90);
    const afterBackground = 30_000 + 60_000;
    expect(remaining(timer, afterBackground)).toBe(30);
    expect(formatRestLabel(timer, afterBackground)).toBe('0:30');
    expect(timer.endsAt).toBe(120_000);
  });

  it('shows 0:50 after 70 s away from a 120 s rest', () => {
    const timer = start(5_000, 120);
    expect(formatRestLabel(timer, 5_000 + 70_000)).toBe('0:50');
    expect(remaining(timer, 5_000 + 70_000)).toBe(50);
  });

  it('shows +0:05 over five seconds after zero', () => {
    const timer = start(0, 90);
    expect(overBy(timer, 90_000)).toBe(0);
    expect(formatRestLabel(timer, 90_000)).toBe('+0:00 over');
    expect(overBy(timer, 95_000)).toBe(5);
    expect(remaining(timer, 95_000)).toBe(0);
    expect(formatRestLabel(timer, 95_000)).toBe('+0:05 over');
  });

  it('counts further overtime and shifts endsAt by ±15 s', () => {
    let timer = start(0, 120);
    expect(formatRestLabel(timer, 132_000)).toBe('+0:12 over');
    timer = adjust(timer, -15);
    expect(timer.endsAt).toBe(105_000);
    expect(remaining(timer, 0)).toBe(105);
    timer = adjust(timer, 15);
    expect(remaining(timer, 0)).toBe(120);
    expect(adjust(skip(timer), 15).endsAt).toBeNull();
  });

  it('rejects a bad clock or duration', () => {
    expect(() => start(Number.NaN, 90)).toThrow('Invalid clock');
    expect(() => start(0, -1)).toThrow('Invalid rest duration');
    expect(() => remaining(start(0, 10), Number.POSITIVE_INFINITY)).toThrow('Invalid clock');
  });
});
