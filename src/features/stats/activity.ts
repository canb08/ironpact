import type { PrEvent } from '../../data/adapter.ts';
import type { CardioEntry, Instant, LocalDate, MartialEntry, Session, Uuid } from '../../core/types.ts';
import { addLocalDays, weeksInWindow } from './calendar.ts';
import type { TrendWindow } from './trend.ts';

export interface RunPoint {
  id: Uuid;
  localDate: LocalDate;
  loggedAt: Instant;
  distanceM: number;
  secondsPerKm: number;
}

export interface WeekDistance {
  weekStart: LocalDate;
  distanceM: number;
}

export interface MartialPoint {
  id: Uuid;
  discipline: string;
  localDate: LocalDate;
  minutes: number;
}

export interface WeekMinutes {
  weekStart: LocalDate;
  minutes: number;
}

function liveSession(sessions: readonly Session[], sessionId: Uuid, userId: Uuid): Session | null {
  const session = sessions.find((row) => row.id === sessionId);
  if (session == null || session.deleted_at !== null || session.user_id !== userId) return null;
  return session;
}

function inWindow(date: LocalDate, window: TrendWindow): boolean {
  return date >= window.from && date <= window.to;
}

function weekOf(date: LocalDate, weeks: readonly LocalDate[]): LocalDate | null {
  return weeks.find((start) => date >= start && date < addLocalDays(start, 7)) ?? null;
}

/** Live runs in the window, oldest first. A deleted session drops its run. */
export function runsInWindow(
  cardio: readonly CardioEntry[],
  sessions: readonly Session[],
  userId: Uuid,
  window: TrendWindow,
): RunPoint[] {
  const points: RunPoint[] = [];
  for (const row of cardio) {
    if (row.deleted_at !== null || row.user_id !== userId || row.activity !== 'Run') continue;
    if (!Number.isFinite(row.distance_m) || row.distance_m <= 0) continue;
    if (!Number.isFinite(row.duration_s) || row.duration_s <= 0) continue;
    const session = liveSession(sessions, row.session_id, userId);
    if (session == null || !inWindow(session.local_date, window)) continue;
    points.push({
      id: row.id,
      localDate: session.local_date,
      loggedAt: row.logged_at,
      distanceM: row.distance_m,
      secondsPerKm: row.duration_s / (row.distance_m / 1000),
    });
  }
  points.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt) || a.id.localeCompare(b.id));
  return points;
}

/** Every week in the window. Weeks with no run are 0, which is the real sum, not a sample. */
export function weeklyDistance(runs: readonly RunPoint[], window: TrendWindow): WeekDistance[] {
  const weeks = weeksInWindow(window);
  const totals = new Map<LocalDate, number>(weeks.map((week) => [week, 0]));
  for (const run of runs) {
    const week = weekOf(run.localDate, weeks);
    if (week == null) continue;
    totals.set(week, (totals.get(week) ?? 0) + run.distanceM);
  }
  return weeks.map((weekStart) => ({ weekStart, distanceM: totals.get(weekStart) ?? 0 }));
}

export function martialInWindow(
  rows: readonly MartialEntry[],
  sessions: readonly Session[],
  userId: Uuid,
  window: TrendWindow,
): MartialPoint[] {
  const points: MartialPoint[] = [];
  for (const row of rows) {
    if (row.deleted_at !== null || row.user_id !== userId) continue;
    const discipline = row.discipline.trim();
    if (discipline.length === 0) continue;
    if (!Number.isFinite(row.duration_min) || row.duration_min <= 0) continue;
    const session = liveSession(sessions, row.session_id, userId);
    if (session == null || !inWindow(session.local_date, window)) continue;
    points.push({ id: row.id, discipline, localDate: session.local_date, minutes: row.duration_min });
  }
  points.sort((a, b) => a.localDate.localeCompare(b.localDate) || a.id.localeCompare(b.id));
  return points;
}

export function disciplinesOf(points: readonly MartialPoint[]): string[] {
  return [...new Set(points.map((point) => point.discipline))].sort((a, b) => a.localeCompare(b));
}

export function weeklyMinutes(points: readonly MartialPoint[], discipline: string, window: TrendWindow): WeekMinutes[] {
  const weeks = weeksInWindow(window);
  const totals = new Map<LocalDate, number>(weeks.map((week) => [week, 0]));
  for (const point of points) {
    if (point.discipline !== discipline) continue;
    const week = weekOf(point.localDate, weeks);
    if (week == null) continue;
    totals.set(week, (totals.get(week) ?? 0) + point.minutes);
  }
  return weeks.map((weekStart) => ({ weekStart, minutes: totals.get(weekStart) ?? 0 }));
}

/** Distance and pace marks only. Other PR types stay off the run tab. */
export function runPrs(rows: readonly PrEvent[], window: TrendWindow): PrEvent[] {
  return rows.filter((row) => row.deleted_at === null
    && (row.pr_type === 'distance' || row.pr_type === 'pace')
    && inWindow(row.local_date, window)
    && Number.isFinite(row.value)
    && row.value > 0);
}

/** `secondsPerKm` → `m:ss`. */
export function formatPaceLabel(secondsPerKm: number): string {
  const total = Math.max(0, Math.round(secondsPerKm));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
