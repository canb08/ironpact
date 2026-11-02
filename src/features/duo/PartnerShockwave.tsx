import { useEffect, useState } from 'react';
import { copy, fill } from '../../ui/copy.ts';
import {
  SHOCKWAVE_MS,
  pickShockwave,
  rememberShockwave,
  shockwavePlayed,
  type ShockwaveEvent,
} from './shockwave.ts';

/**
 * Tier-2 partner PR card. Marks the id seen when it starts, so the next open
 * (a remount) does not play it again. A session defers it without marking.
 */
export function PartnerShockwave({
  events,
  inSession,
  reduced,
}: {
  events: readonly ShockwaveEvent[];
  inSession: boolean;
  reduced: boolean;
}) {
  const [visible, setVisible] = useState<ShockwaveEvent | null>(null);
  const signature = events.map((event) => event.id).join('|');

  useEffect(() => {
    let timer: number | undefined;
    let cancelled = false;
    const played = new Set(shockwavePlayed());
    function next() {
      if (cancelled) return;
      const event = pickShockwave(events, [...played], inSession);
      setVisible(event);
      if (!event) return;
      const key = event.playKey ?? event.id;
      played.add(key);
      rememberShockwave(key);
      event.onPlayed?.();
      timer = window.setTimeout(next, SHOCKWAVE_MS);
    }
    timer = window.setTimeout(next, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [signature, inSession, events]);

  if (!visible || inSession) return null;
  return (
    <aside
      className="shockwave"
      data-testid="partner-shockwave"
      data-motion={reduced ? 'static' : 'live'}
      data-shockwave={visible.id}
    >
      <p className="shockwave__stamp">{copy.shockwaveStamp}</p>
      <p className="shockwave__line">
        {visible.line ?? fill(copy.shockwaveLine, { name: visible.name, exercise: visible.exercise, detail: visible.detail })}
      </p>
    </aside>
  );
}
