import { uiSchemas } from '../../../core/validate.ts';

/** 0.1 km detents. The keyboard fallback covers the 0.01 km steps the schema allows. */
export const KM_MIN = 0.1;
export const KM_MAX = 100;
export const KM_STEP = 0.1;
/** One second is valid; the dial clicks every 15 s. Exact seconds come from the timer or the keyboard. */
export const DURATION_MIN_S = 1;
export const DURATION_MAX_S = 86_399;
export const DURATION_STEP_S = 15;
export const DEFAULT_KM = 5;
export const DEFAULT_DURATION_S = 30 * 60;

export function metersFromKm(km: number): number {
  return Math.round(km * 100) * 10;
}

export function kmFromMeters(meters: number): number {
  return meters / 1000;
}

export function kmInRange(km: number | null): km is number {
  if (km === null || !uiSchemas.run_km.safeParse(km).success) return false;
  return uiSchemas.distance_m.safeParse(metersFromKm(km)).success;
}

export function durationInRange(seconds: number | null): seconds is number {
  return seconds !== null && uiSchemas.duration_s.safeParse(seconds).success;
}

export function elapsedSeconds(startedAtMs: number, nowMs: number): number {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return 0;
  return Math.min(DURATION_MAX_S, Math.max(0, Math.floor((nowMs - startedAtMs) / 1000)));
}

/** Stop never writes 0 seconds: the schema's shortest run is one second. */
export function stoppedDuration(startedAtMs: number, nowMs: number): number {
  return Math.min(DURATION_MAX_S, Math.max(DURATION_MIN_S, elapsedSeconds(startedAtMs, nowMs)));
}

export function latestRun<T extends { logged_at: string; id: string }>(rows: readonly T[]): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (
      best === null
      || row.logged_at > best.logged_at
      || (row.logged_at === best.logged_at && row.id > best.id)
    ) best = row;
  }
  return best;
}
