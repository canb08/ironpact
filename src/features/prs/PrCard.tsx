import { useEffect, useRef } from 'react';
import type { PrEventDraft } from '../../core/prs.ts';
import { feel } from '../../ui/feel/feel';
import { BigNumber, Button, copy, fill } from '../../ui';
import { useMotionReduced } from '../../ui/motion/reduced-context.ts';
import { useReducedMotion } from '../../ui/motion/reduced.ts';
import { formatPrKg, prEyebrow } from './label.ts';
import './prCard.css';

/**
 * Plain S9 when motion is reduced (OS query or the in-app toggle).
 * Otherwise the P4B moment queue paints `Takeover` and this returns nothing,
 * so the rest timer underneath keeps running.
 */
export function PrCard({ event, onClose }: { event: PrEventDraft; onClose: () => void }) {
  const profileStill = useMotionReduced();
  const mediaStill = useReducedMotion(false);
  const still = profileStill || mediaStill;
  const closeRef = useRef(onClose);
  const felt = useRef<string | null>(null);
  useEffect(() => {
    if (still && felt.current !== event.source_id) { felt.current = event.source_id; feel('pr', { weightKg: event.value, reducedMotion: true }); }
  }, [event.source_id, event.value, still]);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (still) return undefined;
    let cancel = false;
    let release: (() => void) | undefined;
    void import('./arm.ts').then((mod) => {
      if (cancel) return;
      release = mod.armPrTakeover(event, () => closeRef.current());
    });
    return () => {
      cancel = true;
      release?.();
    };
  }, [still, event]);

  if (!still) return null;
  const delta = event.previous_value == null ? null : event.value - event.previous_value;
  return <section className="pr-card pr-card--still" aria-label={copy.prCardLabel} data-motion="static">
    <p className="pr-card-eyebrow">{prEyebrow(event)}</p>
    <BigNumber value={formatPrKg(event.value)} unit="KG" />
    {delta != null && delta > 0.05 && <p>{fill(copy.prDeltaKg, { kg: formatPrKg(delta) })}</p>}
    <p>{copy.prDetail}</p>
    <Button size="xl" onClick={onClose}>{copy.backToWork}</Button>
  </section>;
}
