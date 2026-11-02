/**
 * Android haptics via `navigator.vibrate` (MDN Vibration API). No user-agent sniff.
 *
 * Missing `vibrate` → the iOS `<input type="checkbox" switch>` label click.
 * That trick is on by default (FEEL §3). `VITE_IOS_HAPTICS=off` (also `0` or
 * `false`) turns it off. See docs/PLATFORM-NOTES.md. `haptics_on` false → no-op.
 * Every haptic has a visual twin; none carries meaning alone.
 */
export const HAPTIC_PATTERNS = {
  setLogged: [18],
  timerZero: [80, 60, 80, 60, 200],
  pr: [30, 40, 30, 40, 120],
  /** FEEL §3. One detent. */
  tick: [8],
  /** FEEL §3. Two 15 ms pulses. */
  plate: [15, 15, 15],
  /** FEEL §3. Three 40 ms pulses. */
  round: [40, 40, 40, 40, 40],
  /** FEEL §3. 30 ms, 60 ms, then 90 ms. The D16 `pr` pattern stays above. */
  prRamp: [30, 20, 60, 20, 90],
  /** FEEL §3. One long pulse. */
  lockout: [120],
  /** FEEL §3. Two short pulses. */
  error: [10, 10, 10],
} as const;

export type HapticEvent = keyof typeof HAPTIC_PATTERNS;

const SWITCH_ID = 'ironpact-ios-haptic';

let enabled = true;
let trickOverride: boolean | null = null;
let switchInput: HTMLInputElement | null = null;
let switchLabel: HTMLLabelElement | null = null;

/** Profile `haptics_on`. Defaults to true, matching the schema. */
export function setHapticsOn(on: boolean): void {
  enabled = on;
}

export function hapticsEnabled(): boolean {
  return enabled;
}

/**
 * Logged-set pulse. 20 ms at 20 kg, longer as the bar gets heavier, capped at 60 ms.
 * An omitted weight uses the 20 kg baseline.
 */
export function setPulseMs(weightKg?: number): number {
  const kg = weightKg === undefined || !Number.isFinite(weightKg) ? 20 : Math.min(200, Math.max(0, weightKg));
  return Math.round(Math.min(60, Math.max(20, 20 + (kg - 20) * 0.25)));
}

function viteIosHaptics(): string | undefined {
  const value: unknown = import.meta.env.VITE_IOS_HAPTICS;
  return typeof value === 'string' ? value : undefined;
}

/**
 * `null` follows `VITE_IOS_HAPTICS`. Unset, `on`, `1` and `true` leave the trick on.
 * `off`, `0` and `false` turn it off.
 */
export function setIosHapticsTrick(on: boolean | null): void {
  trickOverride = on;
}

export function iosHapticsTrickEnabled(): boolean {
  if (trickOverride !== null) return trickOverride;
  const raw = viteIosHaptics();
  return raw !== 'off' && raw !== '0' && raw !== 'false';
}

function iosSwitchLabel(): HTMLLabelElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  if (switchLabel?.isConnected && switchInput?.isConnected) return switchLabel;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = SWITCH_ID;
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  input.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;bottom:0';
  const label = document.createElement('label');
  label.htmlFor = SWITCH_ID;
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = input.style.cssText;
  document.body.append(input, label);
  switchInput = input;
  switchLabel = label;
  return label;
}

function clickIosSwitch(): boolean {
  const label = iosSwitchLabel();
  if (!label) return false;
  try {
    label.click();
    return true;
  } catch {
    return false;
  }
}

/** Fire a pattern. Used by `haptic` and by `feel` for the weight-scaled set pulse. */
export function vibrate(pattern: readonly number[]): boolean {
  if (!enabled) return false;
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      return navigator.vibrate([...pattern]) === true;
    } catch {
      return false;
    }
  }
  if (!iosHapticsTrickEnabled()) return false;
  return clickIosSwitch();
}

export function haptic(event: HapticEvent): boolean {
  return vibrate(HAPTIC_PATTERNS[event]);
}
