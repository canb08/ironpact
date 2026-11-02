import { MOTION_MS } from '../motion/springs';

/** Tier-1 kinds. `pr` plays before any other kind that fired with it. */
export const MOMENT_KIND = {
  pr: 'pr',
  ringClose: 'ring-close',
  seasonWin: 'season-win',
  duelWin: 'duel-win',
  barTierUp: 'bar-tier-up',
} as const;

export const TIER1_GAP_MS = MOTION_MS.tierGap;

export interface Moment {
  readonly id: string;
  readonly tier: 1 | 2;
  readonly kind: string;
}

export type MomentDisposition = 'inline' | 'active' | 'queued' | 'deferred' | 'ignored' | 'unknown';

export interface TriggerResult {
  readonly ok: boolean;
  readonly disposition: MomentDisposition;
  readonly moment?: Moment;
}

export interface MomentSnapshot {
  readonly active: Moment | null;
  readonly waiting: readonly Moment[];
  readonly deferred: readonly Moment[];
  readonly screenOpen: boolean;
  readonly startedThisOpen: number;
}

export interface MomentQueue {
  register(moment: Moment): void;
  unregister(id: string): void;
  registered(id: string): Moment | undefined;
  /** One screen open. A Tier-1 that was deferred starts now, PR first. */
  openScreen(now?: number): void;
  /** Waiting Tier-1s that have not started move to the next open. */
  closeScreen(): void;
  trigger(id: string, now: number): TriggerResult;
  /** Starts the next Tier-1 once `TIER1_GAP_MS` has passed since the current one started. */
  tick(now: number): void;
  active(): Moment | null;
  waiting(): readonly Moment[];
  deferred(): readonly Moment[];
  startedThisOpen(): number;
  /** Delay until `tick` should run so the next Tier-1 starts on the 400ms gap. */
  msUntilNext(now: number): number | null;
  subscribe(listener: () => void): () => void;
  getSnapshot(): MomentSnapshot;
}

function rank(moment: Moment): number {
  return moment.kind === MOMENT_KIND.pr ? 0 : 1;
}

function byPriority(items: readonly Moment[]): Moment[] {
  return items
    .map((moment, index) => ({ moment, index }))
    .sort((a, b) => rank(a.moment) - rank(b.moment) || a.index - b.index)
    .map((row) => row.moment);
}

export function createMomentQueue(): MomentQueue {
  const registry = new Map<string, Moment>();
  let screenOpen = false;
  let active: Moment | null = null;
  let activeAt: number | null = null;
  let waiting: Moment[] = [];
  let deferred: Moment[] = [];
  let startedThisOpen = 0;
  let snapshot: MomentSnapshot = take();
  const listeners = new Set<() => void>();

  function take(): MomentSnapshot {
    return { active, waiting, deferred, screenOpen, startedThisOpen };
  }
  function commit() {
    snapshot = take();
    for (const listener of listeners) listener();
  }
  function parked(id: string): boolean {
    return active?.id === id || waiting.some((moment) => moment.id === id) || deferred.some((moment) => moment.id === id);
  }
  function startNext(now: number) {
    if (!screenOpen || active || waiting.length === 0) return;
    if (activeAt !== null && startedThisOpen > 0 && now < activeAt + TIER1_GAP_MS) return;
    const next = waiting[0];
    if (!next) return;
    waiting = waiting.slice(1);
    active = next;
    activeAt = now;
    startedThisOpen += 1;
  }

  return {
    register(moment) {
      if (moment.tier !== 1 && moment.tier !== 2) throw new Error('Invalid moment tier');
      if (moment.id.length === 0) throw new Error('Moment id required');
      registry.set(moment.id, moment);
    },
    unregister(id) {
      registry.delete(id);
    },
    registered(id) {
      return registry.get(id);
    },
    openScreen(now = 0) {
      screenOpen = true;
      startedThisOpen = 0;
      active = null;
      activeAt = null;
      waiting = byPriority([...deferred, ...waiting]);
      deferred = [];
      startNext(now);
      commit();
    },
    closeScreen() {
      active = null;
      deferred = byPriority([...deferred, ...waiting]);
      waiting = [];
      screenOpen = false;
      activeAt = null;
      commit();
    },
    trigger(id, now) {
      const moment = registry.get(id);
      if (!moment) return { ok: false, disposition: 'unknown' };
      if (moment.tier === 2) return { ok: true, disposition: 'inline', moment };
      if (parked(moment.id)) return { ok: true, disposition: 'ignored', moment };
      if (!screenOpen) {
        deferred = byPriority([...deferred, moment]);
        commit();
        return { ok: true, disposition: 'deferred', moment };
      }
      const preempt = active !== null && activeAt === now && rank(moment) < rank(active);
      if (preempt && active) {
        waiting = byPriority([active, ...waiting, moment]);
        active = null;
        startedThisOpen = Math.max(0, startedThisOpen - 1);
        activeAt = null;
      } else {
        waiting = byPriority([...waiting, moment]);
      }
      const before = active?.id;
      startNext(now);
      commit();
      if (active?.id === moment.id && before !== moment.id) return { ok: true, disposition: 'active', moment };
      return { ok: true, disposition: 'queued', moment };
    },
    tick(now) {
      const before = active?.id ?? null;
      if (active && activeAt !== null && waiting.length > 0 && now >= activeAt + TIER1_GAP_MS) active = null;
      startNext(now);
      if ((active?.id ?? null) !== before) commit();
    },
    active: () => active,
    waiting: () => waiting,
    deferred: () => deferred,
    startedThisOpen: () => startedThisOpen,
    /** Milliseconds until the next waiting Tier-1 may start, or null if nothing is waiting on an active one. */
    msUntilNext(now: number): number | null {
      if (!screenOpen || active === null || waiting.length === 0 || activeAt === null) return null;
      return Math.max(0, activeAt + TIER1_GAP_MS - now);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
  };
}

/** App-wide queue. Lane E registers ring-close and bar tier-up on this same object. */
export const moments = createMomentQueue();
