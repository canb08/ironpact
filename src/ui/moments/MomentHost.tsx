import { useEffect, useSyncExternalStore } from 'react';
import { useMotionReduced } from '../motion/reduced-context';
import { momentView } from './registry';
import { moments as appMoments, type MomentQueue } from './queue';
import './moment.css';

/**
 * One Tier-1 slot for the current screen open. Tier-2 moments are not rendered here;
 * callers play those inline. With no registered view the slot stays unmounted so it
 * cannot cover the workout. P4C / P4E register views by id.
 */
export function MomentHost({
  screen,
  queue = appMoments,
}: {
  screen: string;
  queue?: MomentQueue;
}) {
  const reduced = useMotionReduced();
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  useEffect(() => {
    queue.openScreen(performance.now());
    return () => queue.closeScreen();
  }, [queue, screen]);
  useEffect(() => {
    const wait = queue.msUntilNext(performance.now());
    if (wait === null) return;
    const timer = window.setTimeout(() => queue.tick(performance.now()), wait);
    return () => window.clearTimeout(timer);
  }, [queue, snapshot]);

  const active = snapshot.active;
  if (!active) return null;
  const view = momentView(active.id);
  if (!view) return null;
  return (
    <div
      className={reduced ? 'moment-host moment-host--static' : 'moment-host'}
      data-motion={reduced ? 'static' : 'live'}
      data-moment={active.id}
      role="status"
      style={{ position: 'fixed', inset: 0, zIndex: 70, pointerEvents: 'none' }}
    >
      {view()}
    </div>
  );
}
