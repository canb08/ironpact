import type { Exercise, Readiness, SetRow, Uuid } from './types.ts';
import { exerciseOrder, type SessionHistory } from './prefill.ts';
import { suggestsMin } from './validate.ts';

// §2 F13 / §1.6 D9 / §10 E2.2. Stored 1–3; MIN when the sum is ≤5. Skip suggests nothing.
// AC13.3: first 2 exercises × 2 sets at 90%, rounded down to a loadable weight.
const DEFAULT_BAR_KG = 20;
const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];

export interface ReadinessCheck {
  sum: number | null;
  suggestMin: boolean;
}

export function readinessCheck(readiness: Readiness | null): ReadinessCheck {
  if (readiness == null) return { sum: null, suggestMin: false };
  return {
    sum: readiness.sleep + readiness.soreness + readiness.energy,
    suggestMin: suggestsMin(readiness),
  };
}

export interface DoMinSet {
  set_index: number;
  weight_kg: number;
  reps: number;
  rpe: null;
  is_warmup: false;
}

export interface DoMinBlock {
  exercise_id: Uuid;
  sets: readonly [DoMinSet, DoMinSet];
}

export interface DoMinPlan {
  mode: 'min';
  blocks: readonly DoMinBlock[];
}

function kilos(kg: number): number {
  return Math.round(kg * 1000);
}

/** Greatest barbell load ≤ kg. Plates are unlimited pairs; the bar is the floor. */
export function roundDownLoadable(kg: number, barKg = DEFAULT_BAR_KG, platesKg: readonly number[] = DEFAULT_PLATES_KG): number {
  if (!Number.isFinite(kg) || kg <= 0 || !Number.isFinite(barKg) || barKg < 0) return 0;
  const target = kilos(kg);
  const bar = kilos(barKg);
  if (target < bar) return 0;
  const plates = [...new Set(platesKg.filter((plate) => plate > 0).map(kilos))].sort((a, b) => b - a);
  const perSide = Math.floor((target - bar) / 2);
  if (plates.length === 0 || perSide === 0) return bar / 1000;
  const reachable = new Uint8Array(perSide + 1);
  reachable[0] = 1;
  for (let weight = 0; weight <= perSide; weight += 1) {
    if (reachable[weight] !== 1) continue;
    for (const plate of plates) {
      const next = weight + plate;
      if (next <= perSide) reachable[next] = 1;
    }
  }
  let best = 0;
  for (let weight = perSide; weight >= 0; weight -= 1) {
    if (reachable[weight] === 1) {
      best = weight;
      break;
    }
  }
  return (bar + 2 * best) / 1000;
}

export function roundDownStep(kg: number, step: number): number {
  if (!Number.isFinite(kg) || !Number.isFinite(step) || step <= 0) return 0;
  const scaled = Math.round(kg * 1000) / 1000;
  return Math.round(Math.floor((scaled + 1e-9) / step) * step * 1000) / 1000;
}

function atNinety(kg: number): number {
  return Math.round(kg * 0.9 * 1000) / 1000;
}

function loadOf(kg: number, exercise: Exercise, barKg: number, platesKg: readonly number[]): number {
  const target = atNinety(kg);
  if (exercise.kind === 'bw_lift' || target < barKg) return roundDownStep(target, exercise.increment_kg);
  return roundDownLoadable(target, barKg, platesKg);
}

/**
 * Do MIN. The plan is built here; it does not write a session. Fewer than two
 * exercises in the last gym session yields fewer blocks, never an invented one.
 */
export function doMinPlan(input: SessionHistory & {
  exercises: readonly Exercise[];
  barKg?: number;
  platesKg?: readonly number[];
}): DoMinPlan {
  const barKg = input.barKg ?? DEFAULT_BAR_KG;
  const platesKg = input.platesKg ?? DEFAULT_PLATES_KG;
  const sessions = input.sessions
    .filter((session) => session.user_id === input.userId && session.deleted_at === null
      && session.kind === 'gym' && session.id !== input.excludeSessionId)
    .sort((a, b) => b.started_at.localeCompare(a.started_at) || b.id.localeCompare(a.id));
  const blocks: DoMinBlock[] = [];
  for (const session of sessions) {
    const sets = input.sets.filter((set) => set.session_id === session.id && set.deleted_at === null);
    if (sets.length === 0) continue;
    for (const exerciseId of exerciseOrder(sets)) {
      if (blocks.length === 2) break;
      const exercise = input.exercises.find((row) => row.id === exerciseId && row.deleted_at === null);
      const working = sets
        .filter((set) => set.exercise_id === exerciseId && !set.is_warmup)
        .sort((a, b) => a.set_index - b.set_index || a.logged_at.localeCompare(b.logged_at));
      const first = working[0];
      if (exercise == null || first == null) continue;
      const second = working[1] ?? first;
      const toSet = (set: SetRow, setIndex: number): DoMinSet => ({
        set_index: setIndex,
        weight_kg: loadOf(set.weight_kg, exercise, barKg, platesKg),
        reps: set.reps,
        rpe: null,
        is_warmup: false,
      });
      blocks.push({ exercise_id: exerciseId, sets: [toSet(first, 1), toSet(second, 2)] });
    }
    break;
  }
  return { mode: 'min', blocks };
}
