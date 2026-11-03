import { describe, expect, it } from 'vitest';
import { formatDate } from '../../src/core/formatDate.ts';
import { localDateOf } from '../../src/core/weeks.ts';
import { copy } from '../../src/ui/copy.ts';

describe('display dates', () => {
  it.each([
    ['2026-11-03', '2026-11-03', 'Today'],
    ['2026-11-02', '2026-11-03', 'Yesterday'],
    ['2026-10-31', '2026-11-03', 'Sat 31 Oct'],
    ['2025-11-02', '2026-11-03', '2 Nov 2025'],
    ['2024-02-29', '2024-03-01', 'Yesterday'],
    ['2025-12-31', '2026-01-01', 'Yesterday'],
  ])('formats %s relative to %s', (date, today, expected) => {
    expect(formatDate(date, today, copy)).toBe(expected);
  });

  it('converts token instants to the profile day before formatting', () => {
    const instant = '2026-11-02T23:30:00.000Z';
    expect(formatDate(localDateOf(instant, 'Europe/Amsterdam'), '2026-11-03', copy)).toBe('Today');
    expect(formatDate(localDateOf(instant, 'America/New_York'), '2026-11-03', copy)).toBe('Yesterday');
  });

  it('does not shift stored workout dates across DST boundaries', () => {
    expect(formatDate('2026-03-29', '2026-03-30', copy)).toBe('Yesterday');
    expect(formatDate('2026-10-25', '2026-10-26', copy)).toBe('Yesterday');
  });
});
