// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRepoQuery } from '../../../../src/features/floor/useRepoQuery.ts';

const { subscriptions } = vi.hoisted(() => ({
  subscriptions: [] as { next: (value: unknown) => void; unsubscribe: ReturnType<typeof vi.fn> }[],
}));

vi.mock('dexie', () => ({
  liveQuery: () => ({
    subscribe: (observer: { next: (value: unknown) => void }) => {
      const subscription = { next: observer.next, unsubscribe: vi.fn() };
      subscriptions.push(subscription);
      return subscription;
    },
  }),
}));

function latest() {
  return subscriptions[subscriptions.length - 1]!;
}

beforeEach(() => { subscriptions.length = 0; });

describe('useRepoQuery account-scoped values', () => {
  it('keeps the last value through write and crew ticks until the replacement arrives', () => {
    const repo = {};
    const load = vi.fn(async () => 'unused');
    const { result, rerender } = renderHook(
      ({ tick, crewTick }) => useRepoQuery(load, [repo, tick, crewTick]),
      { initialProps: { tick: 0, crewTick: 0 }, wrapper: StrictMode },
    );
    expect(result.current).toBeUndefined();
    act(() => latest().next('first'));
    expect(result.current).toBe('first');
    const retired = latest();
    rerender({ tick: 1, crewTick: 0 });
    expect(retired.unsubscribe).toHaveBeenCalledOnce();
    expect(result.current).toBe('first');
    act(() => retired.next('stale'));
    expect(result.current).toBe('first');
    act(() => latest().next('second'));
    expect(result.current).toBe('second');
    rerender({ tick: 1, crewTick: 1 });
    expect(result.current).toBe('second');
    act(() => latest().next('crew update'));
    expect(result.current).toBe('crew update');
  });

  it('resets on a repo change and ignores late deliveries from the previous account', () => {
    const firstRepo = {};
    const secondRepo = {};
    const load = vi.fn(async () => 'unused');
    const { result, rerender } = renderHook(
      ({ repo, tick }) => useRepoQuery(load, [repo, tick]),
      { initialProps: { repo: firstRepo, tick: 0 }, wrapper: StrictMode },
    );
    act(() => latest().next('private first account'));
    const retired = latest();
    rerender({ repo: secondRepo, tick: 0 });
    expect(result.current).toBeUndefined();
    act(() => retired.next('late private data'));
    rerender({ repo: secondRepo, tick: 1 });
    expect(result.current).toBeUndefined();
    act(() => latest().next('second account'));
    expect(result.current).toBe('second account');
    rerender({ repo: firstRepo, tick: 1 });
    expect(result.current).toBeUndefined();
  });

  it('retains a delivered null while refreshing an empty result', () => {
    const repo = {};
    const { result, rerender } = renderHook(
      ({ tick }) => useRepoQuery(async () => null, [repo, tick]),
      { initialProps: { tick: 0 } },
    );
    act(() => latest().next(null));
    rerender({ tick: 1 });
    expect(result.current).toBeNull();
  });
});
