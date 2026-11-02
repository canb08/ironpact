import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { haptic } from '../../platform/haptics.ts';
import { keepAwake } from '../../platform/wakeLock.ts';
import { copy } from '../../ui/copy.ts';
import {
  adjust as adjustTimer,
  idleRest,
  phaseOf,
  remaining,
  overBy,
  skip as skipTimer,
  start as startTimer,
  formatRestLabel,
  type RestTimer,
} from './restTimer.ts';

export { defaultRestSeconds, COMPOUND_REST_SECONDS, ISOLATION_REST_SECONDS } from './restTimer.ts';

/**
 * Rest timer for P2D's session screen (S6 / S8 plain).
 *
 * One module store so the timer survives route changes. `endsAt` (epoch ms) is
 * written to `localStorage` under `ironpact.rest-timer` on every start, ±15 and
 * skip. Remaining time is always `endsAt − now`, so a backgrounded or killed
 * page comes back on the right second. Do not count ticks.
 *
 * ```
 * const { state, startRest, adjust, skip } = useRestTimer();
 * startRest(exerciseId, seconds); // seconds = remembered rest, or defaultRestSeconds(category)
 * adjust(-15 | 15);
 * skip();
 * state.label        // "1:32" while running, "+0:12 over" after zero
 * state.live         // aria-live text: empty, "10 seconds", then "Rest over. Bar's loaded."
 * state.phase        // 'idle' | 'running' | 'over'
 * ```
 *
 * Mount one `<RestTimerOverlay />` in the session dock. It contains the slim
 * readout and ±15 / Skip controls; tapping its readout expands it in place.
 * Pass `reduceMotion` from the profile; otherwise it reads the device preference.
 *
 * Wake lock: call `keepAwake()` from `src/platform/wakeLock.ts` inside the
 * START tap (user gesture, so the silent-video fallback may play). `startRest`
 * calls it again. A `visibilitychange` to visible re-requests while the screen
 * should stay awake. Call `releaseKeepAwake()` on RACK IT. Read
 * `screenMaySleep()` for the "Screen may sleep." chip; the overlay already shows it.
 *
 * Haptics: call `setHapticsOn(profile.haptics_on)` when the profile loads
 * (default true). At zero the timer calls `haptic('timerZero')` — Android
 * `[80,60,80,60,200]`, no-op when the flag is off or `navigator.vibrate` is
 * missing. P2D can call `haptic('setLogged')` and `haptic('pr')` for the other
 * D16 patterns. No sound in this phase.
 */
export const REST_TIMER_STORAGE_KEY = 'ironpact.rest-timer';
const TICK_MS = 250;
const LOADED_HOLD_MS = 1200;

export interface RestTimerView {
  phase: 'idle' | 'running' | 'over';
  exerciseId: string | null;
  endsAt: number | null;
  startedAt: number | null;
  remainingSeconds: number;
  overSeconds: number;
  label: string;
  live: string;
  showLoaded: boolean;
}

export interface RestTimerApi {
  state: RestTimerView;
  startRest: (exerciseId: string, seconds: number) => void;
  adjust: (deltaSeconds: 15 | -15) => void;
  skip: () => void;
}

interface RestSnapshot {
  timer: RestTimer;
  live: string;
  now: number;
}

let hydrated = false;
let state: RestTimer = idleRest();
let liveMessage = '';
let snapshot: RestSnapshot = { timer: state, live: liveMessage, now: 0 };
let announcedFor: number | null = null;
let announcedTen = false;
let announcedZero = false;
let ticker = 0;
const listeners = new Set<() => void>();

function publish(now: number): void {
  snapshot = { timer: state, live: liveMessage, now };
  for (const listener of listeners) listener();
}

function readStorage(): RestTimer | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(REST_TIMER_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const row = parsed as Record<string, unknown>;
    if (typeof row.exerciseId !== 'string' || row.exerciseId.length === 0) return null;
    if (typeof row.endsAt !== 'number' || !Number.isFinite(row.endsAt)) return null;
    if (typeof row.startedAt !== 'number' || !Number.isFinite(row.startedAt)) return null;
    if (typeof row.seconds !== 'number' || !Number.isFinite(row.seconds) || row.seconds < 0) return null;
    return {
      exerciseId: row.exerciseId,
      endsAt: row.endsAt,
      startedAt: row.startedAt,
      seconds: row.seconds,
    };
  } catch {
    return null;
  }
}

