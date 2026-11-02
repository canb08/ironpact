import { useCallback, useSyncExternalStore } from 'react';
import type { Repo } from '../data/adapter.ts';
import { Button, copy } from '../ui';
import { useRepo } from './useRepo.ts';

const sessionOpen = new WeakMap<Repo, boolean>();

/** True while repo.q.openSession() resolves to a row. Undefined until the first read. */
function useSessionOpen(repo: Repo): boolean | undefined {
  const subscribe = useCallback((notify: () => void) => {
    let alive = true;
    const read = () => {
      void repo.q.openSession().then((session) => {
        if (!alive) return;
        const next = session != null;
        if (sessionOpen.get(repo) !== next) {
          sessionOpen.set(repo, next);
          notify();
        }
      }).catch(() => {
        // A failed read must not offer a reload during a workout.
        if (!alive || sessionOpen.get(repo) === true) return;
        sessionOpen.set(repo, true);
        notify();
      });
    };
    read();
    const timer = window.setInterval(read, 1000);
    document.addEventListener('visibilitychange', read);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', read);
      sessionOpen.delete(repo);
    };
  }, [repo]);
  return useSyncExternalStore(subscribe, () => sessionOpen.get(repo));
}

// getSnapshot has to be synchronous; the subscription fills this from getRegistration().
let waitingRegistration: ServiceWorkerRegistration | undefined;

function snapshotWaiting(): ServiceWorker | null {
  const container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  if (!container?.controller || !waitingRegistration?.waiting) return null;
  return waitingRegistration.waiting;
}

function subscribeWaiting(notify: () => void): () => void {
  const container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  if (!container?.getRegistration) return () => {};
  let alive = true;
  let installing: ServiceWorker | null = null;
  const onState = () => { if (alive) notify(); };
  const watchInstalling = () => {
    const next = waitingRegistration?.installing ?? null;
    if (next === installing) return;
    installing?.removeEventListener('statechange', onState);
    installing = next;
    installing?.addEventListener('statechange', onState);
  };
  const onUpdateFound = () => { watchInstalling(); onState(); };
  void container.getRegistration().then((reg) => {
    if (!alive) return;
    waitingRegistration = reg ?? undefined;
    waitingRegistration?.addEventListener('updatefound', onUpdateFound);
    watchInstalling();
    notify();
  }).catch(() => {});
  container.addEventListener('controllerchange', onState);
  return () => {
    alive = false;
    container.removeEventListener('controllerchange', onState);
    waitingRegistration?.removeEventListener('updatefound', onUpdateFound);
    installing?.removeEventListener('statechange', onState);
    waitingRegistration = undefined;
  };
}

function useWaitingWorker(): ServiceWorker | null {
  return useSyncExternalStore(subscribeWaiting, snapshotWaiting);
}

/** Activate the waiting worker (sw.ts handles SKIP_WAITING) and load the new shell. */
function applyServiceWorkerUpdate(worker: Pick<ServiceWorker, 'postMessage'>): void {
  worker.postMessage({ type: 'SKIP_WAITING' });
  window.location.reload();
}

export function UpdateChip() {
  const repo = useRepo();
  const open = useSessionOpen(repo);
  const waiting = useWaitingWorker();
  if (open !== false || !waiting) return null;
  return (
    <Button variant="secondary" onClick={() => applyServiceWorkerUpdate(waiting)}>
      {copy.swUpdate}
    </Button>
  );
}
