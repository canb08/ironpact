import { expect, it } from 'vitest';
import { volume } from '../../../src/core/volume.ts';
import { set } from './fixtures.ts';

it('sums reps × kg over working sets and excludes warm-ups', () => {
  expect(volume([set, { ...set, reps: 3, weight_kg: 85 }, { ...set, is_warmup: true }])).toBe(755);
  expect(volume([])).toBe(0);
  expect(volume([{ ...set, is_warmup: true }])).toBe(0);
});
it('uses added load for BW unless bodyweight is given, including assistance', () => {
  const bw = [{ ...set, weight_kg: 10 }, { ...set, reps: 3, weight_kg: -15 }];
  expect(volume(bw, 'bw_lift')).toBe(5);
  expect(volume(bw, 'bw_lift', null)).toBe(5);
  expect(volume(bw, 'bw_lift', 78)).toBe(629);
  expect(volume(bw, 'lift', 78)).toBe(5);
});
