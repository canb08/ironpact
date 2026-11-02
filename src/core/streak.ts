import { TZDate } from '@date-fns/tz';
import type { WeekCredits } from './credits.ts';
import type { Instant, LocalDate, Uuid } from './types.ts';

// §2.2 / §1.6 D6 / §10 E2.1. Freeze tokens are not built. The server week row wins.
export type WeekStatus = WeekCredits['status'];
export type PlateDelta = -1 | 0 | 1;
export type TierName = 'Iron' | 'Steel' | 'Titanium' | 'Obsidian';
export type BarOutcome = 'closed' | 'held' | 'rest' | 'spotted';
export type BarCopyKey = 'ringClosed' | 'ringClosedAll' | 'barHeld' | 'restWeek' | 'spotted';

export interface CloseMember {
  userId: Uuid;
  status: WeekStatus;
  /** A `streak_tokens` row with kind 'spot' covers this member. Freeze is ignored. */
  spotted: boolean;
}

export interface BarStep {
  delta: PlateDelta;
  platesAfter: number;
  outcome: BarOutcome;
  copyKey: BarCopyKey;
}

export interface WeekClose extends BarStep {
  source: 'server' | 'local';
  adjustedAfterEdit: boolean;
  noticeKey: 'barAdjusted' | null;
}

export interface ServerClose {
  plateDelta: PlateDelta;
  platesAfter: number;
  adjustedAfterEdit: boolean;
}

const SPOTS_PER_MONTH = 1;

function assertPlates(plates: number): void {
  if (!Number.isInteger(plates) || plates < 0) throw new RangeError('Plate count must be a non-negative integer');
}

function assertTarget(target: number): void {
  if (!Number.isInteger(target) || target < 1 || target > 7) throw new RangeError('Weekly target must be 1–7');
}

/** E2.1: 0–3 Iron, 4–7 Steel, 8–15 Titanium, 16+ Obsidian. No Bare bar, no Bronze. */
export function tierName(plates: number): TierName {
  assertPlates(plates);
  if (plates <= 3) return 'Iron';
  if (plates <= 7) return 'Steel';
  if (plates <= 15) return 'Titanium';
  return 'Obsidian';
}

function deltaFor(members: readonly CloseMember[]): PlateDelta {
  if (members.every((member) => member.status === 'FULL')) return 1;
  const resting = members.filter((member) => member.status === 'REST');
  if (resting.length === 0) return 0;
  return resting.every((member) => member.spotted) ? 0 : -1;
}

function labelFor(delta: PlateDelta, members: readonly CloseMember[]): Pick<BarStep, 'outcome' | 'copyKey'> {
  if (delta === 1) {
    return { outcome: 'closed', copyKey: members.length > 2 ? 'ringClosedAll' : 'ringClosed' };
  }
  if (delta === -1) return { outcome: 'rest', copyKey: 'restWeek' };
  const covered = members.some((member) => member.status === 'REST' && member.spotted);
  return covered ? { outcome: 'spotted', copyKey: 'spotted' } : { outcome: 'held', copyKey: 'barHeld' };
}

/** FULL/FULL +1, mixed HELD 0, REST −1 unless every REST member is spotted, floor 0. */
export function barStep(members: readonly CloseMember[], platesBefore: number): BarStep {
  assertPlates(platesBefore);
  if (members.length === 0) throw new RangeError('A crew week needs at least one member');
  const delta = deltaFor(members);
  return { delta, platesAfter: Math.max(0, platesBefore + delta), ...labelFor(delta, members) };
}

/**
 * Local preview of Monday's close. A server `crew_weeks` row replaces the
 * numbers; the client does not get to disagree (§2.2, Phase 3).
 */
