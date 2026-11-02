import { useEffect } from 'react';
import type { RingMember } from '../../ui/Ring.tsx';
import { Ring } from '../../ui/Ring.tsx';
import { copy } from '../../ui/copy.ts';
import { play } from '../../platform/audio.ts';

/** Tier-1 co-op close. Reduced motion is the final CLOSED frame and no particles (§3.9.1). */
export function RingClose({
  members,
  reduced,
}: {
  members: readonly RingMember[];
  reduced: boolean;
}) {
  useEffect(() => {
    if (!reduced) play('ring-chord');
  }, [reduced]);
  const line = members.length > 2 ? copy.ringClosedAll : copy.ringClosed;
  return (
    <section className="ring-close" data-motion={reduced ? 'static' : 'live'} data-testid="ring-close" aria-label={line}>
      <Ring members={members} size="coop" closing reduced={reduced} />
      <p>{line}</p>
    </section>
  );
}
