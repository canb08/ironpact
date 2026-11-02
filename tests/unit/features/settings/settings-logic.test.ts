import { expect, it } from 'vitest';
import { deleteReady } from '../../../../src/features/settings/feel.ts';
import { togglePlate } from '../../../../src/features/settings/plates.ts';

it('delete needs the hold and the exact word DELETE', () => {
  expect(deleteReady(false, 'DELETE')).toBe(false);
  expect(deleteReady(true, 'delete')).toBe(false);
  expect(deleteReady(true, 'DELETE ')).toBe(false);
  expect(deleteReady(true, '')).toBe(false);
  expect(deleteReady(true, 'DELETE')).toBe(true);
});

it('toggles a plate without dropping the rest of the inventory', () => {
  expect(togglePlate([25, 20, 2.5], 20)).toEqual([25, 2.5]);
  expect(togglePlate([25, 2.5], 10)).toEqual([25, 10, 2.5]);
  expect(togglePlate([25], 25)).toEqual([]);
});
