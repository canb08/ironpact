import { TZDate } from '@date-fns/tz';
import { expect, it } from 'vitest';
import { barStep, closeAfterEdit, crewRingArcs, previewWeekClose, spotOffers, spotWindowOpen, tierName } from '../../../src/core/streak.ts';
import type { CloseMember } from '../../../src/core/streak.ts';
import { copy } from '../../../src/ui/copy.ts';
import { id } from './fixtures.ts';

const a = id(2);
const b = id(3);
const c = id(4);
const member = (userId: string, status: CloseMember['status'], spotted = false): CloseMember => ({ userId, status, spotted });
const tz = 'Europe/Amsterdam';
const at = (year: number, month: number, day: number, hour: number, minute = 0, second = 0, zone = tz) =>
  new TZDate(year, month - 1, day, hour, minute, second, zone).toISOString();
const sunday = at(2026, 10, 18, 12);

it('U-B1: both FULL → +1 plate', () => {
  const step = barStep([member(a, 'FULL'), member(b, 'FULL')], 4);
  expect(step).toMatchObject({ delta: 1, platesAfter: 5, outcome: 'closed', copyKey: 'ringClosed' });
  expect(copy[step.copyKey]).toBe("CLOSED. Both of you. That's the job.");
});

it('U-B2: both ≥HELD → 0', () => {
  expect(barStep([member(a, 'HELD'), member(b, 'FULL')], 4)).toMatchObject({ delta: 0, platesAfter: 4, outcome: 'held', copyKey: 'barHeld' });
  expect(barStep([member(a, 'HELD'), member(b, 'HELD')], 4).delta).toBe(0);
  expect(copy.barHeld).toBe('Bar held.');
});

it('U-B3: one REST → −1, floor 0', () => {
  expect(barStep([member(a, 'FULL'), member(b, 'REST')], 4)).toMatchObject({ delta: -1, platesAfter: 3, outcome: 'rest', copyKey: 'restWeek' });
  expect(barStep([member(a, 'REST'), member(b, 'REST', true)], 0)).toMatchObject({ delta: -1, platesAfter: 0 });
  expect(barStep([member(a, 'REST'), member(b, 'HELD'), member(c, 'FULL')], 2).delta).toBe(-1);
  expect(copy.restWeek).toBe('Rest week. The bar will wait.');
});

it('U-B4: REST covered by spot → 0', () => {
  const step = barStep([member(a, 'FULL'), member(b, 'REST', true)], 4);
  expect(step).toMatchObject({ delta: 0, platesAfter: 4, outcome: 'spotted', copyKey: 'spotted' });
  expect(barStep([member(a, 'REST', true), member(b, 'REST', true)], 1).delta).toBe(0);
  expect(copy[step.copyKey]).toBe('{partner} spotted you. Week saved.');
});

it('U-B5: spot needs credits ≥ target+1 and 1 per calendar month', () => {
  const base = { now: sunday, crewTz: tz, partners: [{ userId: b, status: 'REST' as const }], spotsGivenOn: [] as string[] };
  expect(spotOffers({ ...base, spotter: { userId: a, credits: 4, target: 3 } })).toEqual([
    { coversUserId: b, eligible: true, copyKey: 'spotOffer' },
  ]);
  expect(spotOffers({ ...base, spotter: { userId: a, credits: 3.5, target: 3 } })).toEqual([
    { coversUserId: b, eligible: false, copyKey: 'spotNotEligible' },
  ]);
  expect(copy.spotOffer).toBe("{partner}'s week is light. You can cover it.");
  expect(copy.spotNotEligible).toBe('Log one past your target to cover {partner}.');
  expect(spotOffers({ ...base, spotter: { userId: a, credits: 6, target: 3 }, spotsGivenOn: ['2026-10-04'] })).toEqual([]);
  expect(spotOffers({ ...base, spotter: { userId: a, credits: 6, target: 3 }, spotsGivenOn: ['2026-09-27'] })).toHaveLength(1);
  const september = at(2026, 9, 27, 12);
  expect(spotOffers({ ...base, now: september, spotter: { userId: a, credits: 4, target: 3 } })).toHaveLength(1);
  const november = at(2026, 11, 1, 12);
  expect(spotOffers({ ...base, now: november, spotter: { userId: a, credits: 4, target: 3 }, spotsGivenOn: ['2026-10-31'] })).toHaveLength(1);
});

it('spot window is Sunday from 12:00 in the crew zone, and only a REST partner is offered', () => {
  expect(spotWindowOpen(at(2026, 10, 18, 12), tz)).toBe(true);
  expect(spotWindowOpen(at(2026, 10, 18, 11, 59, 59), tz)).toBe(false);
  expect(spotWindowOpen(at(2026, 10, 17, 18), tz)).toBe(false);
  expect(spotWindowOpen(at(2026, 10, 18, 23, 30), tz)).toBe(true);
  expect(spotWindowOpen(at(2026, 10, 25, 12), tz)).toBe(true);
  expect(spotWindowOpen(at(2027, 3, 28, 12), tz)).toBe(true);
  expect(spotWindowOpen(at(2026, 10, 26, 0, 5), tz)).toBe(false);
  const boundary = at(2026, 10, 18, 0, 30);
  expect(spotWindowOpen(boundary, tz)).toBe(false);
  expect(spotWindowOpen(boundary, 'Pacific/Kiritimati')).toBe(true);
  const spotter = { userId: a, credits: 5, target: 3 };
  expect(spotOffers({ now: sunday, crewTz: tz, spotter, partners: [{ userId: b, status: 'HELD' }], spotsGivenOn: [] })).toEqual([]);
  expect(spotOffers({
    now: sunday, crewTz: tz, spotter, spotsGivenOn: [],
    partners: [{ userId: a, status: 'REST' }, { userId: b, status: 'REST' }, { userId: c, status: 'FULL' }],
  }).map((offer) => offer.coversUserId)).toEqual([b]);
  expect(spotOffers({ now: at(2026, 10, 18, 11), crewTz: tz, spotter, partners: [{ userId: b, status: 'REST' }], spotsGivenOn: [] })).toEqual([]);
  for (const target of [0, 8, 1.5]) {
    expect(() => spotOffers({ now: sunday, crewTz: tz, spotter: { ...spotter, target }, partners: [], spotsGivenOn: [] })).toThrow(RangeError);
  }
  expect(() => spotOffers({ now: sunday, crewTz: tz, spotter: { ...spotter, credits: Number.NaN }, partners: [], spotsGivenOn: [] })).toThrow(RangeError);
});

