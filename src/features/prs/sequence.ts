import { createFlashGuard } from '../../ui/motion/flash.ts';

/** §3.9.4 beats, milliseconds from the moment the takeover opens. */
export const PR_SEQUENCE_MS = {
  dim: 0,
  slam: 150,
  delta: 450,
  burst: 800,
  final: 1200,
} as const;

/**
 * One impact flash at the slam. Spec §3.11 / P4B: never more than 3 flashes
 * inside any one-second window. This sequence does not strobe.
 */
export const PR_FLASH_MS = [PR_SEQUENCE_MS.slam] as const;

export function prSequenceRespectsFlashCap(origin = 0): boolean {
  let now = origin;
  const guard = createFlashGuard(() => now);
  for (const at of PR_FLASH_MS) {
    now = origin + at;
    if (!guard.allow()) return false;
  }
  return PR_FLASH_MS.length <= 3;
}
