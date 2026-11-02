import { createElement } from 'react';
import type { PrEventDraft } from '../../core/prs.ts';
import { MOMENT_KIND, moments } from '../../ui/moments/queue.ts';
import { registerMomentView } from '../../ui/moments/registry.ts';
import { claimPrMoment, releasePrMoment } from './gone.ts';
import { PrMomentSlot } from './Takeover.tsx';

/**
 * Registers the PR on the shared moment queue and paints it through MomentHost.
 * Session keeps rendering `<PrCard>`; this is the mount, so session files stay untouched.
 * Returns a release that hides the view when the card unmounts (Back to work, or the set is deleted).
 */
export function armPrTakeover(event: PrEventDraft, onClose: () => void): () => void {
  const id = `pr:${event.source_id}`;
  const serial = claimPrMoment(id);
  moments.register({ id, tier: 1, kind: MOMENT_KIND.pr });
  const drop = registerMomentView(id, () => createElement(PrMomentSlot, { id, event, onClose }));
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  moments.trigger(id, now);
  return () => {
    drop();
    moments.unregister(id);
    releasePrMoment(id, serial);
  };
}
