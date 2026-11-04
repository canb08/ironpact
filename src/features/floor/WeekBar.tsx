import { useRef, useState } from 'react';
import { useRepo } from '../../app/useRepo';
import { Button, copy } from '../../ui';
import { formatDate } from '../../core/formatDate';
import type { DuoSnapshot } from '../duo/load';
import { loadDuo } from '../duo/load';
import { SharedBar } from './SharedBar';
import { useRepoQuery } from './useRepoQuery';

export function WeekBar({ duo, weightKg, partnerWeightKg }: { duo: DuoSnapshot; weightKg: number; partnerWeightKg: number }) {
  const repo = useRepo();
  const [offset, setOffset] = useState(0);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const past = useRepoQuery(async () => {
    if (offset === 0) return null;
    const date = new Date(duo.nowIso);
    date.setUTCDate(date.getUTCDate() + offset * 7);
    return loadDuo(repo, date.toISOString());
  }, [repo, offset, duo.nowIso]);
  const shown = offset === 0 ? duo : past;
  return <div className="week-bar" style={{ touchAction: 'pan-y' }}
    onPointerDown={(event) => { swipe.current = { x: event.clientX, y: event.clientY }; }}
    onPointerUp={(event) => {
      const start = swipe.current;
      swipe.current = null;
      if (!start || Math.abs(event.clientY - start.y) > 40 || Math.abs(event.clientX - start.x) < 56) return;
      setOffset((value) => Math.min(0, value + (event.clientX > start.x ? 1 : -1)));
    }} onPointerCancel={() => { swipe.current = null; }}>
    <div className="week-bar__weeks">
      <Button variant="ghost" aria-label={copy.x6PreviousWeek} onClick={() => setOffset((value) => value - 1)}>‹</Button>
      <span aria-live="polite">{offset === 0 ? copy.x1ThisWeek : shown ? formatDate(shown.me.weekStart, duo.me.today, copy, false) : copy.loading}</span>
      <Button variant="ghost" aria-label={copy.x6NextWeek} disabled={offset === 0} onClick={() => setOffset((value) => Math.min(0, value + 1))}>›</Button>
    </div>
    {shown ? <SharedBar key={shown.me.weekStart} me={{ ...shown.me, weightKg }} partner={shown.partners[0] ? { ...shown.partners[0], weightKg: partnerWeightKg } : undefined}
      reduced={duo.reduceMotion} current={offset === 0 && !duo.archived} /> : <div className="week-bar__loading" aria-busy="true" />}
  </div>;
}
