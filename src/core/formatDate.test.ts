import { expect, it } from 'vitest';
import { formatDate } from './formatDate.ts';
const labels = { x5Today: 'Today', x5Yesterday: 'Yesterday' };
it('formats local dates across month and year boundaries without timezone shifts', () => {
  expect(formatDate('2026-11-02', '2026-11-02', labels)).toBe('Today');
  expect(formatDate('2026-10-31', '2026-11-01', labels)).toBe('Yesterday');
  expect(formatDate('2025-12-31', '2026-01-01', labels)).toBe('Yesterday');
  expect(formatDate('2026-11-02', '2026-11-04', labels)).toBe('Mon 2 Nov');
  expect(formatDate('2025-11-02', '2026-11-04', labels)).toBe('2 Nov 2025');
  expect(formatDate('2026-02-30', '2026-11-04', labels)).toBe('2026-02-30');
});

it('uses plain calendar dates at both range ends, even for today and yesterday', () => {
  expect(formatDate('2026-11-02', '2026-11-02', labels, false)).toBe('Mon 2 Nov');
  expect(formatDate('2026-11-01', '2026-11-02', labels, false)).toBe('Sun 1 Nov');
  expect(formatDate('2025-12-31', '2026-01-01', labels, false)).toBe('31 Dec 2025');
  expect(formatDate('2026-01-01', '2026-01-01', labels, false)).toBe('Thu 1 Jan');
  expect(formatDate('2026-02-30', '2026-11-02', labels, false)).toBe('2026-02-30');
});
