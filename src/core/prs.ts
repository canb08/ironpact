import type { BodyweightEntry, CardioEntry, Exercise, LocalDate, Session, SetRow, Uuid } from './types.ts';
import { e1rm } from './e1rm.ts';
import { volume } from './volume.ts';

// §2 F7 / §10 E7.2. One tier per entry: e1RM > rep-max > volume > distance > pace.
// Volume is a rack badge, never a per-set takeover. The first session is a baseline.

export type PrType = 'e1rm' | 'rep_max' | 'volume' | 'distance' | 'pace';
export type PrDisplay = 'takeover' | 'toast' | 'badge';

/** Columns for a `pr_events` insert. `display` and `bucket_label` are not columns. */
export interface PrEventDraft {
  exercise_id: Uuid | null;
  source_id: Uuid;
  pr_type: PrType;
  reps: number | null;
  value: number;
  previous_value: number | null;
  pct_over_previous: number | null;
  display: PrDisplay;
  user_id: Uuid;
  local_date: LocalDate;
  bucket_label?: string;
}

export type DetectedPr =
  | { kind: 'baseline' }
  | { kind: 'none' }
  | { kind: 'pr'; event: PrEventDraft };

export interface PrHistory {
  sessions: readonly Session[];
  sets: readonly SetRow[];
  cardio: readonly CardioEntry[];
  bodyweights: readonly BodyweightEntry[];
  exercises: readonly Exercise[];
}

const MARKS: readonly { meters: number; label: string }[] = [
  { meters: 1000, label: '1K' },
  { meters: 5000, label: '5K' },
  { meters: 10000, label: '10K' },
  { meters: 15000, label: '15K' },
  { meters: 21097.5, label: 'HALF' },
  { meters: 42195, label: 'MARATHON' },
];

/** §3.9.4: ±5% of a round distance, e.g. 10K. Otherwise the rounded kilometre. */
export function paceBucketLabel(distanceM: number): string {
  for (const mark of MARKS) {
    if (mark.meters > 0 && Math.abs(distanceM - mark.meters) / mark.meters <= 0.05) return mark.label;
  }
  const km = Math.round((distanceM / 1000) * 10) / 10;
  return `${km}K`;
}

function percentOver(next: number, previous: number | null, lowerIsBetter: boolean): number | null {
  if (previous == null || !Number.isFinite(previous) || previous === 0) return null;
  const raw = lowerIsBetter ? ((previous - next) / previous) * 100 : ((next - previous) / previous) * 100;
  return Math.round(raw * 10000) / 10000;
}

function sessionsOf(history: PrHistory): Map<Uuid, Session> {
  return new Map(history.sessions.map((session) => [session.id, session]));
}

function openSession(sessions: Map<Uuid, Session>, sessionId: Uuid, userId: Uuid): Session | null {
  const session = sessions.get(sessionId);
  if (session == null || session.deleted_at !== null || session.user_id !== userId) return null;
  return session;
}

function bySessionThenLog(sessions: Map<Uuid, Session>): (a: { session_id: Uuid; logged_at: string; id: Uuid }, b: { session_id: Uuid; logged_at: string; id: Uuid }) => number {
  return (a, b) => {
    const left = sessions.get(a.session_id);
    const right = sessions.get(b.session_id);
    return (left?.started_at ?? '').localeCompare(right?.started_at ?? '')
      || (left?.id ?? '').localeCompare(right?.id ?? '')
      || a.logged_at.localeCompare(b.logged_at)
      || a.id.localeCompare(b.id);
  };
}

function bodyweightKg(history: PrHistory, userId: Uuid, localDate: LocalDate): number | null {
  const rows = history.bodyweights.filter((row) => row.user_id === userId && row.deleted_at === null
    && row.local_date <= localDate && row.weight_kg > 0);
  rows.sort((a, b) => b.local_date.localeCompare(a.local_date) || b.measured_at.localeCompare(a.measured_at) || b.id.localeCompare(a.id));
  return rows[0]?.weight_kg ?? null;
}

interface LiftContext {
  kind: 'lift' | 'bw_lift';
  bodyweightKg: number | null;
  comparable: number;
}

function liftContext(history: PrHistory, exercises: Map<Uuid, Exercise>, set: SetRow): LiftContext {
  const exercise = exercises.get(set.exercise_id);
  if (exercise?.kind === 'bw_lift') {
    const body = bodyweightKg(history, set.user_id, set.local_date);
    const known = body != null && body > 0 ? body : null;
    return { kind: 'bw_lift', bodyweightKg: known, comparable: set.weight_kg + (known ?? 0) };
  }
  return { kind: 'lift', bodyweightKg: null, comparable: set.weight_kg };
}

