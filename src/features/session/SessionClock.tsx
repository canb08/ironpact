import { useEffect, useState } from 'react';
import { copy } from '../../ui';
import { formatSessionClock } from './sessionModel.ts';

export function SessionClock({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  return <time aria-label={copy.sessionClock}>{formatSessionClock(seconds)}</time>;
}
