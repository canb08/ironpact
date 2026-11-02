import { TZDate } from '@date-fns/tz';
import { differenceInCalendarDays } from 'date-fns';
import type { LocalDate } from './types.ts';
import { localDateSchema } from './validate.ts';

/** §2 F16 / §6 Phase 3. The state carries no missed-day count (AC16.2). */
export const COMEBACK_AFTER_DAYS = 5;

export interface ComebackState {
  active: boolean;
}

function calendarDate(date: LocalDate): TZDate {
  localDateSchema.parse(date);
  return new TZDate(`${date}T00:00:00Z`, 'UTC');
}

/**
 * Comeback once `today` is at least 5 local days after the last credit.
 * The next credit passes that date as `today`'s last credit and clears it.
 * No prior credit is not a comeback.
 */
export function comebackState(lastCreditDate: LocalDate | null, today: LocalDate): ComebackState {
  if (lastCreditDate == null) return { active: false };
  const gap = differenceInCalendarDays(calendarDate(today), calendarDate(lastCreditDate));
  return { active: gap >= COMEBACK_AFTER_DAYS };
}
