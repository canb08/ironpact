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
      // Overlay, not layout: it must never shift full-height screens or cover their controls (LOG SET offline).
      style={{
        position: 'fixed',
        insetInline: 0,
        insetBlockStart: 0,
        zIndex: 50,
        pointerEvents: 'none',
        margin: 0,
        paddingBlock: 'calc(env(safe-area-inset-top) + var(--s-2)) var(--s-2)',
        paddingInline: 'var(--gutter)',
        background: 'var(--surface-2)',
        color: 'var(--text)',
        borderBlockEnd: '1px solid var(--line)',
      }}
    >
      {message}
    </p>
  );
}
