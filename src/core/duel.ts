// §2.8 fair comparison and F18 rebasing. Raw kg never comes back out of here.
export const BASELINE_WEEKS = 4;
const MIN_BASELINE_SESSIONS = 2;
/** A gap within this many percentage points is a tie (§2.8). */
export const DUEL_TIE_PP = 0.5;

export interface BaselineWeek {
  /** Weekly best e1RM. Null when that week has no comparable lift. */
  bestE1rm: number | null;
  sessions: number;
}

export interface FairComparison {
  state: 'building' | 'ready';
  baseline: number | null;
  current: number | null;
  /** Percent gain vs the baseline. Null while building, or when this week has no e1RM. */
  percent: number | null;
}

function positive(value: number | null): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

/**
 * Mean of weekly best e1RM over the previous 4 complete weeks (not the current
 * one). Fewer than 2 sessions in that window → Baseline building.
 */
export function fairComparison(input: {
  previousWeeks: readonly BaselineWeek[];
  currentE1rm: number | null;
}): FairComparison {
  if (input.previousWeeks.length !== BASELINE_WEEKS) {
    throw new RangeError('Baseline window is the previous 4 complete weeks');
  }
  const sessions = input.previousWeeks.reduce((sum, week) => sum + week.sessions, 0);
  const bests = input.previousWeeks.flatMap((week) => (positive(week.bestE1rm) ? [week.bestE1rm] : []));
  if (sessions < MIN_BASELINE_SESSIONS || bests.length === 0) {
    return { state: 'building', baseline: null, current: null, percent: null };
  }
  const baseline = bests.reduce((sum, value) => sum + value, 0) / bests.length;
  const current = positive(input.currentE1rm) ? input.currentE1rm : null;
  if (current == null) return { state: 'ready', baseline, current: null, percent: null };
  return { state: 'ready', baseline, current, percent: ((current - baseline) / baseline) * 100 };
}

/**
 * Partner trend line: each series becomes a percent of its own first positive
 * value, so both lines start at 100. Nulls stay null. Raw kg is not returned.
 */
export function rebaseToFirst(values: readonly (number | null)[]): (number | null)[] {
  const first = values.find(positive);
  if (first == null) return values.map(() => null);
  return values.map((value) => (value == null || !Number.isFinite(value) ? null : (value / first) * 100));
}

export type DuelScoreKind = 'lift' | 'sessions' | 'km';

/**
 * Lift is percent e1RM gain vs a frozen baseline.
 * Sessions is credits ÷ target, in percentage points (100 = target met).
 * Km is percent of the trailing 4-week weekly mean (100 = matched the mean).
 */
export function duelScore(kind: DuelScoreKind, value: number, baseline: number): number | null {
  if (!Number.isFinite(value) || !positive(baseline)) return null;
  if (kind === 'lift') return ((value - baseline) / baseline) * 100;
  return (value / baseline) * 100;
}

export interface DuelCall {
  result: 'tie' | 'a' | 'b';
  /** A tie gives both a co-op half-segment. A win does not. */
  halfSegmentBoth: boolean;
}

export function compareDuelScores(scoreA: number, scoreB: number): DuelCall {
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) throw new RangeError('Duel scores must be finite');
  if (Math.abs(scoreA - scoreB) <= DUEL_TIE_PP) return { result: 'tie', halfSegmentBoth: true };
  return { result: scoreA > scoreB ? 'a' : 'b', halfSegmentBoth: false };
}
