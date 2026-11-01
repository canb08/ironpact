import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import type { Remote } from '../../../src/data/adapter.ts';
import type { Result } from '../../../src/core/types.ts';
import type { SyncEnvironment } from '../../../src/data/sync.ts';

// Adapters may import Dexie before this helper; set its captured dependencies explicitly.
Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

/** Network and visibility are explicit; tests never depend on browser globals or wall time. */
export class ManualEnvironment implements SyncEnvironment {
  private connected = false;
  private foreground = true;
  private onlineListeners = new Set<() => void>();
  private visibilityListeners = new Set<() => void>();
  readonly timers = new Map<number, { callback: () => void; delay: number }>();
  private sequence = 0;
  online = () => this.connected;
  visible = () => this.foreground;
  onOnline = (callback: () => void) => {
    this.onlineListeners.add(callback);
    return () => { this.onlineListeners.delete(callback); };
  };
  onVisibility = (callback: () => void) => {
    this.visibilityListeners.add(callback);
    return () => { this.visibilityListeners.delete(callback); };
  };
  setTimeout = (callback: () => void, delay: number) => {
    const id = ++this.sequence;
    this.timers.set(id, { callback, delay });
    return id;
  };
  clearTimeout = (handle: unknown) => { this.timers.delete(handle as number); };
  setOnline(value: boolean) {
    this.connected = value;
    if (value) for (const callback of this.onlineListeners) callback();
  }
  setVisible(value: boolean) {
    this.foreground = value;
    for (const callback of this.visibilityListeners) callback();
  }
}

export function unwrap<T, E extends string>(result: Result<T, E>): T {
  if (!result.ok) throw new Error(`Unexpected rejected operation: ${result.error}`);
  return result.value;
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Decorate only the network seam, retaining adapters with class/prototype methods. */
export function decorateRemote(remote: Remote, overrides: Partial<Remote>): Remote {
  return new Proxy(remote, {
    get(target, key) {
      const value: unknown = Reflect.get(overrides, key) ?? Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export const fixtureId = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
