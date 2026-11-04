// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setHapticsOn } from '../../../src/platform/haptics';
import { releaseKeepAwake } from '../../../src/platform/wakeLock';
import {
  REST_TIMER_STORAGE_KEY,
  adjustRest,
  getRestSnapshot,
  getRestView,
  skipRest,
  startRest,
} from '../../../src/features/timer/useRestTimer';

beforeEach(() => {
  localStorage.clear();
  skipRest();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-02T00:00:00.000Z'));
});

afterEach(() => {
  skipRest();
  releaseKeepAwake();
  setHapticsOn(true);
  vi.useRealTimers();
  document.querySelectorAll('video').forEach((node) => node.remove());
});

describe('useRestTimer store', () => {
  it('background for 60 s mid-timer keeps the remaining time from endsAt', () => {
    const t0 = Date.now();
    startRest('bench', 120);
    const endsAt = t0 + 120_000;
    expect(getRestSnapshot().timer.endsAt).toBe(endsAt);
    expect(JSON.parse(localStorage.getItem(REST_TIMER_STORAGE_KEY) ?? '{}')).toMatchObject({ endsAt, exerciseId: 'bench' });

    vi.setSystemTime(t0 + 30_000);
    expect(getRestView().remainingSeconds).toBe(90);
    expect(getRestView().label).toBe('1:30');

    vi.setSystemTime(t0 + 90_000);
    expect(getRestSnapshot().timer.endsAt).toBe(endsAt);
    expect(getRestView().remainingSeconds).toBe(30);
    expect(getRestView().label).toBe('0:30');
    expect(getRestView().phase).toBe('running');
  });

  it('shows +0:05 over five seconds after zero', () => {
    const t0 = Date.now();
    startRest('bench', 90);
    vi.setSystemTime(t0 + 90_000);
    expect(getRestView().overSeconds).toBe(0);
    expect(getRestView().label).toBe('+0:00 over');
    expect(getRestView().phase).toBe('over');
    vi.setSystemTime(t0 + 95_000);
    expect(getRestView().overSeconds).toBe(5);
    expect(getRestView().remainingSeconds).toBe(0);
    expect(getRestView().label).toBe('+0:05 over');
  });

  it('adjusts ±15 s from endsAt and skip clears storage', () => {
    const t0 = Date.now();
    startRest('row', 90);
    adjustRest(-15);
    expect(getRestSnapshot().timer.endsAt).toBe(t0 + 75_000);
    expect(getRestView().label).toBe('1:15');
    adjustRest(15);
    expect(getRestView().label).toBe('1:30');
    skipRest();
    expect(getRestView().phase).toBe('idle');
    expect(localStorage.getItem(REST_TIMER_STORAGE_KEY)).toBeNull();
  });

  it('announces and feels once at 10 s and once at 0', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    const t0 = Date.now();
    startRest('bench', 30);
    expect(getRestView().live).toBe('');
    vi.setSystemTime(t0 + 20_000);
    vi.advanceTimersByTime(250);
    expect(getRestView().live).toBe('10 seconds');
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenNthCalledWith(1, [8]);
    vi.setSystemTime(t0 + 25_000);
    vi.advanceTimersByTime(250);
    expect(getRestView().live).toBe('10 seconds');
    vi.setSystemTime(t0 + 30_000);
    vi.advanceTimersByTime(250);
    expect(getRestView().live).toBe("Rest complete. Ready for your next set.");
    expect(vibrate).toHaveBeenCalledTimes(2);
    expect(vibrate).toHaveBeenNthCalledWith(2, [40, 40, 40, 40, 40]);
    vi.advanceTimersByTime(1000);
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('does not vibrate when haptics_on is false', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    setHapticsOn(false);
    const t0 = Date.now();
    startRest('bench', 10);
    vi.setSystemTime(t0 + 10_000);
    vi.advanceTimersByTime(250);
    expect(getRestView().live).toBe("Rest complete. Ready for your next set.");
    expect(vibrate).not.toHaveBeenCalled();
  });
});
