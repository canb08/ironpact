import { useSyncExternalStore } from 'react';
import type { Repo } from '../../data/adapter.ts';

export function useOnline(repo: Repo): boolean {
  return useSyncExternalStore((notify) => {
    window.addEventListener('online', notify);
    window.addEventListener('offline', notify);
    const stop = repo.sync.onStatus(notify);
    return () => {
      window.removeEventListener('online', notify);
      window.removeEventListener('offline', notify);
      stop();
    };
  }, () => navigator.onLine && repo.sync.status().state !== 'offline');
}
