import { liveQuery } from 'dexie';
import { useMemo, useSyncExternalStore } from 'react';

/** Live Repo read: re-runs when the Dexie tables it reads change (e.g. a background pull lands) or when `deps` change. */
export function useRepoQuery<T>(load: () => Promise<T>, deps: readonly unknown[]): T | undefined {
  const store = useMemo(() => {
    let value: T | undefined;
    return {
      subscribe(listener: () => void) {
        const subscription = liveQuery(load).subscribe({
          next(next) {
            value = next;
            listener();
          },
          error() { /* Keep the last good value; the next change re-runs the query. */ },
        });
        return () => subscription.unsubscribe();
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
