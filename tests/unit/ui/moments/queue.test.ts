import { describe, expect, it } from 'vitest';
import { createMomentQueue, TIER1_GAP_MS } from '../../../../src/ui/moments/queue';

const pr = { id: 'pr', tier: 1 as const, kind: 'pr' };
const ring = { id: 'ring', tier: 1 as const, kind: 'ring-close' };
const bar = { id: 'bar', tier: 1 as const, kind: 'bar-tier-up' };

describe('moment queue', () => {
  it('two Tier-1 moments: PR first, the second 400ms later; one active per screen open', () => {
    const queue = createMomentQueue();
    queue.register(ring);
    queue.register(pr);
    queue.openScreen(1_000);
    expect(queue.trigger('ring', 1_000).disposition).toBe('active');
    expect(queue.trigger('pr', 1_000).disposition).toBe('active');
    expect(queue.active()?.id).toBe('pr');
    expect(queue.waiting().map((moment) => moment.id)).toEqual(['ring']);
    expect(queue.startedThisOpen()).toBe(1);

    queue.tick(1_000 + TIER1_GAP_MS - 1);
    expect(queue.active()?.id).toBe('pr');
    expect(queue.startedThisOpen()).toBe(1);

    queue.tick(1_000 + TIER1_GAP_MS);
    expect(queue.active()?.id).toBe('ring');
    expect(queue.waiting()).toEqual([]);
    expect(queue.startedThisOpen()).toBe(2);
    expect(TIER1_GAP_MS).toBe(400);
  });

  it('holds a Tier-1 that does not start for the next screen open', () => {
    const queue = createMomentQueue();
    queue.register(pr);
    queue.register(bar);
    queue.openScreen(0);
    queue.trigger('bar', 0);
    queue.trigger('pr', 0);
    expect(queue.active()?.id).toBe('pr');
    queue.closeScreen();
    expect(queue.active()).toBeNull();
    expect(queue.deferred().map((moment) => moment.id)).toEqual(['bar']);
    queue.openScreen(5_000);
    expect(queue.active()?.id).toBe('bar');
    expect(queue.deferred()).toEqual([]);
  });

  it('runs Tier-2 inline and leaves the takeover queue empty', () => {
    const queue = createMomentQueue();
    queue.register({ id: 'segment', tier: 2, kind: 'segment' });
    queue.openScreen(0);
    expect(queue.trigger('segment', 0)).toMatchObject({ ok: true, disposition: 'inline' });
    expect(queue.active()).toBeNull();
    expect(queue.waiting()).toEqual([]);
  });

  it('defers a Tier-1 triggered while no screen is open, and ignores duplicates', () => {
    const queue = createMomentQueue();
    queue.register(pr);
    expect(queue.trigger('missing', 0)).toMatchObject({ ok: false, disposition: 'unknown' });
    expect(queue.trigger('pr', 0).disposition).toBe('deferred');
    expect(queue.trigger('pr', 0).disposition).toBe('ignored');
    queue.openScreen(20);
    expect(queue.active()?.id).toBe('pr');
    expect(queue.trigger('pr', 20).disposition).toBe('ignored');
  });
});