function writeStorage(timer: RestTimer): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (timer.endsAt === null || timer.startedAt === null || timer.exerciseId === null) {
      localStorage.removeItem(REST_TIMER_STORAGE_KEY);
      return;
    }
    localStorage.setItem(REST_TIMER_STORAGE_KEY, JSON.stringify({
      exerciseId: timer.exerciseId,
      endsAt: timer.endsAt,
      startedAt: timer.startedAt,
      seconds: timer.seconds,
    }));
  } catch {
    /* Private mode or quota: the in-memory endsAt still runs this page. */
  }
}

function ensureHydrated(): void {
  if (hydrated) return;
  hydrated = true;
  const stored = readStorage();
  if (!stored) return;
  state = stored;
  snapshot = { timer: state, live: liveMessage, now: snapshot.now };
}

function noteClock(now: number): void {
  if (state.startedAt !== announcedFor) {
    announcedFor = state.startedAt;
    announcedTen = false;
    announcedZero = false;
    liveMessage = '';
  }
  if (state.endsAt === null) return;
  const left = remaining(state, now);
  if (left === 10 && !announcedTen) {
    announcedTen = true;
    liveMessage = copy.restTenSeconds;
  }
  if (left === 0 && !announcedZero) {
    announcedZero = true;
    liveMessage = copy.restOverAnnounce;
    haptic('timerZero');
  }
}

function ensureTicker(): void {
  if (ticker || typeof window === 'undefined') return;
  ticker = window.setInterval(() => {
    const now = Date.now();
    noteClock(now);
    publish(now);
  }, TICK_MS);
}

function stopTicker(): void {
  if (!ticker || typeof window === 'undefined') return;
  window.clearInterval(ticker);
  ticker = 0;
}

export function getRestSnapshot(): RestSnapshot {
  ensureHydrated();
  return snapshot;
}

export function subscribeRest(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function toView(timer: RestTimer, now: number, live = ''): RestTimerView {
  return {
    phase: phaseOf(timer, now),
    exerciseId: timer.exerciseId,
    endsAt: timer.endsAt,
    startedAt: timer.startedAt,
    remainingSeconds: remaining(timer, now),
    overSeconds: overBy(timer, now),
    label: formatRestLabel(timer, now),
    live,
    showLoaded: timer.endsAt !== null && now >= timer.endsAt && now < timer.endsAt + LOADED_HOLD_MS,
  };
}

export function getRestView(now = Date.now()): RestTimerView {
  const current = getRestSnapshot();
  return toView(current.timer, now, current.live);
}

export function startRest(exerciseId: string, seconds: number, now = Date.now()): void {
  ensureHydrated();
  if (exerciseId.length === 0) throw new Error('Missing exercise');
  state = startTimer(now, seconds, exerciseId);
  writeStorage(state);
  noteClock(now);
  publish(now);
  ensureTicker();
  void keepAwake();
}

export function adjustRest(deltaSeconds: 15 | -15, now = Date.now()): void {
  ensureHydrated();
  if (deltaSeconds !== 15 && deltaSeconds !== -15) return;
  state = adjustTimer(state, deltaSeconds);
  writeStorage(state);
  noteClock(now);
  publish(now);
}

export function skipRest(now = Date.now()): void {
  ensureHydrated();
  state = skipTimer(state);
  writeStorage(state);
  noteClock(now);
  stopTicker();
  publish(now);
}

export function useRestTimer(): RestTimerApi {
  const current = useSyncExternalStore(subscribeRest, getRestSnapshot, getRestSnapshot);
  useLayoutEffect(() => {
    const now = Date.now();
    noteClock(now);
    publish(now);
    if (getRestSnapshot().timer.endsAt !== null) ensureTicker();
  }, []);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      noteClock(now);
      publish(now);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return {
    state: toView(current.timer, current.now, current.live),
    startRest,
    adjust: adjustRest,
    skip: skipRest,
  };
}
