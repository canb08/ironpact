import { useEffect, useSyncExternalStore } from 'react';
import type { TierName } from '../../core/streak.ts';
import type { RingMember } from '../../ui/Ring.tsx';
import { MOMENT_KIND, MomentHost, moments, registerMomentView, useReducedMotion } from '../../ui';
import { BarTierMoment } from './BarTierMoment.tsx';
import { PartnerShockwave } from './PartnerShockwave.tsx';
import { RingClose } from './RingClose.tsx';
import { partnerShockwaveSnapshot, subscribePartnerShockwaves } from './shockwave.ts';
import {
  rememberRingClose,
  ringCloseMomentId,
  ringCloseWasSeen,
} from './ringClose.ts';
import {
  readStoredTier,
  tierMomentDecision,
  tierMomentId,
  writeStoredTier,
} from './tierMoment.ts';

export function DuoMoments({
  screen,
  crewId,
  weekStart,
  members,
  weekFull,
  plates,
  tier,
  reduced = false,
  archived = false,
  inSession = false,
}: {
  screen: string;
  crewId: string | null;
  weekStart: string;
  members: readonly RingMember[];
  weekFull: boolean;
  plates: number;
  tier: TierName;
  reduced?: boolean;
  archived?: boolean;
  inSession?: boolean;
}) {
  return (
    <>
      <MomentHost screen={screen} />
      <RingCloseController
        crewId={crewId}
        weekStart={weekStart}
        members={members}
        weekFull={weekFull}
        archived={archived}
        reduced={reduced}
      />
      <BarTierController plates={plates} tier={tier} reduced={reduced} />
      <ShockwaveSlot reduced={reduced} inSession={inSession} />
    </>
  );
}

function ShockwaveSlot({ reduced, inSession }: { reduced: boolean; inSession: boolean }) {
  const events = useSyncExternalStore(subscribePartnerShockwaves, partnerShockwaveSnapshot, partnerShockwaveSnapshot);
  return <PartnerShockwave events={events} inSession={inSession} reduced={reduced} />;
}

function RingCloseController({
  crewId,
  weekStart,
  members,
  weekFull,
  archived,
  reduced,
}: {
  crewId: string | null;
  weekStart: string;
  members: readonly RingMember[];
  weekFull: boolean;
  archived: boolean;
  reduced: boolean;
}) {
  const still = useReducedMotion(reduced);

  useEffect(() => {
    if (!crewId) return;
    const id = ringCloseMomentId(crewId, weekStart);
    moments.register({ id, tier: 1, kind: MOMENT_KIND.ringClose });
    const drop = registerMomentView(id, () => <RingClose members={members} reduced={still} />);
    return () => {
      drop();
      moments.unregister(id);
    };
  }, [crewId, weekStart, members, still]);

  useEffect(() => {
    if (!crewId) return;
    const id = ringCloseMomentId(crewId, weekStart);
    return moments.subscribe(() => {
      if (moments.active()?.id === id) rememberRingClose(crewId, weekStart);
    });
  }, [crewId, weekStart]);

  useEffect(() => {
    if (!crewId || archived || !weekFull || members.length < 2) return;
    if (ringCloseWasSeen(crewId, weekStart)) return;
    moments.trigger(ringCloseMomentId(crewId, weekStart), performance.now());
  }, [crewId, weekStart, weekFull, archived, members.length]);

  return null;
}

function BarTierController({ plates, tier, reduced }: { plates: number; tier: TierName; reduced: boolean }) {
  const still = useReducedMotion(reduced);

  useEffect(() => {
    const id = tierMomentId(tier);
    moments.register({ id, tier: 1, kind: MOMENT_KIND.barTierUp });
    const drop = registerMomentView(id, () => <BarTierMoment tier={tier} plates={plates} reduced={still} />);
    return () => {
      drop();
      moments.unregister(id);
    };
  }, [tier, plates, still]);

  useEffect(() => {
    const id = tierMomentId(tier);
    return moments.subscribe(() => {
      if (moments.active()?.id === id) writeStoredTier(tier);
    });
  }, [tier]);

  useEffect(() => {
    const decision = tierMomentDecision(readStoredTier(), tier);
    if (!decision.celebrate) {
      writeStoredTier(decision.store);
      return;
    }
    moments.trigger(tierMomentId(decision.celebrate), performance.now());
  }, [tier]);

  return null;
}
