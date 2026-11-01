import { isStandalone } from './install';

const persistenceKey = 'ironpact.storage-persistence';
let request: Promise<boolean | undefined> | undefined;

/** Request once per installed origin, including denied results. Never blocks UI. */
export function persistStorageAfterInstall(installed = isStandalone()): Promise<boolean | undefined> {
  if (!installed || typeof navigator === 'undefined'
    || typeof navigator.storage?.persist !== 'function') return Promise.resolve(undefined);
  if (request) return request;

  request = (async () => {
    try {
      const saved = localStorage.getItem(persistenceKey);
      if (saved === 'granted' || saved === 'denied') return saved === 'granted';
    } catch { /* Restricted storage: still deduplicate for this page lifetime. */ }

    try {
      const granted = await navigator.storage.persist();
      try {
        localStorage.setItem(persistenceKey, granted ? 'granted' : 'denied');
      } catch { /* Private mode / quota: persistence is best effort. */ }
      return granted;
    } catch {
      return undefined;
    }
  })();
  return request;
}

if (typeof window !== 'undefined') {
  // appinstalled can fire in the installing browser tab. Wait for standalone
  // before asking, since installation can affect the browser's grant heuristic.
  window.addEventListener('appinstalled', () => { void persistStorageAfterInstall(); });
  void persistStorageAfterInstall();
}
