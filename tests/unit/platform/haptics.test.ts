// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HAPTIC_PATTERNS, haptic, hapticsEnabled, setHapticsOn } from '../../../src/platform/haptics';

afterEach(() => {
  setHapticsOn(true);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('haptics', () => {
  it('vibrates with the D16 patterns when haptics_on is true', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    expect(haptic('setLogged')).toBe(true);
    expect(haptic('timerZero')).toBe(true);
    expect(haptic('pr')).toBe(true);
    expect(vibrate.mock.calls).toEqual([
      [HAPTIC_PATTERNS.setLogged],
      [HAPTIC_PATTERNS.timerZero],
      [HAPTIC_PATTERNS.pr],
    ]);
    expect(HAPTIC_PATTERNS.timerZero).toEqual([80, 60, 80, 60, 200]);
    expect(HAPTIC_PATTERNS.setLogged).toEqual([18]);
    expect(HAPTIC_PATTERNS.pr).toEqual([30, 40, 30, 40, 120]);
  });

  it('is a no-op when haptics_on is false', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    setHapticsOn(false);
    expect(hapticsEnabled()).toBe(false);
    expect(haptic('timerZero')).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('is a no-op when vibrate is missing or throws', () => {
    vi.stubGlobal('navigator', {});
    expect(haptic('timerZero')).toBe(false);
    const vibrate = vi.fn(() => { throw new Error('blocked'); });
    vi.stubGlobal('navigator', { vibrate });
    expect(haptic('pr')).toBe(false);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
});
