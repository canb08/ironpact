import type { CardioEntry, LocalDate, MartialEntry, MinEntry, Session, SetRow } from './types.ts';
import { weekDates, weekStartOf } from './weeks.ts';

/** A single user's local mirror rows; SQL week_credits uses the same user scope (E5.7). */
export interface CreditEntries {
  sessions: readonly Session[];
  sets: readonly SetRow[];
  cardio: readonly CardioEntry[];
  martial: readonly MartialEntry[];
  min: readonly MinEntry[];
}
export interface WeekCredits {
  credits: number;
  /** Active MIN rows, including those beyond the cap; Do MIN gym sessions are session credits. */
  minCount: number;
  status: 'FULL' | 'HELD' | 'REST';
}
export function weekCredits(entries: CreditEntries, weekStart: LocalDate, target = 3): WeekCredits {
  if (weekStartOf(weekStart) !== weekStart) throw new RangeError('Week start must be a Monday');
  if (!Number.isInteger(target) || target < 1 || target > 7) throw new RangeError('Weekly target must be 1–7');
  const dates = new Set(weekDates(weekStart));
  const daily = new Map<LocalDate, number>();
  let minCount = 0;
  const add = (date: LocalDate, credit: number) => daily.set(date, Math.min(2, (daily.get(date) ?? 0) + credit));
  const sessions = new Map(entries.sessions.map((row) => [row.id, row]));
  // E5.5: session local_date wins (D9 inheritance), never started_at or ended_at.
  for (const session of sessions.values()) {
    if (session.deleted_at !== null || !dates.has(session.local_date)) continue;
    const active = (row: SetRow | CardioEntry | MartialEntry | MinEntry) =>
      row.deleted_at === null && row.session_id === session.id && row.user_id === session.user_id;
    if (session.kind === 'min') {
      // E5.6: Floor MIN never gets the 1-credit session award; each active row earns 0.5.
      const rows = new Map(entries.min.filter(active).map((row) => [row.id, row]));
      minCount += rows.size;
      add(session.local_date, rows.size * 0.5);
    } else {
      // E5.6: gym/run/martial with a working entry earns 1 even while open.
      // mode='min' is a gym session tag, not a separate half-credit entry.
      const hasEntry = session.kind === 'gym'
        ? entries.sets.some((row) => active(row) && !row.is_warmup)
        : session.kind === 'run' ? entries.cardio.some(active) : entries.martial.some(active);
      if (hasEntry) add(session.local_date, 1);
    }
  }
  const credits = Array.from(daily.values()).reduce((sum, value) => sum + value, 0);
  // §2.2 / D5 (retained by E5.6): FULL ≥ own target; HELD ≥0.5; REST = 0.
  return { credits, minCount, status: credits >= target ? 'FULL' : credits >= 0.5 ? 'HELD' : 'REST' };
}
