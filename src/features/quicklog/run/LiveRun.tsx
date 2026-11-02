import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { keepAwake, releaseKeepAwake, screenMaySleep, subscribeScreenMaySleep } from '../../../platform/wakeLock.ts';
import { Button, copy } from '../../../ui';
import { formatClock } from '../time.ts';
import { elapsedSeconds, stoppedDuration } from './model.ts';

function systemNow(): number {
  return Date.now();
}

export default function LiveRun({
  onStop,
  onCancel,
  now = systemNow,
}: {
  onStop: (durationS: number) => void;
  onCancel: () => void;
  now?: () => number;
}) {
  const asleep = useSyncExternalStore(subscribeScreenMaySleep, screenMaySleep, () => false);
  const startedAt = useRef<number | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => () => { releaseKeepAwake(); }, []);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (startedAt.current === null) return;
      setElapsed(elapsedSeconds(startedAt.current, now()));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [now, running]);

  function start() {
    startedAt.current = now();
    setElapsed(0);
    setRunning(true);
    void keepAwake();
  }

  function stop() {
    const started = startedAt.current ?? now();
    const seconds = stoppedDuration(started, now());
    startedAt.current = null;
    setRunning(false);
    releaseKeepAwake();
    onStop(seconds);
  }

  return (
    <div className="ql-run-live">
      <p className="ql-run-live__hint">{copy.y6NoGps}</p>
      <p className="ql-run-live__label" id="run-elapsed">{copy.y6Elapsed}</p>
      <p className="ql-run-live__time" aria-labelledby="run-elapsed" aria-live="polite">{formatClock(elapsed)}</p>
      {running && asleep ? <p className="ql-error" role="status">{copy.screenMaySleep}</p> : null}
      <div className="ql-run-dock">
        {running
          ? <Button size="xl" className="ql-run-hot" onClick={stop}>{copy.y6StopRun}</Button>
          : <Button size="xl" className="ql-run-hot" onClick={start}>{copy.y6StartRun}</Button>}
        <Button variant="quiet" onClick={onCancel}>{copy.y6CancelRun}</Button>
      </div>
    </div>
  );
}
