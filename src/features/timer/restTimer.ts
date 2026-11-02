import { copy, fill } from '../../ui/copy.ts';

/** Compound exercises rest 120 s unless the caller passes a remembered value. */
export const COMPOUND_REST_SECONDS = 120;
/** Isolation exercises rest 90 s unless the caller passes a remembered value. */
export const ISOLATION_REST_SECONDS = 90;
export const REST_ADJUST_SECONDS = 15;

export type RestCategory = 'compound' | 'isolation';

/** `endsAt` is epoch milliseconds. Null means no rest is running. */
export interface RestTimer {
  endsAt: number | null;
  startedAt: number | null;
  seconds: number;
  exerciseId: string | null;
}

export function idleRest(): RestTimer {
  return { endsAt: null, startedAt: null, seconds: 0, exerciseId: null };
}

export function defaultRestSeconds(category: RestCategory): number {
  return category === 'isolation' ? ISOLATION_REST_SECONDS : COMPOUND_REST_SECONDS;
}

function assertNow(now: number): void {
  if (!Number.isFinite(now)) throw new Error('Invalid clock');
}

/** Start a rest that ends at `now + seconds`. Time is injected; nothing is counted down. */
export function start(now: number, seconds: number, exerciseId: string | null = null): RestTimer {
  assertNow(now);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid rest duration');
  return { endsAt: now + seconds * 1000, startedAt: now, seconds, exerciseId };
}

/** Shift `endsAt` by ±15 s (or any finite delta). Idle rests stay idle. */
export function adjust(timer: RestTimer, deltaSeconds: number): RestTimer {
  if (timer.endsAt === null) return timer;
  if (!Number.isFinite(deltaSeconds)) throw new Error('Invalid rest adjustment');
  return { ...timer, endsAt: timer.endsAt + deltaSeconds * 1000 };
}

export function skip(timer: RestTimer): RestTimer {
  void timer;
  return idleRest();
}

/** Whole seconds until `endsAt`. Zero at and after the end. */
export function remaining(timer: RestTimer, now: number): number {
  if (timer.endsAt === null) return 0;
  assertNow(now);
  const ms = timer.endsAt - now;
  if (ms <= 0) return 0;
  return Math.ceil(ms / 1000);
}

/** Whole seconds after `endsAt`. Zero before and at the end. */
export function overBy(timer: RestTimer, now: number): number {
  if (timer.endsAt === null) return 0;
  assertNow(now);
  const ms = now - timer.endsAt;
  if (ms <= 0) return 0;
  return Math.floor(ms / 1000);
}

export function phaseOf(timer: RestTimer, now: number): 'idle' | 'running' | 'over' {
  if (timer.endsAt === null) return 'idle';
  assertNow(now);
  return now < timer.endsAt ? 'running' : 'over';
}

/** `1:32` or `0:05`. Minutes are unpadded; seconds are always two digits. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Running clock, or `+0:05 over` once `now` has passed `endsAt`. */
export function formatRestLabel(timer: RestTimer, now: number): string {
  if (timer.endsAt !== null && now >= timer.endsAt) {
    return fill(copy.restOverChip, { time: formatClock(overBy(timer, now)) });
  }
  return formatClock(remaining(timer, now));
}
