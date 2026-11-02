/**
 * Android haptics, §1.6 D16. No user-agent sniff.
 *
 * `navigator.vibrate` exists on Chrome Android and is absent on Safari / iOS
 * (MDN Vibration API, caniuse.com/vibration). Missing API → no-op.
 * `haptics_on` false → no-op. The iOS checkbox-switch trick stays unimplemented
 * and off (unverified). Every haptic has a visual twin; none carries meaning alone.
 */
export const HAPTIC_PATTERNS = {
  setLogged: [18],
  timerZero: [80, 60, 80, 60, 200],
  pr: [30, 40, 30, 40, 120],
} as const;

export type HapticEvent = keyof typeof HAPTIC_PATTERNS;

let enabled = true;

/** Profile `haptics_on`. Defaults to true, matching the schema. */
export function setHapticsOn(on: boolean): void {
  enabled = on;
}

export function hapticsEnabled(): boolean {
  return enabled;
}

export function haptic(event: HapticEvent): boolean {
  if (!enabled) return false;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  const pattern: number[] = [...HAPTIC_PATTERNS[event]];
  try {
    return navigator.vibrate(pattern) === true;
  } catch {
    return false;
  }
}
