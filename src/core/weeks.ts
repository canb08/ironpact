import { TZDate } from '@date-fns/tz';
import { addDays, format, startOfWeek } from 'date-fns';
import type { Instant, LocalDate } from './types.ts';
import { localDateSchema } from './validate.ts';

function calendarDate(date: LocalDate): TZDate {
  localDateSchema.parse(date);
  return new TZDate(`${date}T00:00:00Z`, 'UTC');
}
// E5.5: stored local_date belongs to a week as a date, never a converted instant.
export function weekStartOf(localDate: LocalDate): LocalDate {
  return format(startOfWeek(calendarDate(localDate), { weekStartsOn: 1 }), 'yyyy-MM-dd');
}
export function weekDates(localDate: LocalDate): LocalDate[] {
  const monday = calendarDate(weekStartOf(localDate));
  return Array.from({ length: 7 }, (_, i) => format(addDays(monday, i), 'yyyy-MM-dd'));
}
// E5.5 / §4.0 D9: use device tz once at session start; children inherit that date.
export function localDateOf(instant: Instant, tz: string): LocalDate {
  return format(new TZDate(instant, tz), 'yyyy-MM-dd');
}
// §2.2: crew-time week for scheduling/display. End is exclusive next Monday.
// Calendar addition handles DST; adding 168 hours would produce wrong boundaries.
export function crewWeekBounds(instant: Instant, crewTz: string): {
  weekStart: LocalDate; start: Instant; end: Instant;
} {
  const start = startOfWeek(new TZDate(instant, crewTz), { weekStartsOn: 1 });
  return { weekStart: format(start, 'yyyy-MM-dd'), start: start.toISOString(), end: addDays(start, 7).toISOString() };
}
