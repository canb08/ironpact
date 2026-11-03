import { weekCredits, type CreditEntries } from '../../core/credits.ts';
import type { LocalDate, SetRow } from '../../core/types.ts';
import { weekStartOf } from '../../core/weeks.ts';
import type { PrEventDraft } from '../../core/prs.ts';

export type PlateState = 'full' | 'min' | 'empty';

/** Same plate mix as the shared bar, for one person. */
export function plateStates(credits: number, target: number, minCount = 0): PlateState[] {
  const safeCredits = Math.max(0, Number.isFinite(credits) ? credits : 0);
  const safeTarget = Math.max(1, Math.min(7, Math.floor(target) || 1));
  const mins = Math.min(
    Math.floor(safeCredits * 2),
    Math.max(0, Math.floor(minCount || (safeCredits % 1 >= 0.5 ? 1 : 0))),
  );
  const full = Math.max(0, Math.floor(safeCredits - mins * 0.5));
  const states: PlateState[] = [];
  for (let index = 0; index < Math.min(full, safeTarget); index += 1) states.push('full');
  const visibleMins = Math.min(mins, (safeTarget - full) * 2);
  for (let index = 0; index < visibleMins; index += 1) states.push('min');
  const loaded = states.reduce((sum, state) => sum + (state === 'min' ? 0.5 : 1), 0);
  for (let index = 0; index < Math.ceil(safeTarget - loaded); index += 1) states.push('empty');
  return states;
}

export function monthBounds(today: string): { from: string; to: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!match) return { from: today, to: today };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${match[1]}-${match[2]}-01`,
    to: `${match[1]}-${match[2]}-${String(last).padStart(2, '0')}`,
  };
}

export function addCalendarDays(iso: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Sessions logged on days every member trained, inside the month. */
export function sessionsTogether(people: readonly (readonly string[])[], from: string, to: string): number {
  const inMonth = people.map((dates) => dates.filter((date) => date >= from && date <= to));
  const first = inMonth[0];
  if (!first || inMonth.length < 2) return 0;
  const shared = new Set(first);
  for (const dates of inMonth.slice(1)) {
    const theirs = new Set(dates);
    for (const date of shared) if (!theirs.has(date)) shared.delete(date);
  }
  return inMonth.reduce((sum, dates) => sum + dates.filter((date) => shared.has(date)).length, 0);
}

export function volumeKg(
  sets: readonly Pick<SetRow, 'reps' | 'weight_kg' | 'is_warmup' | 'local_date' | 'deleted_at'>[],
  from: string,
  to: string,
): number {
  return sets.reduce((sum, set) => {
    if (set.deleted_at || set.is_warmup || set.local_date < from || set.local_date > to) return sum;
    return sum + set.reps * set.weight_kg;
  }, 0);
}

function clampTarget(target: number): number {
  if (!Number.isInteger(target) || target < 1) return 1;
  return Math.min(7, target);
}

/** Consecutive weeks everyone trained at least a half session. Current week counts once it has started. */
export function longestSharedStreak(
  members: readonly { entries: CreditEntries; target: number }[],
  today: LocalDate,
): number {
  if (members.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return 0;
  const dates = members.flatMap((member) => member.entries.sessions.map((row) => row.local_date))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  dates.push(today);
  dates.sort();
  const first = dates[0];
  if (!first) return 0;
  let week = weekStartOf(first);
  const end = weekStartOf(today);
  let best = 0;
  let run = 0;
  for (let guard = 0; week <= end && guard < 600; guard += 1) {
    const trained = members.every((member) => weekCredits(member.entries, week, clampTarget(member.target)).status !== 'REST');
    if (trained) {
      run += 1;
      if (run > best) best = run;
    } else run = 0;
    const next = addCalendarDays(week, 7);
    if (next <= week) break;
    week = next;
  }
  return best;
}

export interface TopSet {
  exerciseId: string;
  reps: number;
  kg: number;
}

/** Heaviest working set of each exercise, heaviest exercise first. */
export function topSets(sets: readonly SetRow[]): TopSet[] {
  const best = new Map<string, TopSet>();
  for (const set of sets) {
    if (set.deleted_at || set.is_warmup) continue;
    const current = best.get(set.exercise_id);
    if (!current || set.weight_kg > current.kg || (set.weight_kg === current.kg && set.reps > current.reps)) {
      best.set(set.exercise_id, { exerciseId: set.exercise_id, reps: set.reps, kg: set.weight_kg });
    }
  }
  return [...best.values()].sort((a, b) => b.kg - a.kg || b.reps - a.reps).slice(0, 3);
}

export function prsThisWeek(events: readonly PrEventDraft[], from: string, to: string): PrEventDraft[] {
  return events
    .filter((event) => event.local_date >= from && event.local_date <= to)
    .sort((a, b) => b.local_date.localeCompare(a.local_date) || a.pr_type.localeCompare(b.pr_type) || a.source_id.localeCompare(b.source_id));
}
