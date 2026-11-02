/** Spec §3.11 / Phase 4: never more than 3 flashes per second. P4G asserts the timer and PR sequences with this. */
export const MAX_FLASHES_PER_SECOND = 3;
const WINDOW_MS = 1000;

export function createFlashGuard(now: () => number = Date.now) {
  const stamps: number[] = [];
  return {
    /** True if this flash is allowed and recorded. False if it would be a 4th flash inside one second. */
    allow(): boolean {
      const time = now();
      const cutoff = time - WINDOW_MS;
      while (stamps.length > 0 && stamps[0]! <= cutoff) stamps.shift();
      if (stamps.length >= MAX_FLASHES_PER_SECOND) return false;
      stamps.push(time);
      return true;
    },
  };
}
