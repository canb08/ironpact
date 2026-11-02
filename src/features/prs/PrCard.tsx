import type { PrEventDraft } from '../../core/prs.ts';
import { BigNumber, Button, copy } from '../../ui';
import { formatPrKg, prEyebrow } from './label.ts';
import './prCard.css';

/** Plain S9. Phase 4 replaces this card with the takeover. */
export function PrCard({ event, onClose }: { event: PrEventDraft; onClose: () => void }) {
  const delta = event.previous_value == null ? null : event.value - event.previous_value;
  return <section className="pr-card" aria-label={copy.prCardLabel}>
    <p className="pr-card-eyebrow">{prEyebrow(event)}</p>
    <BigNumber value={formatPrKg(event.value)} unit="KG" />
    {delta != null && delta > 0.05 && <p>+{formatPrKg(delta)} KG</p>}
    <p>{copy.prDetail}</p>
    <Button size="xl" onClick={onClose}>{copy.backToWork}</Button>
  </section>;
}