function draft(input: {
  exerciseId: Uuid | null;
  source: { id: Uuid; user_id: Uuid; local_date: LocalDate };
  prType: PrType;
  reps: number | null;
  value: number;
  previous: number | null;
  display: PrDisplay;
  lowerIsBetter?: boolean;
  bucket?: string;
}): PrEventDraft {
  return {
    exercise_id: input.exerciseId,
    source_id: input.source.id,
    pr_type: input.prType,
    reps: input.reps,
    value: input.value,
    previous_value: input.previous,
    pct_over_previous: percentOver(input.value, input.previous, input.lowerIsBetter ?? false),
    display: input.display,
    user_id: input.source.user_id,
    local_date: input.source.local_date,
    ...(input.bucket == null ? {} : { bucket_label: input.bucket }),
  };
}

interface Analysis {
  events: PrEventDraft[];
  /** First working set / run of the first session. Later sets in that session are not PRs. */
  baselineIds: Set<Uuid>;
}

function analyzeLifts(history: PrHistory): Analysis {
  const sessions = sessionsOf(history);
  const exercises = new Map(history.exercises.map((exercise) => [exercise.id, exercise]));
  const groups = new Map<string, SetRow[]>();
  for (const set of history.sets) {
    if (set.deleted_at !== null || set.is_warmup) continue;
    if (openSession(sessions, set.session_id, set.user_id) == null) continue;
    const key = `${set.user_id}:${set.exercise_id}`;
    const list = groups.get(key);
    if (list == null) groups.set(key, [set]);
    else list.push(set);
  }
  const events: PrEventDraft[] = [];
  const baselineIds = new Set<Uuid>();
  for (const sets of groups.values()) {
    sets.sort(bySessionThenLog(sessions));
    const first = sets[0];
    if (first == null) continue;
    const firstSession = first.session_id;
    let bestE1: number | null = null;
    const bestRep = new Map<number, number>();
    let bestVolume: number | null = null;
    const bySession: SetRow[][] = [];
    for (const set of sets) {
      const bucket = bySession[bySession.length - 1];
      if (bucket == null || bucket[0]?.session_id !== set.session_id) bySession.push([set]);
      else bucket.push(set);
    }
    for (const sessionSets of bySession) {
      const sessionId = sessionSets[0]?.session_id;
      if (sessionId == null) continue;
      const establishing = sessionId === firstSession;
      let takeover = false;
      if (establishing) {
        const marker = sessionSets[0];
        if (marker != null) baselineIds.add(marker.id);
      }
      for (const set of sessionSets) {
        const ctx = liftContext(history, exercises, set);
        const estimated = e1rm(set, ctx.kind, ctx.bodyweightKg);
        const repMax = Number.isInteger(set.reps) && set.reps >= 1 && set.reps <= 12;
        if (!establishing) {
          let chosen: { type: 'e1rm' | 'rep_max'; value: number; previous: number } | null = null;
          if (estimated != null && bestE1 != null && estimated > bestE1) {
            chosen = { type: 'e1rm', value: estimated, previous: bestE1 };
          } else if (repMax) {
            const prior = bestRep.get(set.reps);
            if (prior != null && ctx.comparable > prior) {
              chosen = { type: 'rep_max', value: ctx.comparable, previous: prior };
            }
          }
          if (chosen != null) {
            events.push(draft({
              exerciseId: set.exercise_id,
              source: set,
              prType: chosen.type,
              reps: set.reps,
              value: chosen.value,
              previous: chosen.previous,
              display: takeover ? 'toast' : 'takeover',
            }));
            takeover = true;
          }
        }
        if (estimated != null && (bestE1 == null || estimated > bestE1)) bestE1 = estimated;
        if (repMax) {
          const prior = bestRep.get(set.reps);
          if (prior == null || ctx.comparable > prior) bestRep.set(set.reps, ctx.comparable);
        }
      }
      const sample = sessionSets[0];
      if (sample == null) continue;
      const ctx = liftContext(history, exercises, sample);
      const sessionVolume = volume(sessionSets, ctx.kind, ctx.bodyweightKg);
      const last = sessionSets[sessionSets.length - 1];
      if (!establishing && bestVolume != null && sessionVolume > bestVolume && last != null) {
        events.push(draft({
          exerciseId: sample.exercise_id,
          source: last,
          prType: 'volume',
          reps: null,
          value: sessionVolume,
          previous: bestVolume,
          display: 'badge',
        }));
      }
      if (bestVolume == null || sessionVolume > bestVolume) bestVolume = sessionVolume;
    }
  }
  return { events, baselineIds };
}

function samePaceBucket(candidateM: number, otherM: number): boolean {
  return candidateM > 0 && otherM > 0 && Math.abs(candidateM - otherM) / candidateM <= 0.05;
}

