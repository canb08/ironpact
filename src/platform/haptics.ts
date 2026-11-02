/**
 * Android haptics via `navigator.vibrate` (MDN Vibration API). No user-agent sniff.
 *
 * Missing `vibrate` → no-op, unless `iosHapticsTrick` is on. That flag is the
 * hidden `<input type="checkbox" switch>` label click. It stays off
 * (`VITE_IOS_HAPTICS` must be `on` / `1` / `true`) because it is not verified
 * on a device. See docs/PLATFORM-NOTES.md. `haptics_on` false → no-op.
 * Every haptic has a visual twin; none carries meaning alone.
 */
export const HAPTIC_PATTERNS = {
  setLogged: [18],
  timerZero: [80, 60, 80, 60, 200],
  pr: [30, 40, 30, 40, 120],
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

function viteIosHaptics(): string | undefined {
  const value: unknown = import.meta.env.VITE_IOS_HAPTICS;
  return typeof value === 'string' ? value : undefined;
}

/**
 * `null` follows `VITE_IOS_HAPTICS`. Anything other than `on`, `1` or `true`
 * leaves the trick off, including an unset variable.
 */
export function setIosHapticsTrick(on: boolean | null): void {
  trickOverride = on;
}

export function iosHapticsTrickEnabled(): boolean {
  if (trickOverride !== null) return trickOverride;
  const raw = viteIosHaptics();
  return raw === 'on' || raw === '1' || raw === 'true';
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

export function haptic(event: HapticEvent): boolean {
  if (!enabled) return false;
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    const pattern: number[] = [...HAPTIC_PATTERNS[event]];
    try {
      return navigator.vibrate(pattern) === true;
    } catch {
      return false;
    }
  }
  if (!iosHapticsTrickEnabled()) return false;
  return clickIosSwitch();
}
