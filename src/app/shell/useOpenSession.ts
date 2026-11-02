import { useCallback, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepo } from '../useRepo.ts';

/** A read made before auth sees no tables, so auth must also invalidate it.
 * Return a boolean: undefined is useLiveQuery's loading sentinel.
 */
export function useOpenSession(): boolean {
  const repo = useRepo();
  const subscribe = useCallback((notify: () => void) => repo.auth.onChange(notify), [repo]);
  const userId = useSyncExternalStore(subscribe, repo.auth.userId);
  return useLiveQuery(async () => (await repo.q.openSession()) !== undefined, [repo, userId]) ?? false;
}
