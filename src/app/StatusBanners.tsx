import { useCallback, useSyncExternalStore } from 'react';
import type { SyncStatus } from '../data/adapter.ts';
import { copy } from '../ui';
import { useRepo } from './useRepo.ts';

function useSyncState(): SyncStatus['state'] {
  const repo = useRepo();
  const subscribe = useCallback((notify: () => void) => {
    // onStatus emits the current value immediately; the snapshot already has it.
    let ready = false;
    const stop = repo.sync.onStatus(() => {
      if (ready) notify();
    });
    ready = true;
    return stop;
  }, [repo]);
  return useSyncExternalStore(subscribe, () => repo.sync.status().state);
}

/** Slim chalk line. Offline wins over a paused server; idle and flushing stay quiet. */
export function StatusBanners() {
  const state = useSyncState();
  const message = state === 'offline' ? copy.offlineBanner
    : state === 'server_asleep' ? copy.serverAsleep
      : null;
  if (!message) return null;
  return (
    <p
      role="status"
      style={{
        margin: 0,
        padding: 'var(--s-3) var(--gutter)',
        background: 'var(--surface-2)',
        color: 'var(--text)',
        borderBlockEnd: '1px solid var(--line)',
      }}
    >
      {message}
    </p>
  );
}
