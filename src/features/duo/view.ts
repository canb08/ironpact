import { TZDate } from '@date-fns/tz';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { fairComparison, type FairComparison } from '../../core/duel.ts';
import { e1rm } from '../../core/e1rm.ts';
import { tierName, type TierName } from '../../core/streak.ts';
import type { CrewPresence } from '../../data/duo.contract.ts';
import type { CreditEntries } from '../../core/credits.ts';
import type { LocalDate, SetRow } from '../../core/types.ts';
import { weekDates, weekStartOf } from '../../core/weeks.ts';

/** Hidden 2 minutes after the last activity (F15). The data layer uses the same window. */
export const PRESENCE_HIDE_MS = 120_000;

export function visiblePresence(rows: readonly CrewPresence[], nowMs: number): CrewPresence[] {
  return rows.filter((row) => {
    const at = Date.parse(row.last_active_at);
    return Number.isFinite(at) && nowMs - at < PRESENCE_HIDE_MS;
  });
}

export function presenceMinutes(row: CrewPresence, nowMs: number): number {
  const started = Date.parse(row.started_at);
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.floor((nowMs - started) / 60_000));
}

/** Exercise and set/planned, or null when the session has no exercise yet. */
export function presenceWork(row: CrewPresence): string | null {
  if (!row.exercise_label) return null;
  return `${row.exercise_label} ${row.set_no}/${row.planned_sets}`;
}

export function memberColor(hue: number): string {
  const safe = ((Math.round(hue) % 360) + 360) % 360;
  return `hsl(${safe} 62% 58%)`;
}

function calendarDate(date: LocalDate): TZDate {
  return new TZDate(`${date}T00:00:00Z`, 'UTC');
}

export function shiftDays(date: LocalDate, days: number): LocalDate {
  return format(addDays(calendarDate(date), days), 'yyyy-MM-dd');
}

/** The four complete weeks before the week that contains `today`. Oldest first. */
export function baselineWeekStarts(today: LocalDate): LocalDate[] {
  const current = weekStartOf(today);
  return [4, 3, 2, 1].map((weeks) => shiftDays(current, -7 * weeks));
}

export function daysSince(then: LocalDate, today: LocalDate): number {
  return differenceInCalendarDays(calendarDate(today), calendarDate(then));
}

/** Latest local date that earned a credit. No missed-day count is returned. */
export function lastCreditDate(entries: CreditEntries): LocalDate | null {
  const sessions = new Map(entries.sessions.map((session) => [session.id, session]));
  const dates: LocalDate[] = [];
  for (const session of sessions.values()) {
    if (session.deleted_at !== null) continue;
    const active = (row: { deleted_at: string | null; session_id: string }) =>
      row.deleted_at === null && row.session_id === session.id;
    const earned = session.kind === 'min'
      ? entries.min.some(active)
      : session.kind === 'gym'
        ? entries.sets.some((row) => active(row) && !row.is_warmup)
        : session.kind === 'run'
          ? entries.cardio.some(active)
          : entries.martial.some(active);
    if (earned) dates.push(session.local_date);
  }
  dates.sort();
  return dates.at(-1) ?? null;
}

export type PartnerStatus =
  | { kind: 'live' }
  | { kind: 'today' }
  | { kind: 'days'; days: number }
  | { kind: 'none' };

export function partnerStatus(input: { live: boolean; lastCredit: LocalDate | null; today: LocalDate }): PartnerStatus {
  if (input.live) return { kind: 'live' };
  if (!input.lastCredit) return { kind: 'none' };
  const days = daysSince(input.lastCredit, input.today);
  if (days <= 0) return { kind: 'today' };
  return { kind: 'days', days };
}

/**
 * Best working-set e1RM per week against the trailing 4-week baseline.
 * Raw kg stays on `current` for a one-tap reveal; the headline is `percent`.
 */
export function fairFromSets(sets: readonly SetRow[], today: LocalDate): FairComparison {
  const previousWeeks = baselineWeekStarts(today).map((start) => weekBest(sets, start));
  const current = weekBest(sets, weekStartOf(today));
  return fairComparison({ previousWeeks, currentE1rm: current.bestE1rm });
}

function weekBest(sets: readonly SetRow[], start: LocalDate): { bestE1rm: number | null; sessions: number } {
  const dates = new Set(weekDates(start));
  const values: number[] = [];
  const sessions = new Set<string>();
  for (const set of sets) {
    if (!dates.has(set.local_date)) continue;
    const value = e1rm(set, 'lift');
    if (value == null) continue;
    values.push(value);
    sessions.add(set.session_id);
  }
  return { bestE1rm: values.length ? Math.max(...values) : null, sessions: sessions.size };
}

export function formatFairPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return rounded > 0 ? `+${body}%` : `${body}%`;
}

export function formatRawKg(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Opening one partner closes any other raw-kg reveal. */
export function toggleRawKg(openId: string | null, id: string): string | null {
  return openId === id ? null : id;
}

export function combinedSessions(dates: readonly LocalDate[], weekStart: LocalDate): number {
  const inWeek = new Set(weekDates(weekStart));
  return dates.filter((date) => inWeek.has(date)).length;
}

/** Working-set kilogram sum, displayed later as tonnes to 0.1 t. */
export function combinedKg(sets: readonly Pick<SetRow, 'reps' | 'weight_kg' | 'is_warmup' | 'local_date'>[], weekStart: LocalDate): number {
  const inWeek = new Set(weekDates(weekStart));
  return sets.reduce((sum, set) => {
    if (set.is_warmup || !inWeek.has(set.local_date)) return sum;
    return sum + set.reps * set.weight_kg;
  }, 0);
}

export function formatTonnes(kg: number): string {
  return (Math.round((kg / 1000) * 10) / 10).toFixed(1);
}

/**
 * `?debug=week` exists only for dev and the mock backend (E5.11).
 * `allowed` is false in a production Supabase build, and that branch is stripped.
 */
export function debugWeekRequested(search: string, allowed: boolean): boolean {
  if (!allowed) return false;
  const query = search.startsWith('?') ? search.slice(1) : search;
  return new URLSearchParams(query).get('debug') === 'week';
}

export function debugWeekAllowed(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_BACKEND === 'mock';
}

export function debugWeekActive(search: string): boolean {
  return debugWeekRequested(search, debugWeekAllowed());
}

/** A simulated Monday close: one plate on the stored bar. */
export function platesAfterDebugClose(current: number): number {
  if (!Number.isInteger(current) || current < 0) throw new RangeError('Plate count must be a non-negative integer');
  return current + 1;
}

export function barTier(plates: number): TierName {
  return tierName(plates);
}
