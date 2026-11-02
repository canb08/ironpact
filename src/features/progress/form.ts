import type { Readiness } from '../../core/types.ts';
import type { WriteError } from '../../data/adapter.ts';
import {
  disciplineSchema, instantSchema, localDateSchema, martialEntrySchema, uiSchemas,
} from '../../core/validate.ts';
import { copy, fill } from '../../ui/copy.ts';
import { codePoints, parseDecimal, parseDuration, parseInteger } from './parse.ts';

function world(valid: boolean): string | null {
  return valid ? null : copy.outOfRange;
}

export function parseRest(text: string): { error: string | null; rest: number | null } {
  const rest = parseInteger(text);
  if (rest === null || rest < 15 || rest > 600) return { error: copy.restRange, rest: null };
  return { error: null, rest };
}

export interface SessionDraft {
  date: string;
  note: string;
  startedAt: string;
  endedAt: string;
  sleep: string;
  soreness: string;
  energy: string;
}

export function sessionNoteText(note: string): { text: string | null; over: boolean; count: number } {
  const trimmed = note.trim();
  const count = codePoints(trimmed);
  return { text: trimmed === '' ? null : trimmed, over: count > 200, count };
}

function score(value: string): 1 | 2 | 3 | null {
  if (value === '1') return 1;
  if (value === '2') return 2;
  if (value === '3') return 3;
  return null;
}

export function parseSession(draft: SessionDraft): {
  errors: { date: string | null; startedAt: string | null; endedAt: string | null; readiness: string | null };
  noteOver: boolean;
  noteCount: number;
  patch: {
    local_date: string;
    note: string | null;
    started_at: string;
    ended_at: string | null;
    readiness: Readiness | null;
  } | null;
} {
  const note = sessionNoteText(draft.note);
  const dateOk = localDateSchema.safeParse(draft.date).success;
  const startedOk = instantSchema.safeParse(draft.startedAt).success;
  const endedEmpty = draft.endedAt.trim() === '';
  const endedOk = endedEmpty || instantSchema.safeParse(draft.endedAt.trim()).success;
  const sleep = score(draft.sleep.trim());
  const soreness = score(draft.soreness.trim());
  const energy = score(draft.energy.trim());
  const blank = draft.sleep.trim() === '' && draft.soreness.trim() === '' && draft.energy.trim() === '';
  const readiness: Readiness | null = sleep && soreness && energy ? { sleep, soreness, energy } : null;
  const readinessError = blank || readiness !== null ? null : copy.readinessRange;
  const errors = {
    date: dateOk ? null : copy.badDate,
    startedAt: startedOk ? null : copy.badInstant,
    endedAt: endedOk ? null : copy.badInstant,
    readiness: readinessError,
  };
  const patch = dateOk && startedOk && endedOk && readinessError === null && !note.over
    ? {
      local_date: draft.date,
      note: note.text,
      started_at: draft.startedAt.trim(),
      ended_at: endedEmpty ? null : draft.endedAt.trim(),
      readiness,
    }
    : null;
  return { errors, noteOver: note.over, noteCount: note.count, patch };
}

export interface RunDraft { km: string; duration: string; note: string; rpe: number | null }

export function parseRun(draft: RunDraft): {
  errors: { distance: string | null; duration: string | null; rpe: string | null };
  noteOver: boolean;
  noteCount: number;
  value: { distance_m: number; duration_s: number; note: string | null; rpe: number | null } | null;
} {
  const km = parseDecimal(draft.km);
  const meters = km === null ? null : Math.round(km * 1000);
  const seconds = parseDuration(draft.duration);
  const note = draft.note.trim();
  const noteCount = codePoints(note);
  const noteOver = noteCount > 120;
  const rpeOk = draft.rpe === null || uiSchemas.rpe.safeParse(draft.rpe).success;
  const errors = {
    distance: world(km !== null && meters !== null && uiSchemas.run_km.safeParse(km).success && uiSchemas.distance_m.safeParse(meters).success),
    duration: world(seconds !== null && uiSchemas.duration_s.safeParse(seconds).success),
    rpe: rpeOk ? null : copy.outOfRange,
  };
  const value = errors.distance === null && errors.duration === null && errors.rpe === null && !noteOver && meters !== null && seconds !== null
    ? { distance_m: meters, duration_s: seconds, note: note === '' ? null : note, rpe: draft.rpe }
    : null;
  return { errors, noteOver, noteCount, value };
}

export interface SetDraft { kg: string; reps: string; note: string; rpe: number | null; warmup: boolean }