export function previewWeekClose(input: {
  members: readonly CloseMember[];
  platesBefore: number;
  server: ServerClose | null;
}): WeekClose {
  if (input.members.length === 0) throw new RangeError('A crew week needs at least one member');
  if (input.server) {
    assertPlates(input.server.platesAfter);
    return {
      delta: input.server.plateDelta,
      platesAfter: input.server.platesAfter,
      ...labelFor(input.server.plateDelta, input.members),
      source: 'server',
      adjustedAfterEdit: input.server.adjustedAfterEdit,
      noticeKey: input.server.adjustedAfterEdit ? 'barAdjusted' : null,
    };
  }
  return { ...barStep(input.members, input.platesBefore), source: 'local', adjustedAfterEdit: false, noticeKey: null };
}

function sameStatuses(previous: readonly CloseMember[], next: readonly CloseMember[]): boolean {
  if (previous.length !== next.length) return false;
  const statuses = new Map(previous.map((member) => [member.userId, member.status]));
  return next.every((member) => statuses.get(member.userId) === member.status);
}

/** Recompute a closed week only when a member's FULL/HELD/REST status changed. */
export function closeAfterEdit(input: {
  platesBefore: number;
  previous: readonly CloseMember[];
  next: readonly CloseMember[];
}): WeekClose {
  const changed = !sameStatuses(input.previous, input.next);
  const step = barStep(changed ? input.next : input.previous, input.platesBefore);
  return { ...step, source: 'local', adjustedAfterEdit: changed, noticeKey: changed ? 'barAdjusted' : null };
}

/** Sunday from 12:00 crew time, until that local day ends. Monday close is the server's. */
export function spotWindowOpen(now: Instant, crewTz: string): boolean {
  const local = new TZDate(now, crewTz);
  return local.getDay() === 0 && local.getHours() >= 12;
}

function crewMonth(now: Instant, crewTz: string): string {
  const local = new TZDate(now, crewTz);
  const month = local.getMonth() + 1;
  return `${local.getFullYear()}-${month < 10 ? `0${month}` : String(month)}`;
}

export interface SpotOffer {
  coversUserId: Uuid;
  eligible: boolean;
  copyKey: 'spotOffer' | 'spotNotEligible';
}

/**
 * One spot per spotter per crew-calendar month, no rollover (D8).
 * The card shows for each partner at REST while the window is open and the
 * month's spot is unused. The button waits until credits ≥ target + 1.
 */
export function spotOffers(input: {
  now: Instant;
  crewTz: string;
  spotter: { userId: Uuid; credits: number; target: number };
  partners: readonly { userId: Uuid; status: WeekStatus }[];
  spotsGivenOn: readonly LocalDate[];
}): SpotOffer[] {
  assertTarget(input.spotter.target);
  if (!Number.isFinite(input.spotter.credits) || input.spotter.credits < 0) {
    throw new RangeError('Spotter credits must be a non-negative number');
  }
  if (!spotWindowOpen(input.now, input.crewTz)) return [];
  const month = crewMonth(input.now, input.crewTz);
  const used = input.spotsGivenOn.filter((date) => date.slice(0, 7) === month).length;
  if (used >= SPOTS_PER_MONTH) return [];
  const eligible = input.spotter.credits >= input.spotter.target + 1;
  return input.partners
    .filter((partner) => partner.userId !== input.spotter.userId && partner.status === 'REST')
    .map((partner) => ({
      coversUserId: partner.userId,
      eligible,
      copyKey: eligible ? 'spotOffer' : 'spotNotEligible',
    }));
}

/** Sum of weekly targets. Three members at target 3 → 9 segments, one arc each. */
export function crewRingCapacity(targets: readonly number[]): number {
  if (targets.length === 0) throw new RangeError('A ring needs at least one member');
  for (const target of targets) assertTarget(target);
  return targets.reduce((sum, target) => sum + target, 0);
}

export interface RingArc {
  userId: Uuid;
  start: number;
  length: number;
}

export function crewRingArcs(members: readonly { userId: Uuid; target: number }[]): {
  capacity: number;
  arcs: RingArc[];
} {
  const capacity = crewRingCapacity(members.map((member) => member.target));
  let cursor = 0;
  const arcs = members.map((member) => {
    const arc = { userId: member.userId, start: cursor, length: member.target };
    cursor += member.target;
    return arc;
  });
  return { capacity, arcs };
}
