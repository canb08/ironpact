import { expect, it } from 'vitest';
import { e1rm } from '../../../src/core/e1rm.ts';
import { set } from './fixtures.ts';

it('U-E1: Epley 100×5 = 116.67 (preserves unrounded precision)', () => {
  expect(e1rm(set)).toBeCloseTo(116.67, 2);
});
it('U-E2/E3: reps 1 returns weight; 12 computed, 13 excluded', () => {
  expect(e1rm({ ...set, reps: 1 })).toBe(100);
  expect(e1rm({ ...set, reps: 12 })).toBe(140);
  expect(e1rm({ ...set, reps: 13 })).toBeNull();
});
it('U-E4/E5: BW includes known bodyweight and signed assistance', () => {
  expect(e1rm({ ...set, reps: 1, weight_kg: 10 }, 'bw_lift', 78)).toBe(88);
  expect(e1rm({ ...set, reps: 1, weight_kg: -15 }, 'bw_lift', 78)).toBe(63);
  expect(e1rm({ ...set, weight_kg: 0 }, 'bw_lift', 78)).toBeCloseTo(91);
  expect(e1rm(set, 'bw_lift')).toBeNull();
  expect(e1rm(set, 'bw_lift', null)).toBeNull();
  expect(e1rm(set, 'lift', 78)).toBe(e1rm(set));
});
it('excludes warm-ups and rejects invalid reps or effective loads', () => {
  expect(e1rm({ ...set, is_warmup: true })).toBeNull();
  for (const reps of [0, -1, 1.5, NaN, Infinity]) expect(e1rm({ ...set, reps })).toBeNull();
  for (const weight_kg of [-1, NaN, Infinity]) expect(e1rm({ ...set, weight_kg })).toBeNull();
  for (const bw of [0, -1, NaN, Infinity]) expect(e1rm(set, 'bw_lift', bw)).toBeNull();
  expect(e1rm({ ...set, weight_kg: 0 })).toBe(0);
});