export function parseSet(draft: SetDraft, kind: 'lift' | 'bw_lift'): {
  errors: { kg: string | null; reps: string | null; rpe: string | null };
  noteOver: boolean;
  noteCount: number;
  value: { weight_kg: number; reps: number; note: string | null; rpe: number | null; is_warmup: boolean } | null;
} {
  const kg = parseDecimal(draft.kg);
  const reps = parseInteger(draft.reps);
  const schema = kind === 'bw_lift' ? uiSchemas.added_kg : uiSchemas.lift_kg;
  const note = draft.note.trim();
  const noteCount = codePoints(note);
  const noteOver = noteCount > 120;
  const rpeOk = draft.rpe === null || uiSchemas.rpe.safeParse(draft.rpe).success;
  const errors = {
    kg: world(kg !== null && schema.safeParse(kg).success),
    reps: world(reps !== null && uiSchemas.reps.safeParse(reps).success),
    rpe: rpeOk ? null : copy.outOfRange,
  };
  const value = errors.kg === null && errors.reps === null && errors.rpe === null && !noteOver && kg !== null && reps !== null
    ? { weight_kg: kg, reps, note: note === '' ? null : note, rpe: draft.rpe, is_warmup: draft.warmup }
    : null;
  return { errors, noteOver, noteCount, value };
}

export interface MartialDraft { discipline: string; minutes: string; rounds: string; note: string; rpe: number | null }

export function parseMartial(draft: MartialDraft): {
  errors: { discipline: string | null; minutes: string | null; rounds: string | null; rpe: string | null };
  noteOver: boolean;
  noteCount: number;
  value: { discipline: string; duration_min: number; rounds: number | null; note: string | null; rpe: number | null } | null;
} {
  const discipline = draft.discipline.trim();
  const points = codePoints(discipline);
  const disciplineError = points < 1 || points > 16
    ? copy.keepTo16
    : disciplineSchema.safeParse(discipline).success ? null : copy.disciplineInvalid;
  const minutes = parseInteger(draft.minutes);
  const roundsBlank = draft.rounds.trim() === '';
  const rounds = roundsBlank ? null : parseInteger(draft.rounds);
  const note = draft.note.trim();
  const noteCount = codePoints(note);
  const noteOver = noteCount > 120;
  const rpeOk = draft.rpe === null || uiSchemas.rpe.safeParse(draft.rpe).success;
  const errors = {
    discipline: disciplineError,
    minutes: world(minutes !== null && uiSchemas.duration_min.safeParse(minutes).success),
    rounds: roundsBlank || (rounds !== null && martialEntrySchema.shape.rounds.safeParse(rounds).success) ? null : copy.outOfRange,
    rpe: rpeOk ? null : copy.outOfRange,
  };
  const value = errors.discipline === null && errors.minutes === null && errors.rounds === null && errors.rpe === null && !noteOver && minutes !== null
    ? { discipline, duration_min: minutes, rounds, note: note === '' ? null : note, rpe: draft.rpe }
    : null;
  return { errors, noteOver, noteCount, value };
}

export interface MinDraft { description: string; minutes: string }

export function parseMin(draft: MinDraft): {
  errors: { description: string | null; minutes: string | null };
  value: { description: string; duration_min: number | null } | null;
} {
  const description = draft.description.trim();
  const points = codePoints(description);
  const minutesBlank = draft.minutes.trim() === '';
  const minutes = minutesBlank ? null : parseInteger(draft.minutes);
  const errors = {
    description: points >= 1 && points <= 40 ? null : copy.keepTo40,
    minutes: minutesBlank || (minutes !== null && uiSchemas.duration_min.safeParse(minutes).success) ? null : copy.outOfRange,
  };
  const value = errors.description === null && errors.minutes === null
    ? { description, duration_min: minutes }
    : null;
  return { errors, value };
}

export interface WeightDraft { kg: string; measuredAt: string; date: string }

export function parseWeight(draft: WeightDraft): {
  errors: { kg: string | null; measuredAt: string | null; date: string | null };
  value: { weight_kg: number; measured_at: string; local_date: string } | null;
} {
  const kg = parseDecimal(draft.kg);
  const measured = draft.measuredAt.trim();
  const errors = {
    kg: world(kg !== null && uiSchemas.bodyweight_kg.safeParse(kg).success),
    measuredAt: instantSchema.safeParse(measured).success ? null : copy.badInstant,
    date: localDateSchema.safeParse(draft.date).success ? null : copy.badDate,
  };
  const value = errors.kg === null && errors.measuredAt === null && errors.date === null && kg !== null
    ? { weight_kg: kg, measured_at: measured, local_date: draft.date }
    : null;
  return { errors, value };
}

export function noteCountLabel(count: number, max: 120 | 200): string {
  return max === 200 ? fill(copy.sessionNoteCount, { count }) : fill(copy.noteCount, { count });
}

export function writeErrorCopy(error: WriteError): string {
  if (error === 'storage_full') return copy.storageFull;
  if (error === 'world_record') return copy.outOfRange;
  if (error === 'session_already_open') return copy.openSession;
  return copy.sessionSaveError;
}

