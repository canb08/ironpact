// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HAPTIC_PATTERNS,
  haptic,
  hapticsEnabled,
  iosHapticsTrickEnabled,
  setHapticsOn,
  setIosHapticsTrick,
  setPulseMs,
  vibrate,
} from '../../../src/platform/haptics';

afterEach(() => {
  setHapticsOn(true);
  setIosHapticsTrick(null);
  document.getElementById('ironpact-ios-haptic')?.remove();
  document.querySelector('label[for="ironpact-ios-haptic"]')?.remove();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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

  it('is a no-op when vibrate is missing and the trick is off, or when vibrate throws', () => {
    setIosHapticsTrick(false);
    vi.stubGlobal('navigator', {});
    expect(haptic('timerZero')).toBe(false);
    const vibrate = vi.fn(() => { throw new Error('blocked'); });
    vi.stubGlobal('navigator', { vibrate });
    expect(haptic('pr')).toBe(false);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('turns the iOS switch trick on unless VITE_IOS_HAPTICS is an off value', () => {
    expect(iosHapticsTrickEnabled()).toBe(true);
    vi.stubEnv('VITE_IOS_HAPTICS', 'off');
    expect(iosHapticsTrickEnabled()).toBe(false);
    vi.stubEnv('VITE_IOS_HAPTICS', '0');
    expect(iosHapticsTrickEnabled()).toBe(false);
    vi.stubEnv('VITE_IOS_HAPTICS', 'false');
    expect(iosHapticsTrickEnabled()).toBe(false);
    vi.stubEnv('VITE_IOS_HAPTICS', 'on');
    expect(iosHapticsTrickEnabled()).toBe(true);
    vi.stubEnv('VITE_IOS_HAPTICS', '1');
    expect(iosHapticsTrickEnabled()).toBe(true);
    setIosHapticsTrick(false);
    expect(iosHapticsTrickEnabled()).toBe(false);
    vi.stubGlobal('navigator', {});
    expect(haptic('setLogged')).toBe(false);
    expect(document.querySelector('input[switch]')).toBeNull();
  });

  it('clicks a hidden checkbox switch only when vibrate is missing and the flag is on', () => {
    const click = vi.spyOn(HTMLElement.prototype, 'click');
    vi.stubGlobal('navigator', {});
    setIosHapticsTrick(true);
    expect(haptic('setLogged')).toBe(true);
    expect(haptic('pr')).toBe(true);
    expect(click).toHaveBeenCalledTimes(2);
    const input = document.querySelector('input');
    expect(input?.getAttribute('switch')).toBe('');
    expect(input?.type).toBe('checkbox');
    expect(input?.getAttribute('aria-hidden')).toBe('true');
    expect(input?.tabIndex).toBe(-1);
    expect(document.querySelectorAll('input[switch]')).toHaveLength(1);
    const label = document.querySelector('label');
    expect(label?.htmlFor).toBe(input?.id);

    setHapticsOn(false);
    expect(haptic('timerZero')).toBe(false);
    expect(click).toHaveBeenCalledTimes(2);

    setHapticsOn(true);
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    expect(haptic('timerZero')).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([80, 60, 80, 60, 200]);
    expect(click).toHaveBeenCalledTimes(2);
  });

  it('adds the FEEL patterns and lengthens the set pulse with weight', () => {
    const vibrateFn = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrateFn });
    expect(setPulseMs()).toBe(20);
    expect(setPulseMs(20)).toBe(20);
    expect(setPulseMs(100)).toBe(40);
    expect(setPulseMs(200)).toBe(60);
    expect(haptic('tick')).toBe(true);
    expect(haptic('plate')).toBe(true);
    expect(haptic('round')).toBe(true);
    expect(haptic('prRamp')).toBe(true);
    expect(haptic('lockout')).toBe(true);
    expect(haptic('error')).toBe(true);
    expect(vibrate([setPulseMs(100)])).toBe(true);
    expect(vibrateFn.mock.calls).toEqual([
      [[8]],
      [[15, 15, 15]],
      [[40, 40, 40, 40, 40]],
      [[30, 20, 60, 20, 90]],
      [[120]],
      [[10, 10, 10]],
      [[40]],
    ]);
    expect(HAPTIC_PATTERNS.pr).toEqual([30, 40, 30, 40, 120]);
  });
});
