import { liveQuery } from 'dexie';
import { useMemo, useSyncExternalStore } from 'react';

/** Live Repo read. The first dependency is the Repo (the account boundary); the rest invalidate the query. */
export function useRepoQuery<T>(load: () => Promise<T>, deps: readonly unknown[]): T | undefined {
  const repo = deps[0];
  // Each account owns its cache. Retired subscriptions can never seed a new account.
  const cache = useMemo(() => ({ repo, value: undefined as T | undefined }), [repo]);
  const store = useMemo(() => {
    let value = cache.value;
    return {
      subscribe(listener: () => void) {
        let active = true;
        const subscription = liveQuery(load).subscribe({
          next(next) {
            if (!active) return;
            value = next;
            cache.value = next;
            listener();
          },
          error() { /* Keep the last good value; the next change re-runs the query. */ },
        });
        return () => {
          active = false;
          subscription.unsubscribe();
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