it('U-B6: tier names Iron 0–3, Steel 4–7, Titanium 8–15, Obsidian 16+', () => {
  expect([0, 3].map(tierName)).toEqual(['Iron', 'Iron']);
  expect([4, 7].map(tierName)).toEqual(['Steel', 'Steel']);
  expect([8, 15].map(tierName)).toEqual(['Titanium', 'Titanium']);
  expect(tierName(16)).toBe('Obsidian');
  expect(tierName(40)).toBe('Obsidian');
  expect(copy.platesLabel).toBe('PLATES');
  for (const plates of [-1, 1.5, Number.NaN]) expect(() => tierName(plates)).toThrow(RangeError);
});

it('U-B7: N=3 crew ring = 3 × targets', () => {
  const ring = crewRingArcs([{ userId: a, target: 3 }, { userId: b, target: 3 }, { userId: c, target: 3 }]);
  expect(ring.capacity).toBe(9);
  expect(ring.arcs).toEqual([
    { userId: a, start: 0, length: 3 },
    { userId: b, start: 3, length: 3 },
    { userId: c, start: 6, length: 3 },
  ]);
  const mixed = crewRingArcs([{ userId: a, target: 1 }, { userId: b, target: 7 }]);
  expect(mixed.capacity).toBe(8);
  expect(mixed.arcs.map((arc) => arc.start + arc.length)).toEqual([1, 8]);
  expect(() => crewRingArcs([])).toThrow(RangeError);
});

it('local week-close preview loses to the server row', () => {
  const members = [member(a, 'FULL'), member(b, 'FULL')];
  expect(previewWeekClose({ members, platesBefore: 4, server: null })).toMatchObject({
    source: 'local', delta: 1, platesAfter: 5, adjustedAfterEdit: false, noticeKey: null,
  });
  expect(previewWeekClose({
    members, platesBefore: 4,
    server: { plateDelta: 0, platesAfter: 4, adjustedAfterEdit: false },
  })).toMatchObject({ source: 'server', delta: 0, platesAfter: 4, outcome: 'held', copyKey: 'barHeld' });
  expect(previewWeekClose({
    members: [member(a, 'REST', true), member(b, 'HELD')], platesBefore: 2,
    server: { plateDelta: 0, platesAfter: 2, adjustedAfterEdit: true },
  })).toMatchObject({ source: 'server', outcome: 'spotted', adjustedAfterEdit: true, noticeKey: 'barAdjusted' });
  expect(copy.barAdjusted).toBe('Bar adjusted after edit.');
  expect(copy.ringClosedAll).toBe("CLOSED. All of you. That's the job.");
  expect(barStep([member(a, 'FULL'), member(b, 'FULL'), member(c, 'FULL')], 8).copyKey).toBe('ringClosedAll');
  expect(() => previewWeekClose({ members: [], platesBefore: 0, server: null })).toThrow(RangeError);
  expect(() => barStep([], 0)).toThrow(RangeError);
  expect(() => barStep(members, -1)).toThrow(RangeError);
});

it('an edit recomputes a closed week only when a status changes', () => {
  const full = [member(a, 'FULL'), member(b, 'FULL')];
  const rested = [member(a, 'FULL'), member(b, 'REST')];
  expect(closeAfterEdit({ platesBefore: 5, previous: full, next: [...full].reverse() })).toMatchObject({
    adjustedAfterEdit: false, noticeKey: null, delta: 1, platesAfter: 6,
  });
  expect(closeAfterEdit({ platesBefore: 5, previous: full, next: rested })).toMatchObject({
    adjustedAfterEdit: true, noticeKey: 'barAdjusted', delta: -1, platesAfter: 4, copyKey: 'restWeek',
  });
  const spottedOnly = [member(a, 'FULL'), member(b, 'REST', true)];
  expect(closeAfterEdit({ platesBefore: 5, previous: rested, next: spottedOnly })).toMatchObject({
    adjustedAfterEdit: false, delta: -1, platesAfter: 4,
  });
  expect(closeAfterEdit({ platesBefore: 5, previous: full, next: [member(a, 'FULL'), member(c, 'HELD')] })).toMatchObject({
    adjustedAfterEdit: true, delta: 0, outcome: 'held',
  });
  expect(closeAfterEdit({ platesBefore: 1, previous: full, next: [member(a, 'REST')] })).toMatchObject({
    adjustedAfterEdit: true, delta: -1, platesAfter: 0,
  });
});