function paceOf(entry: CardioEntry): number | null {
  if (entry.distance_m <= 0 || entry.duration_s <= 0) return null;
  return entry.duration_s / (entry.distance_m / 1000);
}

function analyzeRuns(history: PrHistory): Analysis {
  const sessions = sessionsOf(history);
  const groups = new Map<Uuid, CardioEntry[]>();
  for (const entry of history.cardio) {
    if (entry.deleted_at !== null) continue;
    if (openSession(sessions, entry.session_id, entry.user_id) == null) continue;
    const list = groups.get(entry.user_id);
    if (list == null) groups.set(entry.user_id, [entry]);
    else list.push(entry);
  }
  const events: PrEventDraft[] = [];
  const baselineIds = new Set<Uuid>();
  for (const entries of groups.values()) {
    entries.sort(bySessionThenLog(sessions));
    const first = entries[0];
    if (first == null) continue;
    const firstSession = first.session_id;
    let bestDistance: number | null = null;
    const prior: CardioEntry[] = [];
    let sessionId: Uuid | null = null;
    let takeover = false;
    let marked = false;
    for (const entry of entries) {
      if (entry.session_id !== sessionId) {
        sessionId = entry.session_id;
        takeover = false;
      }
      const establishing = entry.session_id === firstSession;
      if (establishing && !marked) {
        baselineIds.add(entry.id);
        marked = true;
      }
      const pace = paceOf(entry);
      if (!establishing) {
        const distance = bestDistance != null && entry.distance_m > bestDistance;
        const bucket = prior.filter((row) => samePaceBucket(entry.distance_m, row.distance_m));
        const bestPace = bucket.reduce<number | null>((best, row) => {
          const value = paceOf(row);
          if (value == null) return best;
          return best == null || value < best ? value : best;
        }, null);
        const faster = pace != null && bestPace != null && pace < bestPace;
        if (distance) {
          events.push(draft({
            exerciseId: null,
            source: entry,
            prType: 'distance',
            reps: null,
            value: entry.distance_m,
            previous: bestDistance,
            display: takeover ? 'toast' : 'takeover',
          }));
          takeover = true;
        } else if (faster && pace != null) {
          events.push(draft({
            exerciseId: null,
            source: entry,
            prType: 'pace',
            reps: null,
            value: pace,
            previous: bestPace,
            display: takeover ? 'toast' : 'takeover',
            lowerIsBetter: true,
            bucket: paceBucketLabel(entry.distance_m),
          }));
          takeover = true;
        }
      }
      if (bestDistance == null || entry.distance_m > bestDistance) bestDistance = entry.distance_m;
      prior.push(entry);
    }
  }
  return { events, baselineIds };
}

function analyze(history: PrHistory): Analysis {
  const lifts = analyzeLifts(history);
  const runs = analyzeRuns(history);
  return {
    events: [...lifts.events, ...runs.events],
    baselineIds: new Set([...lifts.baselineIds, ...runs.baselineIds]),
  };
}

/** Standing PR rows, including volume badges. Deleted sources are already absent. */
export function recomputePrs(history: PrHistory): PrEventDraft[] {
  return analyze(history).events;
}

/** Live set check. Volume does not fire here (E7.2); call the rack helper at RACK IT. */
export function detectSetPr(history: PrHistory, setId: Uuid): DetectedPr {
  const set = history.sets.find((row) => row.id === setId);
  if (set == null || set.deleted_at !== null || set.is_warmup) return { kind: 'none' };
  const { events, baselineIds } = analyze(history);
  if (baselineIds.has(setId)) return { kind: 'baseline' };
  const event = events.find((row) => row.source_id === setId && row.pr_type !== 'volume');
  return event == null ? { kind: 'none' } : { kind: 'pr', event };
}

export function detectRunPr(history: PrHistory, entryId: Uuid): DetectedPr {
  const entry = history.cardio.find((row) => row.id === entryId);
  if (entry == null || entry.deleted_at !== null) return { kind: 'none' };
  const { events, baselineIds } = analyze(history);
  if (baselineIds.has(entryId)) return { kind: 'baseline' };
  const event = events.find((row) => row.source_id === entryId && (row.pr_type === 'distance' || row.pr_type === 'pace'));
  return event == null ? { kind: 'none' } : { kind: 'pr', event };
}

/** E7.2: volume PRs for one session, evaluated when it is racked. */
export function detectSessionVolumePrs(history: PrHistory, sessionId: Uuid): PrEventDraft[] {
  const ids = new Set(history.sets.filter((set) => set.session_id === sessionId).map((set) => set.id));
  return analyze(history).events.filter((event) => event.pr_type === 'volume' && ids.has(event.source_id));
}
