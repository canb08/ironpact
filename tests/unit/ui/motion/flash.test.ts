import { describe, expect, it } from 'vitest';
import { createFlashGuard, MAX_FLASHES_PER_SECOND } from '../../../../src/ui/motion/flash';

describe('flash guard', () => {
  it('allows 3 flashes in one second and drops the 4th', () => {
    let now = 1_000;
    const guard = createFlashGuard(() => now);
    expect(MAX_FLASHES_PER_SECOND).toBe(3);
    expect(guard.allow()).toBe(true);
    expect(guard.allow()).toBe(true);
    expect(guard.allow()).toBe(true);
    expect(guard.allow()).toBe(false);
    now += 1_000;
    expect(guard.allow()).toBe(true);
  });

  it('slides the window so an old flash no longer counts', () => {
    let now = 0;
    const guard = createFlashGuard(() => now);
    expect(guard.allow()).toBe(true);
    now = 333;
    expect(guard.allow()).toBe(true);
    now = 666;
    expect(guard.allow()).toBe(true);
    now = 999;
    expect(guard.allow()).toBe(false);
    now = 1_000;
    expect(guard.allow()).toBe(true);
  });
});
