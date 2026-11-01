import { useMemo, useSyncExternalStore } from 'react';

/** Re-reads the Repo when `deps` change. No Dexie subscription library. */
export function useRepoQuery<T>(load: () => Promise<T>, deps: readonly unknown[]): T | undefined {
  const store = useMemo(() => {
    let value: T | undefined;
    const listeners = new Set<() => void>();
    return {
      subscribe(listener: () => void) {
        listeners.add(listener);
        let active = true;
        void load().then((next) => {
          if (!active) return;
          value = next;
          listeners.forEach((item) => item());
        });
        return () => {
          active = false;
          listeners.delete(listener);
        };
      },
      getSnapshot() {
        return value;
      },
    };
    // Caller passes the dependency list; `load` closes over that same render.
    // eslint-disable-next-line react-hooks/use-memo, react-hooks/exhaustive-deps
  }, deps);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
