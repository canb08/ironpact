import type { PrEventDraft } from '../../core/prs.ts';
import type { Exercise, SetRow } from '../../core/types.ts';
import { volume } from '../../core/volume.ts';
import type { PrEventDraftRow } from '../../data/adapter.ts';

const IDLE_MS = 3 * 60 * 60 * 1000;
const CLOSE_AFTER_MS = 5 * 60 * 1000;

export const FRESH_UNDO_MS = 8000;

/** `mm:ss`, or `h:mm:ss` once the session passes an hour. */
export function formatSessionClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const clock = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}

export function sessionSeconds(startedAt: string, endedAt: string | null, now = Date.now()): number {
  const end = endedAt == null ? now : Date.parse(endedAt);
  const start = Date.parse(startedAt);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((end - start) / 1000));
}

/** F11: no set for 3 hours closes at last set + 5 min. Null while the session is still live. */
export function idleEndedAt(startedAt: string, loggedAt: readonly string[], nowMs: number): string | null {
  let last = startedAt;
  for (const stamp of loggedAt) if (stamp > last) last = stamp;
  const lastMs = Date.parse(last);
  if (!Number.isFinite(lastMs) || !Number.isFinite(nowMs) || nowMs - lastMs < IDLE_MS) return null;
  return new Date(lastMs + CLOSE_AFTER_MS).toISOString();
}

export function prefillAt<T>(rows: readonly T[], index: number): T | undefined {
  if (rows.length === 0 || index < 0) return undefined;
  return rows[index] ?? rows[rows.length - 1];
}

export function roundKg(kg: number): number {
  return Math.round(kg * 1000) / 1000;
}

export function toPrRow(event: PrEventDraft): PrEventDraftRow {
  return {
    exercise_id: event.exercise_id,
    source_id: event.source_id,
    pr_type: event.pr_type,
    reps: event.reps,
    value: event.value,
    previous_value: event.previous_value,
    pct_over_previous: event.pct_over_previous,
    user_id: event.user_id,
    local_date: event.local_date,
  };
}

/** Working-set tonnes to 0.1 t. Bodyweight lifts use added load unless a weigh-in is known. */
export function workingKg(sets: readonly SetRow[], exercises: readonly Exercise[], bodyweightKg: number | null): number {
  const groups = new Map<string, SetRow[]>();
  for (const set of sets) {
    if (set.is_warmup || set.deleted_at !== null) continue;
    const list = groups.get(set.exercise_id);
    if (list) list.push(set);
    else groups.set(set.exercise_id, [set]);
  }
  let kg = 0;
  for (const [id, rows] of groups) {
    const kind = exercises.find((exercise) => exercise.id === id)?.kind === 'bw_lift' ? 'bw_lift' : 'lift';
    kg += volume(rows, kind, bodyweightKg);
  }
  return Math.round(kg * 1000) / 1000;
}

export function workingTonnes(sets: readonly SetRow[], exercises: readonly Exercise[], bodyweightKg: number | null): number {
  return Math.round(workingKg(sets, exercises, bodyweightKg) / 100) / 10;
}
