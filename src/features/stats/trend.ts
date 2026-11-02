// F18 / S13 minimal. Best e1RM per session, then % of each person's own first value.
import { rebaseToFirst } from '../../core/duel.ts';
import { e1rm } from '../../core/e1rm.ts';
import type { BodyweightEntry, Exercise, LocalDate, Session, SetRow, Uuid } from '../../core/types.ts';
import { weekStartOf } from '../../core/weeks.ts';

export const TREND_WEEK_COUNT = 12;
export const CHART_WIDTH = 320;
export const CHART_HEIGHT = 168;
const PAD_X = 28;
const PAD_Y = 20;

export interface TrendWindow {
  from: LocalDate;
  to: LocalDate;
}

export interface SessionBest {
  sessionId: Uuid;
  localDate: LocalDate;
  startedAt: string;
  e1rm: number;
}

export interface ChartPoint {
  sessionId: Uuid;
  localDate: LocalDate;
  startedAt: string;
  /** Plotted y: raw kg, or % of this line's own first value when the partner is on. */
  value: number;
  /** Always the raw e1RM. Shown for the owner only. */
  raw: number;
}

export interface ChartModel {
  mode: 'kg' | 'percent';
  mine: ChartPoint[];
  partner: ChartPoint[];
}

export interface PlottedPoint extends ChartPoint {
  x: number;
  y: number;
}

export interface ChartGeometry {
  width: number;
  height: number;
  yMin: number;
  yMax: number;
  mine: PlottedPoint[];
  partner: PlottedPoint[];
}

function ordinal(date: LocalDate): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function fromOrdinal(day: number): LocalDate {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/** Current ISO week plus the 11 before it. `to` is the viewer's local today. */
export function trendWindow(today: LocalDate): TrendWindow {
  const monday = weekStartOf(today);
  return { from: fromOrdinal(ordinal(monday) - 7 * (TREND_WEEK_COUNT - 1)), to: today };
}

export function formatTrendNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function laterBodyweight(candidate: BodyweightEntry, current: BodyweightEntry): boolean {
  if (candidate.local_date !== current.local_date) return candidate.local_date > current.local_date;
  if (candidate.measured_at !== current.measured_at) return candidate.measured_at > current.measured_at;
  return candidate.id > current.id;
}

/** Latest positive bodyweight on or before the session date. Same rule as PR e1RM. */
function bodyweightOn(rows: readonly BodyweightEntry[], userId: Uuid, localDate: LocalDate): number | null {
  let best: BodyweightEntry | undefined;
  for (const row of rows) {
    if (row.user_id !== userId || row.deleted_at !== null || row.local_date > localDate || !(row.weight_kg > 0)) continue;
    if (best == null || laterBodyweight(row, best)) best = row;
  }
  return best?.weight_kg ?? null;
}

export function bestE1rmPerSession(input: {
  userId: Uuid;
  exerciseId: Uuid;
  from: LocalDate;
  to: LocalDate;
  exercise: Exercise | undefined;
  sessions: readonly Session[];
  sets: readonly SetRow[];
  bodyweights: readonly BodyweightEntry[];
}): SessionBest[] {
  const exercise = input.exercise;
  if (exercise == null || exercise.deleted_at !== null) return [];
  if (exercise.kind !== 'lift' && exercise.kind !== 'bw_lift') return [];
  const sessions = new Map<Uuid, Session>();
  for (const session of input.sessions) {
    if (session.user_id !== input.userId || session.deleted_at !== null) continue;
    sessions.set(session.id, session);
  }
  const bySession = new Map<Uuid, number>();
  for (const set of input.sets) {
    if (set.deleted_at !== null || set.user_id !== input.userId || set.exercise_id !== input.exerciseId) continue;
    const session = sessions.get(set.session_id);
    if (session == null || session.local_date < input.from || session.local_date > input.to) continue;
    const body = exercise.kind === 'bw_lift' ? bodyweightOn(input.bodyweights, input.userId, session.local_date) : null;
    const estimated = e1rm(set, exercise.kind, body);
    if (estimated == null || !(estimated > 0)) continue;
    const prior = bySession.get(session.id);
    if (prior == null || estimated > prior) bySession.set(session.id, estimated);
  }
  const points: SessionBest[] = [];
  for (const [sessionId, value] of bySession) {
    const session = sessions.get(sessionId);
    if (session == null) continue;
    points.push({ sessionId, localDate: session.local_date, startedAt: session.started_at, e1rm: value });
  }
  points.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.sessionId.localeCompare(b.sessionId));
  return points;
}

