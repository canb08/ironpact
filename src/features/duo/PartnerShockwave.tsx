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
    let hide: number | undefined;
    let cancelled = false;
    const start = window.setTimeout(() => {
      if (cancelled) return;
      const next = pickShockwave(events, shockwavePlayed(), inSession);
      if (!next) return;
      rememberShockwave(next.id);
      setVisible(next);
      hide = window.setTimeout(() => setVisible(null), SHOCKWAVE_MS);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
      if (hide !== undefined) window.clearTimeout(hide);
    };
  }, [signature, inSession, events]);

  if (!visible) return null;
  return (
    <aside
      className="shockwave"
      data-testid="partner-shockwave"
      data-motion={reduced ? 'static' : 'live'}
      data-shockwave={visible.id}
    >
      <p className="shockwave__stamp">{copy.shockwaveStamp}</p>
      <p className="shockwave__line">
        {fill(copy.shockwaveLine, { name: visible.name, exercise: visible.exercise, detail: visible.detail })}
      </p>
    </aside>
  );
}
