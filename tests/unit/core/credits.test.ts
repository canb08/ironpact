import { expect, it } from 'vitest';
import { weekCredits } from '../../../src/core/credits.ts';
import type { CreditEntries } from '../../../src/core/credits.ts';
import { cardio, id, instant, martial, min, session, set } from './fixtures.ts';

const empty: CreditEntries = { sessions: [], sets: [], cardio: [], martial: [], min: [] };
const monday = '2026-10-19';
it('U-C1: each gym/run/martial session with a working entry earns 1, even while open', () => {
  for (const kind of ['gym', 'run', 'martial'] as const) {
    const entries = { ...empty, sessions: [{ ...session, kind }], sets: [set], cardio: [cardio], martial: [martial] };
    expect(weekCredits(entries, monday)).toEqual({ credits: 1, minCount: 0, status: 'HELD' });
    expect(weekCredits({ ...entries, sessions: [{ ...session, kind, ended_at: instant }] }, monday).credits).toBe(1);
  }
});
it('E5.6: Floor MIN awards 0.5 per row and never 1 for the session itself', () => {
  const entries = { ...empty, sessions: [{ ...session, kind: 'min' as const }], min: [min] };
  expect(weekCredits(entries, monday)).toEqual({ credits: 0.5, minCount: 1, status: 'HELD' });
  expect(weekCredits({ ...entries, min: [] }, monday).credits).toBe(0);
  expect(weekCredits({ ...entries, min: [min, { ...min, id: id(10) }] }, monday).credits).toBe(1);
  expect(weekCredits({ ...empty, sessions: [{ ...session, mode: 'min' }], sets: [set], min: [min] }, monday))
    .toEqual({ credits: 1, minCount: 0, status: 'HELD' });
});
it('U-C2: two sessions plus MINs cap at 2 per date; another date has its own cap', () => {
  const entries: CreditEntries = {
    ...empty,
    sessions: [session, { ...session, id: id(10) }, { ...session, id: id(11), kind: 'min' }, { ...session, id: id(12), local_date: '2026-10-24' }],
    sets: [set, { ...set, id: id(13), session_id: id(10) }, { ...set, id: id(14), session_id: id(12) }],
    min: [{ ...min, session_id: id(11) }, { ...min, id: id(15), session_id: id(11) }],
  };
  expect(weekCredits(entries, monday)).toEqual({ credits: 3, minCount: 2, status: 'FULL' });
  expect(weekCredits({ ...entries, sessions: [...entries.sessions].reverse(), min: [...entries.min].reverse() }, monday)).toEqual(weekCredits(entries, monday));
  const onlyMin = { ...empty, sessions: [{ ...session, kind: 'min' as const }], min: Array.from({ length: 6 }, (_, n) => ({ ...min, id: id(n + 20) })) };
  expect(weekCredits(onlyMin, monday)).toEqual({ credits: 2, minCount: 6, status: 'HELD' });
});
it('U-C3: empty, warm-up-only, deleted, orphaned, or other-owner entries give no credit', () => {
  expect(weekCredits({ ...empty, sessions: [session] }, monday).credits).toBe(0);
  expect(weekCredits({ ...empty, sessions: [session], sets: [{ ...set, is_warmup: true }] }, monday).credits).toBe(0);
  expect(weekCredits({ ...empty, sessions: [{ ...session, deleted_at: instant }], sets: [set] }, monday).credits).toBe(0);
  for (const row of [{ ...set, deleted_at: instant }, { ...set, session_id: id(99) }, { ...set, user_id: id(99) }]) {
    expect(weekCredits({ ...empty, sessions: [session], sets: [row] }, monday).credits).toBe(0);
  }
  expect(weekCredits({ ...empty, sets: [set], min: [min] }, monday).credits).toBe(0);
  expect(weekCredits({ ...empty, sessions: [{ ...session, kind: 'min' }], min: [{ ...min, deleted_at: instant }] }, monday).credits).toBe(0);
});
it('U-C4: default/custom target FULL, HELD, REST thresholds', () => {
  expect(weekCredits(empty, monday)).toEqual({ credits: 0, minCount: 0, status: 'REST' });
  const entries = { ...empty, sessions: [session], sets: [set] };
  expect(weekCredits(entries, monday, 1).status).toBe('FULL');
  expect(weekCredits(entries, monday, 7).status).toBe('HELD');
  for (const target of [0, 8, 1.5, NaN]) expect(() => weekCredits(entries, monday, target)).toThrow(RangeError);
  expect(() => weekCredits(entries, '2026-10-25')).toThrow(RangeError);
});
it('E5.5/D9: uses inherited local_date across midnight/travel; outside week excluded', () => {
  const entries = { ...empty, sessions: [{ ...session, started_at: '2026-10-26T01:00:00Z', ended_at: '2026-10-26T02:00:00Z', tz: 'Asia/Tokyo' }], sets: [{ ...set, local_date: '2026-10-26' }] };
  expect(weekCredits(entries, monday).credits).toBe(1);
  expect(weekCredits(entries, '2026-10-26').credits).toBe(0);
  for (const local_date of ['2026-10-18', '2026-10-26']) {
    expect(weekCredits({ ...entries, sessions: [{ ...session, local_date }] }, monday).credits).toBe(0);
  }
  expect(weekCredits({ ...empty, sessions: [{ ...session, local_date: monday }], sets: [set] }, monday).credits).toBe(1);
});
it('counts unique rows once and does not mutate input', () => {
  const entries = { ...empty, sessions: [{ ...session, kind: 'min' as const }, { ...session, kind: 'min' as const }], min: [min, min] };
  const before = structuredClone(entries);
  expect(weekCredits(entries, monday)).toEqual({ credits: 0.5, minCount: 1, status: 'HELD' });
  expect(entries).toEqual(before);
  expect(weekCredits({ ...empty, sessions: [session, session], sets: [set, set] }, monday).credits).toBe(1);
});
