import { TZDate } from '@date-fns/tz';

export interface Clock {
  now(): string;
  timezone(): string;
  offsetMs(): number;
  restoreOffset(offset: number): void;
  calibrate(serverNow: () => Promise<string>): Promise<number>;
}
export function createClock(options: { now?: () => number; timezone?: () => string } = {}): Clock {
  const time = options.now ?? Date.now;
  let offset = 0;
  return {
    now: () => new Date(time() + offset).toISOString(),
    timezone: options.timezone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    offsetMs: () => offset,
    restoreOffset(value) { if (Number.isFinite(value)) offset = value; },
    async calibrate(serverNow) {
      const start = time();
      const server = Date.parse(await serverNow());
      const end = time();
      if (!Number.isFinite(server)) throw new Error('Invalid server clock');
      offset = server - (start + (end - start) / 2);
      return offset;
    },
  };
}
/** Preserve PostgreSQL's microseconds instead of rounding LWW ties to milliseconds. */
export function compareInstant(a: string, b: string): number {
  const millis = Date.parse(a) - Date.parse(b);
  if (millis !== 0) return millis;
  const fraction = (value: string) => (value.match(/\.(\d+)/)?.[1] ?? '').padEnd(9, '0').slice(3, 9);
  return fraction(a) < fraction(b) ? -1 : fraction(a) > fraction(b) ? 1 : 0;
}
export function localDateIn(tz: string, instant: string): string {
  const date = new TZDate(instant, tz);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