function asPoints(series: readonly SessionBest[], scaled: readonly (number | null)[]): ChartPoint[] {
  const points: ChartPoint[] = [];
  series.forEach((point, index) => {
    const value = scaled[index];
    if (value == null) return;
    points.push({
      sessionId: point.sessionId,
      localDate: point.localDate,
      startedAt: point.startedAt,
      value,
      raw: point.e1rm,
    });
  });
  return points;
}

/**
 * Partner toggle on: both lines are % of their own first positive value, so each
 * starts at 100. Raw kg stays on `raw` and is not the partner's plotted value.
 */
export function chartModel(
  mine: readonly SessionBest[],
  partner: readonly SessionBest[],
  showPartner: boolean,
): ChartModel {
  if (!showPartner) {
    return {
      mode: 'kg',
      mine: mine.map((point) => ({
        sessionId: point.sessionId,
        localDate: point.localDate,
        startedAt: point.startedAt,
        value: point.e1rm,
        raw: point.e1rm,
      })),
      partner: [],
    };
  }
  const lines = {
    mine: rebaseToFirst(mine.map((point) => point.e1rm)),
    partner: rebaseToFirst(partner.map((point) => point.e1rm)),
  };
  return { mode: 'percent', mine: asPoints(mine, lines.mine), partner: asPoints(partner, lines.partner) };
}

function yDomain(values: readonly number[]): { min: number; max: number } {
  const first = values[0];
  if (first == null) return { min: 0, max: 1 };
  let min = first;
  let max = first;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    return { min: min - pad, max: max + pad };
  }
  const pad = (max - min) * 0.08;
  return { min: min - pad, max: max + pad };
}

function plotPoints(
  points: readonly ChartPoint[],
  window: TrendWindow,
  yMin: number,
  yMax: number,
): PlottedPoint[] {
  const counts = new Map<string, number>();
  for (const point of points) counts.set(point.localDate, (counts.get(point.localDate) ?? 0) + 1);
  const seen = new Map<string, number>();
  const spanDays = Math.max(1, ordinal(window.to) - ordinal(window.from));
  const ySpan = yMax - yMin;
  return points.map((point) => {
    const order = seen.get(point.localDate) ?? 0;
    seen.set(point.localDate, order + 1);
    const count = counts.get(point.localDate) ?? 1;
    const bump = count <= 1 ? 0 : (order / count) * 0.8;
    const t = Math.min(1, Math.max(0, (ordinal(point.localDate) - ordinal(window.from) + bump) / spanDays));
    const yFrac = ySpan > 0 ? (point.value - yMin) / ySpan : 0.5;
    return {
      ...point,
      x: Math.round((PAD_X + t * (CHART_WIDTH - PAD_X * 2)) * 100) / 100,
      y: Math.round((PAD_Y + (1 - yFrac) * (CHART_HEIGHT - PAD_Y * 2)) * 100) / 100,
    };
  });
}

export function chartGeometry(model: ChartModel, window: TrendWindow): ChartGeometry {
  const values = [...model.mine, ...model.partner].map((point) => point.value);
  const domain = yDomain(values);
  return {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    yMin: domain.min,
    yMax: domain.max,
    mine: plotPoints(model.mine, window, domain.min, domain.max),
    partner: plotPoints(model.partner, window, domain.min, domain.max),
  };
}

export function polylinePoints(points: readonly { x: number; y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}
