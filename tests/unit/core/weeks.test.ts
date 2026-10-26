import { addDays, format } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { expect, it } from 'vitest';
import { crewWeekBounds, localDateOf, weekDates, weekStartOf } from '../../../src/core/weeks.ts';

const tz = 'Europe/Amsterdam';
it('U-W1/W2: 25-hour Sunday 23:30 stays in old week; Monday midnight starts a new one', () => {
  expect(localDateOf('2026-10-25T22:30:00Z', tz)).toBe('2026-10-25');
  expect(weekStartOf('2026-10-25')).toBe('2026-10-19');
  expect(crewWeekBounds('2026-10-25T22:30:00Z', tz)).toEqual({
    weekStart: '2026-10-19', start: '2026-10-19T00:00:00.000+02:00', end: '2026-10-26T00:00:00.000+01:00',
  });
  expect(weekStartOf(localDateOf('2026-10-25T23:00:00Z', tz))).toBe('2026-10-26');
});
it('U-W3: 23-hour Sunday week ends at local Monday midnight', () => {
  const bounds = crewWeekBounds('2027-03-28T21:30:00Z', tz);
  expect(bounds.weekStart).toBe('2027-03-22');
  expect(new Date(bounds.start).toISOString()).toBe('2027-03-21T23:00:00.000Z');
  expect(new Date(bounds.end).toISOString()).toBe('2027-03-28T22:00:00.000Z');
  expect(weekStartOf('2027-03-29')).toBe('2027-03-29');
});
it('U-W4: calendar week boundaries across every date of 2026–2028 (not 168-hour addition)', () => {
  const hours = new Set<number>();
  for (let day = new TZDate('2026-01-01T12:00:00Z', 'UTC'); day.getUTCFullYear() <= 2028; day = addDays(day, 1)) {
    const date = format(day, 'yyyy-MM-dd');
    const bounds = crewWeekBounds(day.toISOString(), tz);
    const dates = weekDates(date);
    expect(dates).toContain(date);
    expect(dates[0]).toBe(weekStartOf(date));
    expect(dates).toHaveLength(7);
    expect(new Set(dates).size).toBe(7);
    const start = new TZDate(bounds.start, tz);
    const end = new TZDate(bounds.end, tz);
    expect([start.getDay(), start.getHours(), end.getDay(), end.getHours()]).toEqual([1, 0, 1, 0]);
    expect(format(addDays(start, 7), 'yyyy-MM-dd')).toBe(format(end, 'yyyy-MM-dd'));
    hours.add((end.getTime() - start.getTime()) / 3600000);
  }
  expect([...hours].sort()).toEqual([167, 168, 169]);
});
it('U-W5/W6: session date comes from device at start; crew week display uses crew tz', () => {
  const start = '2026-10-25T22:30:00Z';
  const stored = localDateOf(start, tz);
  expect(stored).toBe('2026-10-25');
  expect(localDateOf('2026-10-25T23:40:00Z', tz)).toBe('2026-10-26');
  expect(weekStartOf(stored)).toBe('2026-10-19');
  expect(localDateOf(start, 'Asia/Tokyo')).toBe('2026-10-26');
  expect(crewWeekBounds(start, tz).weekStart).toBe('2026-10-19');
  expect(crewWeekBounds(start, 'Asia/Tokyo').weekStart).toBe('2026-10-26');
});
it('lists dates over year/leap boundaries and rejects instants or invalid dates as date inputs', () => {
  expect(weekDates('2027-01-01')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  expect(weekDates('2028-02-29')).toContain('2028-02-29');
  for (const date of ['2027-02-29', '2026-13-01', '2026-10-25T23:30:00Z', 'bad']) expect(() => weekStartOf(date)).toThrow();
  expect(() => localDateOf('bad', tz)).toThrow();
});
