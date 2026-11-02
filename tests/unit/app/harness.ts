import type { SyncState, SyncStatus } from '../../../src/data/adapter.ts';
import type { Session } from '../../../src/core/types.ts';
import { mockRepo } from '../features/auth/mockRepo.ts';

const openSessionRow = { id: 'session-1' } as Session;

/** Mock repo whose sync status and open session the shell tests can move. */
export function shellRepo(initial: SyncState = 'idle') {
  let state = initial;
  let session: Session | undefined;
  const listeners = new Set<(status: SyncStatus) => void>();
  const status = (): SyncStatus => ({
    state, pendingCount: 0, deadCount: 0, lastSyncedAt: null,
  });
  const repo = mockRepo({
    q: { openSession: async () => session },
  });
  repo.sync = {
    status,
    onStatus: (cb) => {
      listeners.add(cb);
      cb(status());
      return () => { listeners.delete(cb); };
    },
    flushNow: async () => {},
    pullNow: async () => {},
    retryDead: async () => {},
    discardDead: async () => {},
  };
  return {
    repo,
    setState(next: SyncState) {
      state = next;
      const snapshot = status();
      for (const listener of listeners) listener(snapshot);
    },
    setSessionOpen(open: boolean) {
      session = open ? openSessionRow : undefined;
    },
  };
}
