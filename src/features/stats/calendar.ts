import type { LocalDate } from '../../core/types.ts';
import { weekStartOf } from '../../core/weeks.ts';
import type { TrendWindow } from './trend.ts';

/** Calendar addition on a `YYYY-MM-DD` date. UTC so a date never shifts across a timezone. */
export function addLocalDays(date: LocalDate, days: number): LocalDate {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Monday of each ISO week that intersects the 12-week trend window, oldest first. */
export function weeksInWindow(window: TrendWindow): LocalDate[] {
  const last = weekStartOf(window.to);
  const weeks: LocalDate[] = [];
  let cursor = weekStartOf(window.from);
  while (cursor <= last) {
    weeks.push(cursor);
    const next = addLocalDays(cursor, 7);
    if (next <= cursor) break;
    cursor = next;
  }
  return weeks;
}
