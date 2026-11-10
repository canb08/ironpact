import { describe, expect, it } from 'vitest';
import { longestStreak, monthsBetween } from './model.ts';
describe('Proof calendar', () => {
  it('includes months across year boundaries and leap February', () => {
    expect(monthsBetween('2023-12-31', '2024-03-01')).toEqual(['2024-03', '2024-02', '2024-01', '2023-12']);
  });
  it('counts distinct Monday weeks, skips solo cards, and retains the longest past streak', () => {
    expect(longestStreak([
      { day: '2024-12-29', together: true },
      { day: '2024-12-30', together: true },
      { day: '2025-01-05', together: true },
      { day: '2025-01-06', together: true },
      { day: '2025-01-13', together: false },
      { day: '2025-02-03', together: true },
    ])).toBe(3);
    expect(longestStreak([])).toBe(0);
  });
});
