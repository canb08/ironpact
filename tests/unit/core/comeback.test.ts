import { expect, it } from 'vitest';
import { comebackState } from '../../../src/core/comeback.ts';
import { copy } from '../../../src/ui/copy.ts';

it('U-CB1: ≥5 days since last credit → comeback; next credit clears', () => {
  expect(comebackState('2026-10-20', '2026-10-25')).toEqual({ active: true });
  expect(comebackState('2026-10-19', '2026-10-25')).toEqual({ active: true });
  expect(comebackState('2026-10-21', '2026-10-25')).toEqual({ active: false });
  expect(comebackState('2026-10-25', '2026-10-25')).toEqual({ active: false });
  expect(comebackState(null, '2026-10-25')).toEqual({ active: false });
  expect(comebackState('2026-10-26', '2026-10-25')).toEqual({ active: false });
  expect(Object.keys(comebackState('2026-10-01', '2026-10-25'))).toEqual(['active']);
  expect(copy.comeback).toBe('Welcome back. You owe nothing.');
  expect(copy.shortSession).toBe('20-min session');
  expect(copy.justMin).toBe('Just log MIN');
  expect(`${copy.comeback} ${copy.shortSession} ${copy.justMin}`).not.toMatch(/\d+\s*days/);
  expect(() => comebackState('2026-10-25T23:30:00Z', '2026-10-25')).toThrow();
});
